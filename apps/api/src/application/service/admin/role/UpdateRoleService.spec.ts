import { UpdateRoleService } from './UpdateRoleService';
import {
  RoleRecord,
  RoleRepositoryPort,
} from '../../../port/out/role/RoleRepositoryPort';
import { PermissionRepositoryPort } from '../../../port/out/role/PermissionRepositoryPort';
import { LoadMemberPort } from '../../../port/out/member/LoadMemberPort';
import { ClearMemberContextPort } from '../../../port/out/member/ClearMemberContextPort';
import { RoleNotFoundException } from '@app/domain/exception/RoleNotFoundException';
import { DefaultRoleNotEditableException } from '@app/domain/exception/DefaultRoleNotEditableException';
import { DuplicateRoleNameException } from '@app/domain/exception/DuplicateRoleNameException';

const ROLE_ID = '00000000-0000-4000-8000-000000000001';

const makeRole = (overrides: Partial<RoleRecord> = {}): RoleRecord => ({
  id: ROLE_ID,
  name: '管理者',
  status: true,
  isDefault: false,
  memberCount: 0,
  createdAt: new Date('2024-01-01T00:00:00.000Z'),
  updatedAt: new Date('2024-01-01T00:00:00.000Z'),
  ...overrides,
});

const mockRoleRepo = {
  listRoles: jest.fn(),
  findById: jest.fn(),
  findByName: jest.fn(),
  create: jest.fn(),
  createWithPermissions: jest.fn(),
  updateWithPermissions: jest.fn(),
  softDelete: jest.fn(),
  countMembers: jest.fn(),
} as jest.Mocked<RoleRepositoryPort>;

const mockPermissionRepo = {
  findAll: jest.fn(),
  findByCodes: jest.fn(),
  getPermissionsByRoleId: jest.fn(),
  replacePermissions: jest.fn(),
} as jest.Mocked<PermissionRepositoryPort>;

const mockLoadMember = {
  loadMemberByEmail: jest.fn(),
  loadMemberById: jest.fn(),
  loadMemberDomainById: jest.fn(),
  listMembers: jest.fn(),
  existsByEmail: jest.fn(),
  findMemberIdsByRoleId: jest.fn().mockResolvedValue([]),
} as unknown as jest.Mocked<LoadMemberPort>;

const mockClearMemberContext = {
  clearMemberContext: jest.fn(),
  clearMany: jest.fn(),
} as jest.Mocked<ClearMemberContextPort>;

const makeService = () =>
  new UpdateRoleService(
    mockRoleRepo,
    mockPermissionRepo,
    mockLoadMember,
    mockClearMemberContext,
  );

beforeEach(() => {
  jest.clearAllMocks();
  // clearAllMocks 不清 implementation，但會清掉 mockResolvedValue 之外的呼叫紀錄；
  // 預設回傳要在此重設，否則某支測試設的值會洩漏到下一支
  mockLoadMember.findMemberIdsByRoleId.mockResolvedValue([]);
});

