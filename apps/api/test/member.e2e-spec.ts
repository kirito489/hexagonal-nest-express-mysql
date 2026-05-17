import bcrypt from 'bcrypt';
import request from 'supertest';
import { NestExpressApplication } from '@nestjs/platform-express';
import { createE2EApp, createMockRedis } from './test-app';

// ──────────────────────────────────────────────
// Mock 資料
// ──────────────────────────────────────────────
const TEST_PASSWORD = 'TestPass123!';
const TEST_HASH = bcrypt.hashSync(TEST_PASSWORD, 1);

// Zod v4 的 z.string().uuid() 要求合法的 RFC 4122 格式（含版本位元 + 變體位元）
const AUTH_UUID = '00000000-0000-4000-8000-000000000001';
const TARGET_UUID = '00000000-0000-4000-8000-000000000002';
const ROLE_UUID = '00000000-0000-4000-8000-000000000010';
const NO_PERM_UUID = '00000000-0000-4000-8000-000000000099';
const NO_PERM_ROLE_UUID = '00000000-0000-4000-8000-000000000020';

const makeDate = () => new Date('2024-01-01T00:00:00.000Z');

const AUTH_MEMBER_DB = {
  id: AUTH_UUID,
  email: 'auth@example.com',
  member: 'Auth User',
  password: TEST_HASH,
  roleId: ROLE_UUID,
  status: true,
  isDefault: true,
  lastPasswordChange: null,
  createdAt: makeDate(),
  updatedAt: makeDate(),
  lastLoginAt: null,
  role: {
    name: 'admin',
    permissions: [
      { permission: { permissionCode: 'BACKEND:ACCOUNT:VIEW', status: true } },
      { permission: { permissionCode: 'BACKEND:ACCOUNT:EDIT', status: true } },
    ],
  },
};

const TARGET_MEMBER_DB = {
  id: TARGET_UUID,
  email: 'target@example.com',
  member: 'Target User',
  password: 'hashed',
  roleId: ROLE_UUID,
  status: true,
  isDefault: false,
  lastPasswordChange: null,
  createdAt: makeDate(),
  updatedAt: makeDate(),
  lastLoginAt: null,
  role: { name: 'admin', permissions: [] },
};

const NO_PERM_MEMBER_DB = {
  id: NO_PERM_UUID,
  email: 'noperm@example.com',
  member: 'No Perm',
  password: TEST_HASH,
  roleId: NO_PERM_ROLE_UUID,
  status: true,
  isDefault: false,
  lastPasswordChange: null,
  createdAt: makeDate(),
  updatedAt: makeDate(),
  lastLoginAt: null,
  role: { name: 'guest', permissions: [] },
};

const mockPrisma = {
  $connect: jest.fn(),
  $disconnect: jest.fn(),
  $transaction: jest.fn().mockImplementation((arg: unknown) => {
    if (typeof arg === 'function')
      return (arg as (tx: unknown) => unknown)(mockPrisma);
    return Promise.all(arg as Promise<unknown>[]);
  }),
  memberRecord: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
    create: jest.fn().mockResolvedValue({}),
    upsert: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({}),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
  },
  role: {
    findFirstOrThrow: jest.fn().mockResolvedValue({
      id: ROLE_UUID,
      name: 'admin',
      isDefault: true,
      status: true,
    }),
    findFirst: jest.fn().mockResolvedValue({ id: ROLE_UUID, name: 'admin' }),
    findMany: jest
      .fn()
      .mockResolvedValue([{ id: ROLE_UUID, name: 'admin', roleCode: null }]),
    count: jest.fn().mockResolvedValue(1),
  },
};

const mockRedis = createMockRedis();

async function loginAndGetToken(app: NestExpressApplication): Promise<string> {
  mockPrisma.memberRecord.findUnique.mockResolvedValueOnce(AUTH_MEMBER_DB);
  const res = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ email: 'auth@example.com', password: TEST_PASSWORD });
  return (res.body as { data: { accessToken: string } }).data.accessToken;
}

async function loginAsNoPerm(app: NestExpressApplication): Promise<string> {
  mockPrisma.memberRecord.findUnique.mockResolvedValueOnce(NO_PERM_MEMBER_DB);
  const res = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ email: 'noperm@example.com', password: TEST_PASSWORD });
  return (res.body as { data: { accessToken: string } }).data.accessToken;
}

