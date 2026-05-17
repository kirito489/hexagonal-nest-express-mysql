import bcrypt from 'bcrypt';
import request from 'supertest';
import { NestExpressApplication } from '@nestjs/platform-express';
import { createE2EApp, createMockRedis } from './test-app';

// ──────────────────────────────────────────────
// Mock 資料
// ──────────────────────────────────────────────
const TEST_PASSWORD = 'TestPass123!';
const TEST_HASH = bcrypt.hashSync(TEST_PASSWORD, 1);
const AUTH_UUID = '00000000-0000-4000-8000-000000000001';
const ROLE_UUID = '00000000-0000-4000-8000-000000000002';
const TARGET_ROLE_UUID = '00000000-0000-4000-8000-000000000003';
const PERM_UUID = '00000000-0000-4000-8000-000000000004';

/** 擁有 ROLE VIEW + EDIT 權限的測試管理員 */
const AUTH_MEMBER = {
  id: AUTH_UUID,
  email: 'auth@example.com',
  member: 'Auth User',
  password: TEST_HASH,
  roleId: ROLE_UUID,
  status: true,
  isDefault: false,
  failedLoginCount: 0,
  lockedAt: null,
  lastPasswordChange: null,
  createdAt: new Date('2024-01-01T00:00:00.000Z'),
  updatedAt: new Date('2024-01-01T00:00:00.000Z'),
  lastLoginAt: null,
  role: {
    name: 'admin',
    permissions: [
      { permission: { permissionCode: 'BACKEND:ROLE:VIEW', status: true } },
      { permission: { permissionCode: 'BACKEND:ROLE:EDIT', status: true } },
    ],
  },
};

const TARGET_ROLE = {
  id: TARGET_ROLE_UUID,
  name: '管理者',
  status: true,
  isDefault: false,
  roleCode: null,
  deletedAt: null,
  createdAt: new Date('2024-01-01T00:00:00.000Z'),
  updatedAt: new Date('2024-01-01T00:00:00.000Z'),
};

const TARGET_PERMISSION = {
  id: PERM_UUID,
  permissionCode: 'BACKEND:ROLE:VIEW',
  name: '後台-角色與權限管理-檢視',
  platform: 'BACKEND',
  module: 'ROLE',
  subModule: null,
  action: 'VIEW',
  status: true,
};

const mockPrisma = {
  $connect: jest.fn(),
  $disconnect: jest.fn(),
  $transaction: jest.fn(),
  memberRecord: {
    findUnique: jest.fn().mockResolvedValue(AUTH_MEMBER),
    findFirst: jest.fn().mockResolvedValue(AUTH_MEMBER),
    count: jest.fn().mockResolvedValue(0),
  },
  role: {
    findFirstOrThrow: jest.fn().mockResolvedValue({
      id: ROLE_UUID,
      name: 'admin',
      isDefault: true,
      status: true,
    }),
    findMany: jest.fn().mockResolvedValue([TARGET_ROLE]),
    findFirst: jest.fn(),
    findUnique: jest.fn().mockResolvedValue(TARGET_ROLE),
    count: jest.fn().mockResolvedValue(1),
    create: jest.fn().mockResolvedValue(TARGET_ROLE),
    update: jest.fn().mockResolvedValue(TARGET_ROLE),
  },
  permission: {
    findMany: jest.fn().mockResolvedValue([TARGET_PERMISSION]),
    findFirst: jest.fn().mockResolvedValue(TARGET_PERMISSION),
  },
  rolePermission: {
    findMany: jest.fn().mockResolvedValue([]),
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    createMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
};

const mockRedis = createMockRedis();

let app: NestExpressApplication;

beforeAll(async () => {
  ({ app } = await createE2EApp({ prisma: mockPrisma, redis: mockRedis }));
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  jest.clearAllMocks();
  mockRedis.get.mockResolvedValue(null);
  mockRedis.isTokenBlacklisted.mockResolvedValue(false);
  mockRedis.throttleIncrement.mockResolvedValue(1);
  mockPrisma.memberRecord.findUnique.mockResolvedValue(AUTH_MEMBER);
  mockPrisma.memberRecord.findFirst.mockResolvedValue(AUTH_MEMBER);
  mockPrisma.role.findUnique.mockResolvedValue(TARGET_ROLE);
  mockPrisma.role.update.mockResolvedValue(TARGET_ROLE);
  // $transaction 同時支援陣列形式與 callback 形式
  mockPrisma.$transaction.mockImplementation(
    async (arg: unknown[] | ((tx: unknown) => Promise<unknown>)) => {
      if (typeof arg === 'function') return arg(mockPrisma);
      return Promise.all(arg as Promise<unknown>[]);
    },
  );
});

// ──────────────────────────────────────────────
// Helper：取得 access token
// ──────────────────────────────────────────────
const getToken = async (): Promise<string> => {
  const res = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ email: 'auth@example.com', password: TEST_PASSWORD });
  return (res.body as { data: { accessToken: string } }).data.accessToken;
};

