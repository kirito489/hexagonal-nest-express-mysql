import { UnlockAccountService } from './SecurityServices';
import { LoadMemberPort } from '../../../port/out/member/LoadMemberPort';
import { AccountLockPort } from '../../../port/out/auth/AccountLockPort';
import { Member } from '@app/domain/model/Member';
import { EmailNotFoundException } from '@app/domain/exception/EmailNotFoundException';
import { AccountNotLockedException } from '@app/domain/exception/AccountNotLockedException';

const MEMBER_ID = '00000000-0000-4000-8000-000000000001';
const ROLE_ID = '00000000-0000-4000-8000-000000000010';
const EMAIL = 'target@test.com';

const makeMember = (): Member =>
  Member.reconstitute(
    MEMBER_ID,
    EMAIL,
    'Target',
    '$2b$10$hashed',
    ROLE_ID,
    true,
    false,
    new Date('2024-01-01T00:00:00.000Z'),
    'admin',
  );

const mockLoadMember = {
  loadMemberByEmail: jest.fn(),
  loadMemberById: jest.fn(),
  loadMemberDomainById: jest.fn(),
  listMembers: jest.fn(),
  existsByEmail: jest.fn(),
} as jest.Mocked<LoadMemberPort>;

const mockAccountLock = {
  recordFailedLogin: jest.fn(),
  resetFailedLogin: jest.fn(),
  checkLock: jest.fn(),
  lockAccount: jest.fn(),
  unlockAccount: jest.fn(),
} as jest.Mocked<AccountLockPort>;

const makeService = () =>
  new UnlockAccountService(mockLoadMember, mockAccountLock);

describe('UnlockAccountService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('email 存在 + 帳號已鎖 → 呼叫 unlockAccount', async () => {
    mockLoadMember.loadMemberByEmail.mockResolvedValue(makeMember());
    mockAccountLock.checkLock.mockResolvedValue('LOCKED');

    await makeService().execute(EMAIL);

    expect(mockLoadMember.loadMemberByEmail).toHaveBeenCalledWith(EMAIL);
    expect(mockAccountLock.checkLock).toHaveBeenCalledWith(EMAIL);
    expect(mockAccountLock.unlockAccount).toHaveBeenCalledWith(EMAIL);
    expect(mockAccountLock.unlockAccount).toHaveBeenCalledTimes(1);
  });

  // 已逾時但沒人碰過的帳號：lockedAt 仍有值、Redis 計數也可能還在，
  // 而清掉那些殘留正是管理員按下解鎖時的意圖。只認 LOCKED 會讓它回 409
  // 說「沒被鎖」，但列表與 lockedAt 都顯示它鎖著——兩邊互相矛盾。
  it('帳號已逾時但尚未清除 → 仍然解鎖，不拋 AccountNotLockedException', async () => {
    mockLoadMember.loadMemberByEmail.mockResolvedValue(makeMember());
    mockAccountLock.checkLock.mockResolvedValue('EXPIRED');

    await makeService().execute(EMAIL);

    expect(mockAccountLock.unlockAccount).toHaveBeenCalledWith(EMAIL);
  });

  it('email 不存在 → 拋 EmailNotFoundException，不查狀態 / 不解鎖', async () => {
    mockLoadMember.loadMemberByEmail.mockResolvedValue(null);

    await expect(makeService().execute(EMAIL)).rejects.toBeInstanceOf(
      EmailNotFoundException,
    );
    expect(mockAccountLock.checkLock).not.toHaveBeenCalled();
    expect(mockAccountLock.unlockAccount).not.toHaveBeenCalled();
  });

  it('email 存在但未鎖 → 拋 AccountNotLockedException，不解鎖', async () => {
    mockLoadMember.loadMemberByEmail.mockResolvedValue(makeMember());
    mockAccountLock.checkLock.mockResolvedValue('NONE');

    await expect(makeService().execute(EMAIL)).rejects.toBeInstanceOf(
      AccountNotLockedException,
    );
    expect(mockAccountLock.unlockAccount).not.toHaveBeenCalled();
  });
});