describe('UpdateRoleService', () => {
  it('僅切換 status：repo 收到 (id, undefined, undefined, false)', async () => {
    mockRoleRepo.findById.mockResolvedValue(makeRole());

    await makeService().execute({ id: ROLE_ID, status: false });

    expect(mockRoleRepo.updateWithPermissions).toHaveBeenCalledWith(
      ROLE_ID,
      undefined,
      undefined,
      false,
    );
    expect(mockRoleRepo.findByName).not.toHaveBeenCalled();
    expect(mockPermissionRepo.findByCodes).not.toHaveBeenCalled();
  });

  it('name + status：repo 收到 (id, name, undefined, status)', async () => {
    mockRoleRepo.findById.mockResolvedValue(makeRole());
    mockRoleRepo.findByName.mockResolvedValue(null);

    await makeService().execute({
      id: ROLE_ID,
      name: '審核人員',
      status: false,
    });

    expect(mockRoleRepo.findByName).toHaveBeenCalledWith('審核人員');
    expect(mockRoleRepo.updateWithPermissions).toHaveBeenCalledWith(
      ROLE_ID,
      '審核人員',
      undefined,
      false,
    );
  });

  it('status + permissionCodes：validatePermissions 被呼叫且 repo 收到所有三項', async () => {
    mockRoleRepo.findById.mockResolvedValue(makeRole());
    mockPermissionRepo.findByCodes.mockResolvedValue([
      {
        permissionCode: 'BACKEND:ROLE:VIEW',
        name: '檢視角色',
        platform: 'BACKEND',
        module: 'ROLE',
        action: 'VIEW',
      },
    ]);

    await makeService().execute({
      id: ROLE_ID,
      status: true,
      permissionCodes: ['BACKEND:ROLE:VIEW'],
    });

    expect(mockPermissionRepo.findByCodes).toHaveBeenCalledWith([
      'BACKEND:ROLE:VIEW',
    ]);
    expect(mockRoleRepo.updateWithPermissions).toHaveBeenCalledWith(
      ROLE_ID,
      undefined,
      ['BACKEND:ROLE:VIEW'],
      true,
    );
  });

  it('預設角色 + status：丟 DefaultRoleNotEditableException，repo 不會被呼叫', async () => {
    mockRoleRepo.findById.mockResolvedValue(makeRole({ isDefault: true }));

    await expect(
      makeService().execute({ id: ROLE_ID, status: false }),
    ).rejects.toBeInstanceOf(DefaultRoleNotEditableException);

    expect(mockRoleRepo.updateWithPermissions).not.toHaveBeenCalled();
  });

  it('找不到角色：丟 RoleNotFoundException', async () => {
    mockRoleRepo.findById.mockResolvedValue(null);

    await expect(
      makeService().execute({ id: ROLE_ID, status: false }),
    ).rejects.toBeInstanceOf(RoleNotFoundException);

    expect(mockRoleRepo.updateWithPermissions).not.toHaveBeenCalled();
  });

  it('名稱衝突：丟 DuplicateRoleNameException', async () => {
    mockRoleRepo.findById.mockResolvedValue(makeRole());
    mockRoleRepo.findByName.mockResolvedValue(
      makeRole({ id: 'other-id', name: '審核人員' }),
    );

    await expect(
      makeService().execute({ id: ROLE_ID, name: '審核人員' }),
    ).rejects.toBeInstanceOf(DuplicateRoleNameException);

    expect(mockRoleRepo.updateWithPermissions).not.toHaveBeenCalled();
  });

  it('純 name 更新時 status 為 undefined，repo 收到 (id, name, undefined, undefined)', async () => {
    mockRoleRepo.findById.mockResolvedValue(makeRole());
    mockRoleRepo.findByName.mockResolvedValue(null);

    await makeService().execute({ id: ROLE_ID, name: '審核人員' });

    expect(mockRoleRepo.updateWithPermissions).toHaveBeenCalledWith(
      ROLE_ID,
      '審核人員',
      undefined,
      undefined,
    );
  });

  // MemberContext 快取帶 permissions 且效期 PERMISSION_CACHE_TTL（預設 300 秒）。
  // 不清的話，撤銷一個權限最多要等一個效期才生效，而 DB 與畫面都顯示已撤銷。
  describe('授權變更後的快取一致性', () => {
    it('清除該角色全體成員的快取', async () => {
      mockRoleRepo.findById.mockResolvedValue(makeRole());
      mockLoadMember.findMemberIdsByRoleId.mockResolvedValue(['m1', 'm2']);

      await makeService().execute({
        id: ROLE_ID,
        permissionCodes: [],
      });

      expect(mockLoadMember.findMemberIdsByRoleId).toHaveBeenCalledWith(
        ROLE_ID,
      );
      expect(mockClearMemberContext.clearMany).toHaveBeenCalledWith([
        'm1',
        'm2',
      ]);
    });

    // 一律清、不判斷「這次改的是不是授權」：判斷要比對前後的權限集合，
    // 而寫錯的方向是該清沒清
    it('只改名稱也要清——不判斷這次改的是不是授權', async () => {
      mockRoleRepo.findById.mockResolvedValue(makeRole());
      mockRoleRepo.findByName.mockResolvedValue(null);
      mockLoadMember.findMemberIdsByRoleId.mockResolvedValue(['m1']);

      await makeService().execute({ id: ROLE_ID, name: '審核人員' });

      expect(mockClearMemberContext.clearMany).toHaveBeenCalledWith(['m1']);
    });

    it('角色沒有成員時仍呼叫，帶空陣列', async () => {
      mockRoleRepo.findById.mockResolvedValue(makeRole());

      await makeService().execute({ id: ROLE_ID, status: false });

      expect(mockClearMemberContext.clearMany).toHaveBeenCalledWith([]);
    });

    // 清除失敗的語意是「權限改了但沒有生效」——回報成功會讓呼叫端
    // 處於一個他不知道的狀態，而管理員會以為撤銷已經完成
    it('清除失敗時整個操作失敗，不得靜默成功', async () => {
      mockRoleRepo.findById.mockResolvedValue(makeRole());
      mockLoadMember.findMemberIdsByRoleId.mockResolvedValue(['m1']);
      mockClearMemberContext.clearMany.mockRejectedValueOnce(
        new Error('Redis down'),
      );

      await expect(
        makeService().execute({ id: ROLE_ID, permissionCodes: [] }),
      ).rejects.toThrow('Redis down');
    });

    // 驗證順序：先寫入再清快取。反過來的話，清完到寫入之間的請求
    // 會重新填入舊值，於是清了等於沒清
    it('先寫入資料庫，再清快取', async () => {
      mockRoleRepo.findById.mockResolvedValue(makeRole());
      mockLoadMember.findMemberIdsByRoleId.mockResolvedValue(['m1']);

      await makeService().execute({ id: ROLE_ID, permissionCodes: [] });

      const writeOrder =
        mockRoleRepo.updateWithPermissions.mock.invocationCallOrder[0];
      const clearOrder =
        mockClearMemberContext.clearMany.mock.invocationCallOrder[0];
      expect(writeOrder).toBeLessThan(clearOrder);
    });
  });
});
