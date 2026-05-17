import bcrypt from 'bcrypt';
import request from 'supertest';
import { NestExpressApplication } from '@nestjs/platform-express';
import { createE2EApp, createMockRedis } from './test-app';

// ──────────────────────────────────────────────
// Mock 資料
// ──────────────────────────────────────────────
const TEST_PASSWORD = 'TestPass123!';
const TEST_HASH = bcrypt.hashSync(TEST_PASSWORD, 1);
const ADMIN_UUID = '00000000-0000-4000-8000-000000000001';
const ROLE_UUID = '00000000-0000-4000-8000-000000000010';

const ADMIN_RECORD = {
  id: ADMIN_UUID,
  email: 'admin@test.com',
  member: 'Admin',
  password: TEST_HASH,
  roleId: ROLE_UUID,
  status: true,
  isDefault: false,
  lockedAt: null,
  failedLoginCount: 0,
  lastPasswordChange: null,
  createdAt: new Date('2024-01-01T00:00:00.000Z'),
  updatedAt: new Date('2024-01-01T00:00:00.000Z'),
  lastLoginAt: null,
  role: {
    name: '管理者',
    roleCode: 'SUPERADMIN',
    permissions: [
      {
        permission: {
          permissionCode: 'BACKEND:ACCOUNT:VIEW',
          status: true,
        },
      },
    ],
  },
};

const mockPrisma = {
  $connect: jest.fn(),
  $disconnect: jest.fn(),
  memberRecord: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    upsert: jest.fn().mockResolvedValue({}),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    update: jest.fn().mockResolvedValue({}),
  },
  role: {
    findFirstOrThrow: jest.fn().mockResolvedValue({
      id: ROLE_UUID,
      name: 'ADMIN',
      isDefault: false,
      status: true,
    }),
  },
  ipWhitelistRecord: {
    findUnique: jest.fn().mockResolvedValue(null),
    findMany: jest.fn().mockResolvedValue([]),
    upsert: jest.fn().mockResolvedValue({}),
    delete: jest.fn().mockResolvedValue({}),
  },
  ipBlacklistRecord: {
    findUnique: jest.fn().mockResolvedValue(null),
    findMany: jest.fn().mockResolvedValue([]),
    upsert: jest.fn().mockResolvedValue({}),
    delete: jest.fn().mockResolvedValue({}),
  },
  authLogRecord: {
    create: jest.fn().mockResolvedValue({}),
  },
  passwordResetTokenRecord: {
    create: jest.fn().mockResolvedValue({}),
    findUnique: jest.fn().mockResolvedValue(null),
    update: jest.fn().mockResolvedValue({}),
  },
};

const mockRedis = createMockRedis();

// ──────────────────────────────────────────────
// Helper：取得 JWT token
// ──────────────────────────────────────────────
const getAdminToken = async (app: NestExpressApplication): Promise<string> => {
  mockPrisma.memberRecord.findUnique.mockResolvedValue(ADMIN_RECORD);

  const res = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ email: 'admin@test.com', password: TEST_PASSWORD });

  return (res.body as { data: { accessToken: string } }).data.accessToken;
};