// ──────────────────────────────────────────────
// GET /api/roles
// ──────────────────────────────────────────────
describe('GET /api/roles', () => {
  it('回傳角色列表 → 200', async () => {
    const token = await getToken();
    mockPrisma.$transaction.mockResolvedValueOnce([[TARGET_ROLE], 1]);

    const res = await request(app.getHttpServer())
      .get('/api/roles')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const body = res.body as {
      data: { list: Array<{ name: string }>; meta: { total: number } };
    };
    expect(body.data.list).toHaveLength(1);
    expect(body.data.list[0].name).toBe('管理者');
    expect(body.data.meta.total).toBe(1);
  });

  it('無 token → 401', async () => {
    const res = await request(app.getHttpServer()).get('/api/roles');
    expect(res.status).toBe(401);
  });
});

// ──────────────────────────────────────────────
// GET /api/roles/permissions
// ──────────────────────────────────────────────
describe('GET /api/roles/permissions', () => {
  it('回傳可用 permission 清單 → 200', async () => {
    const token = await getToken();
    mockPrisma.permission.findMany.mockResolvedValue([TARGET_PERMISSION]);

    const res = await request(app.getHttpServer())
      .get('/api/roles/permissions')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const body = res.body as {
      data: Array<{ permissionCode: string }>;
    };
    expect(body.data).toHaveLength(1);
    expect(body.data[0].permissionCode).toBe('BACKEND:ROLE:VIEW');
  });
});

// ──────────────────────────────────────────────
// POST /api/roles
// ──────────────────────────────────────────────
describe('POST /api/roles', () => {
  it('建立成功 → 201', async () => {
    const token = await getToken();
    mockPrisma.role.findFirst.mockResolvedValue(null); // 名稱無衝突
    mockPrisma.permission.findMany.mockResolvedValue([]);
    mockPrisma.role.create.mockResolvedValue(TARGET_ROLE);

    const res = await request(app.getHttpServer())
      .post('/api/roles')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: '管理者', permissionCodes: [] });

    expect(res.status).toBe(201);
    const body = res.body as { data: { id: string } };
    expect(body.data.id).toBe(TARGET_ROLE_UUID);
  });

  it('名稱衝突 → 409 DUPLICATE_ROLE_NAME', async () => {
    const token = await getToken();
    mockPrisma.role.findFirst.mockResolvedValue(TARGET_ROLE); // 名稱已存在

    const res = await request(app.getHttpServer())
      .post('/api/roles')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: '管理者', permissionCodes: [] });

    expect(res.status).toBe(409);
    expect((res.body as { code: string }).code).toBe('DUPLICATE_ROLE_NAME');
  });

  it('EDIT 缺少對應 VIEW → 400 INVALID_PERMISSION_COMBINATION', async () => {
    const token = await getToken();
    mockPrisma.role.findFirst.mockResolvedValue(null);
    mockPrisma.permission.findMany.mockResolvedValue([
      {
        ...TARGET_PERMISSION,
        permissionCode: 'BACKEND:ROLE:EDIT',
        action: 'EDIT',
      },
    ]);

    const res = await request(app.getHttpServer())
      .post('/api/roles')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: '新角色', permissionCodes: ['BACKEND:ROLE:EDIT'] });

    expect(res.status).toBe(400);
    expect((res.body as { code: string }).code).toBe(
      'INVALID_PERMISSION_COMBINATION',
    );
  });
});