// ──────────────────────────────────────────────
// E2E Test Suite
// ──────────────────────────────────────────────
describe('Member E2E', () => {
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
    mockPrisma.memberRecord.findUnique.mockResolvedValue(AUTH_MEMBER_DB);
    mockPrisma.memberRecord.findFirst.mockResolvedValue(AUTH_MEMBER_DB);
    mockPrisma.memberRecord.findMany.mockResolvedValue([]);
    mockPrisma.memberRecord.count.mockResolvedValue(0);
    mockPrisma.memberRecord.create.mockResolvedValue({});
    mockPrisma.memberRecord.upsert.mockResolvedValue({});
    mockPrisma.memberRecord.update.mockResolvedValue({});
    mockPrisma.memberRecord.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.role.findFirst.mockResolvedValue({
      id: ROLE_UUID,
      name: 'admin',
    });
    mockPrisma.role.findMany.mockResolvedValue([
      { id: ROLE_UUID, name: 'admin', roleCode: null },
    ]);
    mockPrisma.role.count.mockResolvedValue(1);
    mockPrisma.$transaction.mockImplementation((arg: unknown) => {
      if (typeof arg === 'function')
        return (arg as (tx: unknown) => unknown)(mockPrisma);
      return Promise.all(arg as Promise<unknown>[]);
    });
  });

  // ── GET /api/members ───────────────────────

  describe('GET /api/members', () => {
    it('無 JWT → 401', async () => {
      const res = await request(app.getHttpServer()).get('/api/members');
      expect(res.status).toBe(401);
    });

    it('有 JWT + VIEW 權限 → 200 + 列表', async () => {
      const token = await loginAndGetToken(app);
      mockPrisma.memberRecord.findMany.mockResolvedValue([TARGET_MEMBER_DB]);
      mockPrisma.memberRecord.count.mockResolvedValue(1);

      const res = await request(app.getHttpServer())
        .get('/api/members')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      const body = res.body as { data: { list: unknown[]; meta: unknown } };
      expect(body.data.list).toHaveLength(1);
    });

    it('無 ACCOUNT:VIEW 權限 → 403', async () => {
      const token = await loginAsNoPerm(app);
      mockPrisma.memberRecord.findFirst.mockResolvedValue(NO_PERM_MEMBER_DB);

      const res = await request(app.getHttpServer())
        .get('/api/members')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
    });

    it('status=true → 200 且 prisma.findMany where 含 status: true', async () => {
      const token = await loginAndGetToken(app);

      const res = await request(app.getHttpServer())
        .get('/api/members?status=true')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(mockPrisma.memberRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: true }),
        }),
      );
    });

    it('status=false → 200 且 prisma.findMany where 含 status: false', async () => {
      const token = await loginAndGetToken(app);

      const res = await request(app.getHttpServer())
        .get('/api/members?status=false')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(mockPrisma.memberRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: false }),
        }),
      );
    });

    it('未帶 status → where 不含 status key', async () => {
      const token = await loginAndGetToken(app);

      await request(app.getHttpServer())
        .get('/api/members')
        .set('Authorization', `Bearer ${token}`);

      const call = mockPrisma.memberRecord.findMany.mock.calls[0]?.[0] as {
        where: Record<string, unknown>;
      };
      expect('status' in call.where).toBe(false);
    });

    it('status=foo (非合法 enum) → 400', async () => {
      const token = await loginAndGetToken(app);

      const res = await request(app.getHttpServer())
        .get('/api/members?status=foo')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(400);
    });
  });

  // ── GET /api/members/role/options ──────────

  describe('GET /api/members/role/options', () => {
    it('無 JWT → 401', async () => {
      const res = await request(app.getHttpServer()).get(
        '/api/members/role/options',
      );
      expect(res.status).toBe(401);
    });

    it('預設分頁 → 200 + { list, meta }', async () => {
      const token = await loginAndGetToken(app);

      const res = await request(app.getHttpServer())
        .get('/api/members/role/options')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      const body = res.body as {
        data: {
          list: Array<{ id: string; name: string; isAssignable: boolean }>;
          meta: {
            page: number;
            limit: number;
            total: number;
            totalPages: number;
          };
        };
      };
      expect(Array.isArray(body.data.list)).toBe(true);
      expect(body.data.meta.page).toBe(1);
      expect(body.data.meta.limit).toBe(20);
      expect(body.data.meta.total).toBe(1);
      expect(body.data.meta.totalPages).toBe(1);
      expect(body.data.list[0]).toEqual(
        expect.objectContaining({ isAssignable: true }),
      );
    });

    it('roleCode=SUPERADMIN → 回 isAssignable: false', async () => {
      const token = await loginAndGetToken(app);
      mockPrisma.role.findMany.mockResolvedValue([
        { id: ROLE_UUID, name: '管理者', roleCode: 'SUPERADMIN' },
      ]);

      const res = await request(app.getHttpServer())
        .get('/api/members/role/options')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      const body = res.body as {
        data: { list: Array<{ isAssignable: boolean }> };
      };
      expect(body.data.list[0]).toEqual(
        expect.objectContaining({ isAssignable: false }),
      );
    });

    it('指定 page / limit → 200 且 prisma.findMany 收到對應 skip/take', async () => {
      const token = await loginAndGetToken(app);

      const res = await request(app.getHttpServer())
        .get('/api/members/role/options?page=2&limit=10')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(mockPrisma.role.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 10 }),
      );
    });

    it('search 命中 → 200 且 where.name.contains 被帶上', async () => {
      const token = await loginAndGetToken(app);

      const res = await request(app.getHttpServer())
        .get('/api/members/role/options?search=admin')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(mockPrisma.role.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            name: { contains: 'admin' },
          }),
        }),
      );
    });

    it('無 VIEW 權限 → 403', async () => {
      const token = await loginAsNoPerm(app);
      mockPrisma.memberRecord.findFirst.mockResolvedValue(NO_PERM_MEMBER_DB);

      const res = await request(app.getHttpServer())
        .get('/api/members/role/options')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
    });
  });

  // ── GET /api/members/role/options/:id ──────────

  describe('GET /api/members/role/options/:id', () => {
    it('無 JWT → 401', async () => {
      const res = await request(app.getHttpServer()).get(
        `/api/members/role/options/${ROLE_UUID}`,
      );
      expect(res.status).toBe(401);
    });

    it('找到啟用角色 → 200 + { id, name, isAssignable }', async () => {
      const token = await loginAndGetToken(app);
      mockPrisma.role.findFirst.mockResolvedValueOnce({
        id: ROLE_UUID,
        name: 'admin',
        roleCode: null,
      });

      const res = await request(app.getHttpServer())
        .get(`/api/members/role/options/${ROLE_UUID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      const body = res.body as {
        data: { id: string; name: string; isAssignable: boolean };
      };
      expect(body.data).toEqual({
        id: ROLE_UUID,
        name: 'admin',
        isAssignable: true,
      });
    });

    it('角色不存在 / 停用 → 404 ROLE_NOT_FOUND', async () => {
      const token = await loginAndGetToken(app);
      mockPrisma.role.findFirst.mockResolvedValueOnce(null);

      const res = await request(app.getHttpServer())
        .get(`/api/members/role/options/${ROLE_UUID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
      expect((res.body as { code: string }).code).toBe('ROLE_NOT_FOUND');
    });

    it('無 VIEW 權限 → 403', async () => {
      const token = await loginAsNoPerm(app);
      mockPrisma.memberRecord.findFirst.mockResolvedValue(NO_PERM_MEMBER_DB);

      const res = await request(app.getHttpServer())
        .get(`/api/members/role/options/${ROLE_UUID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
    });
  });

  // ── POST /api/members ──────────────────────

  describe('POST /api/members', () => {
    it('無 JWT → 401', async () => {
      const res = await request(app.getHttpServer()).post('/api/members').send({
        email: 'new@example.com',
        member: 'New',
        password: 'StrongPass123!',
        roleId: ROLE_UUID,
      });
      expect(res.status).toBe(401);
    });

    it('有 JWT + EDIT，有效資料 → 201', async () => {
      const token = await loginAndGetToken(app);

      const res = await request(app.getHttpServer())
        .post('/api/members')
        .set('Authorization', `Bearer ${token}`)
        .send({
          email: 'new@example.com',
          member: 'New User',
          password: 'StrongPass123!',
          roleId: ROLE_UUID,
        });

      expect(res.status).toBe(201);
      expect(mockPrisma.memberRecord.create).toHaveBeenCalledTimes(1);
    });

    it('email 已存在 → 409', async () => {
      const token = await loginAndGetToken(app);
      mockPrisma.memberRecord.count.mockResolvedValue(1);

      const res = await request(app.getHttpServer())
        .post('/api/members')
        .set('Authorization', `Bearer ${token}`)
        .send({
          email: 'existing@example.com',
          member: 'Dup',
          password: 'StrongPass123!',
          roleId: ROLE_UUID,
        });

      expect(res.status).toBe(409);
    });

    it('無效 email → 400', async () => {
      const token = await loginAndGetToken(app);

      const res = await request(app.getHttpServer())
        .post('/api/members')
        .set('Authorization', `Bearer ${token}`)
        .send({
          email: 'bad-email',
          member: 'X',
          password: 'StrongPass123!',
          roleId: ROLE_UUID,
        });

      expect(res.status).toBe(400);
    });

    it('無 ACCOUNT:EDIT 權限 → 403', async () => {
      const token = await loginAsNoPerm(app);
      mockPrisma.memberRecord.findFirst.mockResolvedValue(NO_PERM_MEMBER_DB);

      const res = await request(app.getHttpServer())
        .post('/api/members')
        .set('Authorization', `Bearer ${token}`)
        .send({
          email: 'new@example.com',
          member: 'X',
          password: 'StrongPass123!',
          roleId: ROLE_UUID,
        });

      expect(res.status).toBe(403);
    });
  });

  // ── GET /api/members/:id ───────────────────

  describe('GET /api/members/:id', () => {
    it('無 JWT → 401', async () => {
      const res = await request(app.getHttpServer()).get(
        `/api/members/${TARGET_UUID}`,
      );
      expect(res.status).toBe(401);
    });

    it('有 JWT + VIEW，member 存在 → 200', async () => {
      const token = await loginAndGetToken(app);
      mockPrisma.memberRecord.findUnique.mockResolvedValue(TARGET_MEMBER_DB);

      const res = await request(app.getHttpServer())
        .get(`/api/members/${TARGET_UUID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      const body = res.body as { data: { email: string } };
      expect(body.data.email).toBe('target@example.com');
    });

    it('member 不存在 → 404', async () => {
      const token = await loginAndGetToken(app);
      mockPrisma.memberRecord.findUnique.mockResolvedValue(null);

      const res = await request(app.getHttpServer())
        .get(`/api/members/${TARGET_UUID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
    });
  });

  // ── PATCH /api/members/:id ─────────────────

  describe('PATCH /api/members/:id', () => {
    it('無 JWT → 401', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/members/${TARGET_UUID}`)
        .send({
          email: 'target@example.com',
          member: 'Updated',
          roleId: ROLE_UUID,
          status: true,
        });
      expect(res.status).toBe(401);
    });

    it('有 JWT + EDIT，有效資料 → 204', async () => {
      const token = await loginAndGetToken(app);
      mockPrisma.memberRecord.findUnique.mockResolvedValue(TARGET_MEMBER_DB);

      const res = await request(app.getHttpServer())
        .patch(`/api/members/${TARGET_UUID}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          email: 'target@example.com',
          member: 'Updated Name',
          roleId: ROLE_UUID,
          status: true,
        });

      expect(res.status).toBe(204);
    });

    it('member 不存在 → 404', async () => {
      const token = await loginAndGetToken(app);
      mockPrisma.memberRecord.findUnique.mockResolvedValue(null);

      const res = await request(app.getHttpServer())
        .patch(`/api/members/${TARGET_UUID}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          email: 'target@example.com',
          member: 'X',
          roleId: ROLE_UUID,
          status: true,
        });

      expect(res.status).toBe(404);
    });

    it('預設帳號不可編輯 → 409 DEFAULT_MEMBER_NOT_EDITABLE', async () => {
      const token = await loginAndGetToken(app);
      mockPrisma.memberRecord.findUnique.mockResolvedValue({
        ...TARGET_MEMBER_DB,
        isDefault: true,
      });

      const res = await request(app.getHttpServer())
        .patch(`/api/members/${TARGET_UUID}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          email: 'target@example.com',
          member: 'Updated',
          roleId: ROLE_UUID,
          status: true,
        });

      expect(res.status).toBe(409);
      expect((res.body as { code: string }).code).toBe(
        'DEFAULT_MEMBER_NOT_EDITABLE',
      );
    });

    it('成功後清除 MemberContext 快取', async () => {
      const token = await loginAndGetToken(app);
      mockPrisma.memberRecord.findUnique.mockResolvedValue(TARGET_MEMBER_DB);
      mockRedis.del.mockClear();

      const res = await request(app.getHttpServer())
        .patch(`/api/members/${TARGET_UUID}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          email: 'target@example.com',
          member: 'Role Changed',
          roleId: ROLE_UUID,
          status: true,
        });

      expect(res.status).toBe(204);
      const delCalls = mockRedis.del.mock.calls.flat() as string[];
      expect(delCalls.some((key) => key.includes(TARGET_UUID))).toBe(true);
    });

    it('將自己停用 → 409 CANNOT_DISABLE_SELF', async () => {
      const token = await loginAndGetToken(app);

      const res = await request(app.getHttpServer())
        .patch(`/api/members/${AUTH_UUID}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          email: 'auth@example.com',
          member: 'Auth',
          roleId: ROLE_UUID,
          status: false,
        });

      expect(res.status).toBe(409);
      expect((res.body as { code: string }).code).toBe('CANNOT_DISABLE_SELF');
    });

    it('partial body 只送 { status } → 204，不檢查 email 唯一 / 不查 role', async () => {
      const token = await loginAndGetToken(app);
      mockPrisma.memberRecord.findUnique.mockResolvedValue(TARGET_MEMBER_DB);
      mockPrisma.memberRecord.count.mockClear();
      mockPrisma.role.findFirst.mockClear();

      const res = await request(app.getHttpServer())
        .patch(`/api/members/${TARGET_UUID}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: false });

      expect(res.status).toBe(204);
      // 沒給 email → 不應走 existsByEmail（memberRecord.count）；沒給 roleId 也沒換密碼 → 不查 role
      expect(mockPrisma.memberRecord.count).not.toHaveBeenCalled();
      expect(mockPrisma.role.findFirst).not.toHaveBeenCalled();
    });

    it('partial body 只送 { member } → 204，沿用現況 roleId', async () => {
      const token = await loginAndGetToken(app);
      mockPrisma.memberRecord.findUnique.mockResolvedValue(TARGET_MEMBER_DB);

      const res = await request(app.getHttpServer())
        .patch(`/api/members/${TARGET_UUID}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ member: 'Only Name Changed' });

      expect(res.status).toBe(204);
    });
  });

  // ── 停用帳號的 JWT 被拒 ─────────────────────

  describe('停用帳號的 JWT 被拒', () => {
    it('status=false 的帳號 → 403 ACCOUNT_DISABLED', async () => {
      const token = await loginAndGetToken(app);
      // 模擬：下一個請求時 DB 已把該帳號停用
      mockPrisma.memberRecord.findFirst.mockResolvedValueOnce({
        ...AUTH_MEMBER_DB,
        status: false,
      });

      const res = await request(app.getHttpServer())
        .get('/api/members')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect((res.body as { code: string }).code).toBe('ACCOUNT_DISABLED');
    });
  });

  // ── DELETE /api/members/:id ────────────────

  describe('DELETE /api/members/:id', () => {
    it('無 JWT → 401', async () => {
      const res = await request(app.getHttpServer()).delete(
        `/api/members/${TARGET_UUID}`,
      );
      expect(res.status).toBe(401);
    });

    it('有 JWT + EDIT → 204', async () => {
      const token = await loginAndGetToken(app);
      mockPrisma.memberRecord.findUnique.mockResolvedValue(TARGET_MEMBER_DB);

      const res = await request(app.getHttpServer())
        .delete(`/api/members/${TARGET_UUID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(204);
    });

    it('刪除自己 → 409 CANNOT_DELETE_SELF', async () => {
      const token = await loginAndGetToken(app);
      mockPrisma.memberRecord.findUnique.mockResolvedValue(AUTH_MEMBER_DB);

      const res = await request(app.getHttpServer())
        .delete(`/api/members/${AUTH_UUID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(409);
      expect((res.body as { code: string }).code).toBe('CANNOT_DELETE_SELF');
    });

    it('預設帳號不可刪除 → 409 DEFAULT_MEMBER_NOT_DELETABLE', async () => {
      const token = await loginAndGetToken(app);
      mockPrisma.memberRecord.findUnique.mockResolvedValue({
        ...TARGET_MEMBER_DB,
        isDefault: true,
      });

      const res = await request(app.getHttpServer())
        .delete(`/api/members/${TARGET_UUID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(409);
      const body = res.body as { code: string };
      expect(body.code).toBe('DEFAULT_MEMBER_NOT_DELETABLE');
    });
  });
});