// ──────────────────────────────────────────────
// E2E Test Suite
// ──────────────────────────────────────────────
describe('Security E2E', () => {
  let app: NestExpressApplication;
  let token: string;

  beforeAll(async () => {
    ({ app } = await createE2EApp({ prisma: mockPrisma, redis: mockRedis }));
    token = await getAdminToken(app);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockRedis.get.mockResolvedValue(null);
    mockRedis.isTokenBlacklisted.mockResolvedValue(false);
    mockRedis.throttleIncrement.mockResolvedValue(1);
    mockPrisma.memberRecord.findUnique.mockResolvedValue(ADMIN_RECORD);
    mockPrisma.memberRecord.findFirst.mockResolvedValue(ADMIN_RECORD);
  });

  // ── IP 白名單 ──────────────────────────────

  describe('GET /api/security/ip-whitelist', () => {
    it('Admin JWT → 200 + 回傳列表', async () => {
      mockPrisma.ipWhitelistRecord.findMany.mockResolvedValue([
        {
          id: '1',
          ipAddress: '1.2.3.4',
          description: 'test',
          createdAt: new Date(),
        },
      ]);

      const res = await request(app.getHttpServer())
        .get('/api/security/ip-whitelist')
        .set('authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect((res.body as { data: unknown[] }).data).toHaveLength(1);
    });

    it('無 JWT → 401', async () => {
      const res = await request(app.getHttpServer()).get(
        '/api/security/ip-whitelist',
      );

      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/security/ip-whitelist', () => {
    it('Admin 新增白名單 → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/security/ip-whitelist')
        .set('authorization', `Bearer ${token}`)
        .send({ ip: '10.0.0.1', description: '辦公室' });

      expect(res.status).toBe(201);
      expect(mockPrisma.ipWhitelistRecord.upsert).toHaveBeenCalled();
    });

    it('缺少 ip → 400', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/security/ip-whitelist')
        .set('authorization', `Bearer ${token}`)
        .send({});

      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /api/security/ip-whitelist/:ip', () => {
    it('Admin 移除白名單 → 204', async () => {
      const res = await request(app.getHttpServer())
        .delete('/api/security/ip-whitelist/10.0.0.1')
        .set('authorization', `Bearer ${token}`);

      expect(res.status).toBe(204);
    });
  });

  // ── IP 黑名單 ──────────────────────────────

  describe('GET /api/security/ip-blacklist', () => {
    it('Admin JWT → 200', async () => {
      mockPrisma.ipBlacklistRecord.findMany.mockResolvedValue([]);

      const res = await request(app.getHttpServer())
        .get('/api/security/ip-blacklist')
        .set('authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
    });
  });

  describe('POST /api/security/ip-blacklist', () => {
    it('Admin 新增黑名單 → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/security/ip-blacklist')
        .set('authorization', `Bearer ${token}`)
        .send({ ip: '192.168.1.100', reason: '惡意攻擊' });

      expect(res.status).toBe(201);
      expect(mockPrisma.ipBlacklistRecord.upsert).toHaveBeenCalled();
    });
  });

  describe('DELETE /api/security/ip-blacklist/:ip', () => {
    it('Admin 移除黑名單 → 204', async () => {
      const res = await request(app.getHttpServer())
        .delete('/api/security/ip-blacklist/192.168.1.100')
        .set('authorization', `Bearer ${token}`);

      expect(res.status).toBe(204);
    });
  });

  // ── 帳號解鎖 ───────────────────────────────

  describe('POST /api/security/unlock-account', () => {
    it('Admin 解鎖帳號 → 200', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/security/unlock-account')
        .set('authorization', `Bearer ${token}`)
        .send({ email: 'locked@test.com' });

      expect(res.status).toBe(200);
      expect(mockPrisma.memberRecord.updateMany).toHaveBeenCalledWith({
        where: { email: 'locked@test.com' },
        data: { failedLoginCount: 0, lockedAt: null },
      });
    });

    it('缺少 email → 400', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/security/unlock-account')
        .set('authorization', `Bearer ${token}`)
        .send({});

      expect(res.status).toBe(400);
    });

    it('無效 email 格式 → 400', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/security/unlock-account')
        .set('authorization', `Bearer ${token}`)
        .send({ email: 'not-email' });

      expect(res.status).toBe(400);
    });
  });

  // ── Auth: forgot-password / reset-password ─

  describe('POST /api/auth/forgot-password', () => {
    it('已註冊 email → 200（不洩漏帳號是否存在）', async () => {
      mockPrisma.memberRecord.findUnique.mockResolvedValueOnce(ADMIN_RECORD);

      const res = await request(app.getHttpServer())
        .post('/api/auth/forgot-password')
        .send({ email: 'admin@test.com' });

      expect(res.status).toBe(200);
      const body = res.body as { data: { message: string } };
      expect(body.data.message).toContain('收到密碼重設信件');
    });

    it('不存在 email → 200（同樣回傳成功）', async () => {
      mockPrisma.memberRecord.findUnique.mockResolvedValueOnce(null);

      const res = await request(app.getHttpServer())
        .post('/api/auth/forgot-password')
        .send({ email: 'nobody@test.com' });

      expect(res.status).toBe(200);
    });

    it('缺少 email → 400', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/forgot-password')
        .send({});

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/auth/reset-password', () => {
    it('無效 token → 400', async () => {
      // 新的 atomic claim：找不到符合條件的 token 時 Prisma 丟 P2025
      const p2025 = Object.assign(new Error('Record not found'), {
        code: 'P2025',
      });
      mockPrisma.passwordResetTokenRecord.update.mockRejectedValueOnce(p2025);

      const res = await request(app.getHttpServer())
        .post('/api/auth/reset-password')
        .send({ token: 'invalid-token', newPassword: 'NewPass123!' });

      expect(res.status).toBe(400);
    });

    it('缺少參數 → 400', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/reset-password')
        .send({});

      expect(res.status).toBe(400);
    });
  });
});