// ──────────────────────────────────────────────
// GET /api/roles/:id
// ──────────────────────────────────────────────
describe('GET /api/roles/:id', () => {
  it('回傳角色詳情 → 200', async () => {
    const token = await getToken();
    mockPrisma.role.findFirst.mockResolvedValue(TARGET_ROLE);
    mockPrisma.rolePermission.findMany.mockResolvedValue([
      { permission: { permissionCode: 'BACKEND:ROLE:VIEW' } },
    ]);

    const res = await request(app.getHttpServer())
      .get(`/api/roles/${TARGET_ROLE_UUID}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const body = res.body as {
      data: { id: string; name: string; permissionCodes: string[] };
    };
    expect(body.data.id).toBe(TARGET_ROLE_UUID);
    expect(body.data.name).toBe('管理者');
    expect(body.data.permissionCodes).toContain('BACKEND:ROLE:VIEW');
  });

  it('角色不存在 → 404 ROLE_NOT_FOUND', async () => {
    const token = await getToken();
    mockPrisma.role.findFirst.mockResolvedValue(null);

    const res = await request(app.getHttpServer())
      .get(`/api/roles/${TARGET_ROLE_UUID}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect((res.body as { code: string }).code).toBe('ROLE_NOT_FOUND');
  });
});

// ──────────────────────────────────────────────
// PATCH /api/roles/:id
// ──────────────────────────────────────────────
describe('PATCH /api/roles/:id', () => {
  it('更新成功 → 204', async () => {
    const token = await getToken();
    mockPrisma.role.findFirst
      .mockResolvedValueOnce(TARGET_ROLE) // findById
      .mockResolvedValueOnce(null); // findByName（無衝突）
    mockPrisma.permission.findMany.mockResolvedValue([]);

    const res = await request(app.getHttpServer())
      .patch(`/api/roles/${TARGET_ROLE_UUID}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: '新名稱', permissionCodes: [] });

    expect(res.status).toBe(204);
  });

  it('預設角色不可編輯 → 400 DEFAULT_ROLE_NOT_EDITABLE', async () => {
    const token = await getToken();
    mockPrisma.role.findFirst.mockResolvedValue({
      ...TARGET_ROLE,
      isDefault: true,
    });

    const res = await request(app.getHttpServer())
      .patch(`/api/roles/${TARGET_ROLE_UUID}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: '新名稱', permissionCodes: [] });

    expect(res.status).toBe(400);
    expect((res.body as { code: string }).code).toBe(
      'DEFAULT_ROLE_NOT_EDITABLE',
    );
  });

  it('角色不存在 → 404 ROLE_NOT_FOUND', async () => {
    const token = await getToken();
    mockPrisma.role.findFirst.mockResolvedValue(null);

    const res = await request(app.getHttpServer())
      .patch(`/api/roles/${TARGET_ROLE_UUID}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: '新名稱', permissionCodes: [] });

    expect(res.status).toBe(404);
    expect((res.body as { code: string }).code).toBe('ROLE_NOT_FOUND');
  });

  it('僅送 status → 204 且 role.update 收到 { status }', async () => {
    const token = await getToken();
    mockPrisma.role.findFirst.mockResolvedValue(TARGET_ROLE);

    const res = await request(app.getHttpServer())
      .patch(`/api/roles/${TARGET_ROLE_UUID}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: false });

    expect(res.status).toBe(204);
    expect(mockPrisma.role.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: TARGET_ROLE_UUID },
        data: { status: false },
      }),
    );
    // 沒送 permissionCodes 時不應動到 rolePermission
    expect(mockPrisma.rolePermission.deleteMany).not.toHaveBeenCalled();
  });

  it('name + status 同送 → 204 且 role.update data 同時含 name 與 status', async () => {
    const token = await getToken();
    mockPrisma.role.findFirst
      .mockResolvedValueOnce(TARGET_ROLE) // findById
      .mockResolvedValueOnce(null); // findByName（無衝突）

    const res = await request(app.getHttpServer())
      .patch(`/api/roles/${TARGET_ROLE_UUID}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: '審核人員', status: false });

    expect(res.status).toBe(204);
    expect(mockPrisma.role.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: TARGET_ROLE_UUID },
        data: { name: '審核人員', status: false },
      }),
    );
  });

  it('status 型別錯誤（非 boolean）→ 400', async () => {
    const token = await getToken();
    mockPrisma.role.findFirst.mockResolvedValue(TARGET_ROLE);

    const res = await request(app.getHttpServer())
      .patch(`/api/roles/${TARGET_ROLE_UUID}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'off' });

    expect(res.status).toBe(400);
  });

  it('預設角色僅切 status → 400 DEFAULT_ROLE_NOT_EDITABLE', async () => {
    const token = await getToken();
    mockPrisma.role.findFirst.mockResolvedValue({
      ...TARGET_ROLE,
      isDefault: true,
    });

    const res = await request(app.getHttpServer())
      .patch(`/api/roles/${TARGET_ROLE_UUID}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: false });

    expect(res.status).toBe(400);
    expect((res.body as { code: string }).code).toBe(
      'DEFAULT_ROLE_NOT_EDITABLE',
    );
  });
});

// ──────────────────────────────────────────────
// DELETE /api/roles/:id
// ──────────────────────────────────────────────
describe('DELETE /api/roles/:id', () => {
  it('軟刪除成功 → 204', async () => {
    const token = await getToken();
    mockPrisma.role.findFirst.mockResolvedValue(TARGET_ROLE);
    mockPrisma.memberRecord.count.mockResolvedValue(0);

    const res = await request(app.getHttpServer())
      .delete(`/api/roles/${TARGET_ROLE_UUID}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(204);
  });

  it('軟刪除時對 name 加 suffix 釋放 unique 約束', async () => {
    const token = await getToken();
    mockPrisma.role.findFirst.mockResolvedValue(TARGET_ROLE);
    mockPrisma.memberRecord.count.mockResolvedValue(0);

    await request(app.getHttpServer())
      .delete(`/api/roles/${TARGET_ROLE_UUID}`)
      .set('Authorization', `Bearer ${token}`);

    // softDelete 用「原 name + ts + 4-byte random hex」格式 mangle，釋放 name @unique
    expect(mockPrisma.role.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: TARGET_ROLE_UUID },
        data: expect.objectContaining({
          name: expect.stringMatching(/^管理者_\d+_[a-f0-9]{8}$/) as string,
          deletedAt: expect.any(Date) as Date,
        }),
      }),
    );
  });

  it('預設角色不可刪除 → 400 DEFAULT_ROLE_NOT_DELETABLE', async () => {
    const token = await getToken();
    mockPrisma.role.findFirst.mockResolvedValue({
      ...TARGET_ROLE,
      isDefault: true,
    });

    const res = await request(app.getHttpServer())
      .delete(`/api/roles/${TARGET_ROLE_UUID}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
    expect((res.body as { code: string }).code).toBe(
      'DEFAULT_ROLE_NOT_DELETABLE',
    );
  });

  it('角色仍有成員 → 409 ROLE_HAS_MEMBERS', async () => {
    const token = await getToken();
    mockPrisma.role.findFirst.mockResolvedValue(TARGET_ROLE);
    mockPrisma.memberRecord.count.mockResolvedValue(2);

    const res = await request(app.getHttpServer())
      .delete(`/api/roles/${TARGET_ROLE_UUID}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(409);
    expect((res.body as { code: string }).code).toBe('ROLE_HAS_MEMBERS');
  });
});
