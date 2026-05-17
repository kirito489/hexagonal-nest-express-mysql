import bcrypt from 'bcrypt';
import request from 'supertest';
import { NestExpressApplication } from '@nestjs/platform-express';
import { createE2EApp, createMockRedis } from './test-app';

// ──────────────────────────────────────────────
// Mock 資料
// ──────────────────────────────────────────────
const TEST_PASSWORD = 'TestPass123!';
const TEST_HASH = bcrypt.hashSync(TEST_PASSWORD, 1);
const MEMBER_UUID = '00000000-0000-0000-0000-000000000001';
const ROLE_UUID = '00000000-0000-0000-0000-000000000010';

const MEMBER_RECORD_BASE = {
  id: MEMBER_UUID,
  email: 'test@example.com',
  member: 'Test User',
  password: TEST_HASH,
  roleId: ROLE_UUID,
  status: true,
  isDefault: false,
  lastPasswordChange: null,
  createdAt: new Date('2024-01-01T00:00:00.000Z'),
  updatedAt: new Date('2024-01-01T00:00:00.000Z'),
  lastLoginAt: null,
  role: {
    name: 'member',
    permissions: [
      { permission: { permissionCode: 'BACKEND:ACCOUNT:VIEW', status: true } },
    ],
  },
};

const MEMBER_RECORD = { ...MEMBER_RECORD_BASE };
const DISABLED_MEMBER_RECORD = { ...MEMBER_RECORD_BASE, status: false };

const mockPrisma = {
  $connect: jest.fn(),
  $disconnect: jest.fn(),
  memberRecord: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    upsert: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({}),
  },
  role: {
    findFirstOrThrow: jest.fn().mockResolvedValue({
      id: ROLE_UUID,
      name: 'member',
      isDefault: true,
      status: true,
    }),
  },
};

const mockRedis = createMockRedis();

// ──────────────────────────────────────────────
// E2E Test Suite
// ──────────────────────────────────────────────
describe('Auth E2E', () => {
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
  });

  // ── POST /api/auth/login ──────────────────

  describe('POST /api/auth/login', () => {
    it('正確憑證 → 200 + 雙 token + roleName', async () => {
      mockPrisma.memberRecord.findUnique.mockResolvedValue(MEMBER_RECORD);

      const response = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'test@example.com', password: TEST_PASSWORD });

      expect(response.status).toBe(200);
      const body = response.body as {
        data: {
          accessToken: string;
          refreshToken: string;
          accessTokenExpiresIn: number;
          refreshTokenExpiresIn: number;
          member: {
            id: string;
            email: string;
            member: string;
            roleName: string;
          };
        };
      };
      expect(typeof body.data.accessToken).toBe('string');
      expect(typeof body.data.refreshToken).toBe('string');
      expect(body.data.accessTokenExpiresIn).toBeGreaterThan(0);
      expect(body.data.refreshTokenExpiresIn).toBeGreaterThan(0);
      expect(body.data.member.roleName).toBe('member');
    });

    it('登入成功 → 觸發 memberRecord.update 寫入 lastLoginAt', async () => {
      mockPrisma.memberRecord.findUnique.mockResolvedValue(MEMBER_RECORD);
      mockPrisma.memberRecord.update.mockClear();

      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'test@example.com', password: TEST_PASSWORD });

      // 等 fire-and-forget 的 Promise tick 跑完
      await new Promise((r) => setImmediate(r));

      const updateCalls = mockPrisma.memberRecord.update.mock.calls;
      const lastLoginUpdate = updateCalls.find(
        (call) =>
          (call[0] as { data?: { lastLoginAt?: unknown } })?.data
            ?.lastLoginAt !== undefined,
      );
      expect(lastLoginUpdate).toBeDefined();
    });

    it('無效 email 格式 → 400 Zod 驗證錯誤', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'not-an-email', password: 'any' });

      expect(response.status).toBe(400);
    });

    it('使用者不存在 → 401', async () => {
      mockPrisma.memberRecord.findUnique.mockResolvedValue(null);

      const response = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'nobody@example.com', password: 'any' });

      expect(response.status).toBe(401);
    });

    it('密碼錯誤 → 401', async () => {
      mockPrisma.memberRecord.findUnique.mockResolvedValue(MEMBER_RECORD);

      const response = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'test@example.com', password: 'wrong-password' });

      expect(response.status).toBe(401);
    });

    it('帳號停用 → 403 ACCOUNT_DISABLED', async () => {
      mockPrisma.memberRecord.findUnique.mockResolvedValue(
        DISABLED_MEMBER_RECORD,
      );

      const response = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'test@example.com', password: TEST_PASSWORD });

      expect(response.status).toBe(403);
      const body = response.body as { code: string };
      expect(body.code).toBe('ACCOUNT_DISABLED');
    });
  });

  // ── GET /api/members（需 JWT）────────────

  describe('GET /api/members', () => {
    it('無 JWT → 401', async () => {
      const response = await request(app.getHttpServer()).get(
        '/api/members?email=test@example.com',
      );
      expect(response.status).toBe(401);
    });
  });

  // ── POST /api/auth/logout ─────────────────

  describe('POST /api/auth/logout', () => {
    it('無 JWT → 401', async () => {
      const response = await request(app.getHttpServer()).post(
        '/api/auth/logout',
      );
      expect(response.status).toBe(401);
    });

    it('完整流程：login → logout → 204 + access token 加入黑名單', async () => {
      mockPrisma.memberRecord.findUnique.mockResolvedValue(MEMBER_RECORD);
      const loginRes = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'test@example.com', password: TEST_PASSWORD });
      expect(loginRes.status).toBe(200);
      const { accessToken, refreshToken } = (
        loginRes.body as { data: { accessToken: string; refreshToken: string } }
      ).data;

      mockPrisma.memberRecord.findFirst.mockResolvedValue(MEMBER_RECORD);
      const logoutRes = await request(app.getHttpServer())
        .post('/api/auth/logout')
        .set('authorization', `Bearer ${accessToken}`)
        .send({ refreshToken });

      expect(logoutRes.status).toBe(204);
      expect(mockRedis.addToBlacklist).toHaveBeenCalledWith(
        accessToken,
        expect.any(Number),
      );
      expect(mockRedis.addToBlacklist).toHaveBeenCalledWith(
        refreshToken,
        expect.any(Number),
      );
    });
  });

  // ── POST /api/auth/refresh ─────────────────

  describe('POST /api/auth/refresh', () => {
    it('有效 refresh token → 200 + 新 access token', async () => {
      mockPrisma.memberRecord.findUnique.mockResolvedValue(MEMBER_RECORD);
      const loginRes = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'test@example.com', password: TEST_PASSWORD });
      const { refreshToken } = (
        loginRes.body as { data: { refreshToken: string } }
      ).data;

      mockPrisma.memberRecord.findFirst.mockResolvedValue(MEMBER_RECORD);
      const refreshRes = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken });

      expect(refreshRes.status).toBe(200);
      const body = refreshRes.body as {
        data: { accessToken: string; accessTokenExpiresIn: number };
      };
      expect(typeof body.data.accessToken).toBe('string');
      expect(body.data.accessTokenExpiresIn).toBeGreaterThan(0);
    });

    it('缺少 refreshToken → 400', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({});
      expect(res.status).toBe(400);
    });

    it('無效 refresh token → 401 INVALID_REFRESH_TOKEN', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken: 'not-a-valid-jwt' });
      expect(res.status).toBe(401);
      expect((res.body as { code: string }).code).toBe('INVALID_REFRESH_TOKEN');
    });

    it('以 access token 呼叫 → 401 INVALID_REFRESH_TOKEN', async () => {
      mockPrisma.memberRecord.findUnique.mockResolvedValue(MEMBER_RECORD);
      const loginRes = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'test@example.com', password: TEST_PASSWORD });
      const { accessToken } = (
        loginRes.body as { data: { accessToken: string } }
      ).data;

      const res = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken: accessToken });
      expect(res.status).toBe(401);
      expect((res.body as { code: string }).code).toBe('INVALID_REFRESH_TOKEN');
    });

    it('refresh token 在黑名單 → 401 INVALID_REFRESH_TOKEN', async () => {
      mockPrisma.memberRecord.findUnique.mockResolvedValue(MEMBER_RECORD);
      const loginRes = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'test@example.com', password: TEST_PASSWORD });
      const { refreshToken } = (
        loginRes.body as { data: { refreshToken: string } }
      ).data;

      mockRedis.isTokenBlacklisted.mockResolvedValue(true);

      const res = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken });
      expect(res.status).toBe(401);
      expect((res.body as { code: string }).code).toBe('INVALID_REFRESH_TOKEN');
    });

    it('帳號停用 → 403 ACCOUNT_DISABLED', async () => {
      mockPrisma.memberRecord.findUnique.mockResolvedValue(MEMBER_RECORD);
      const loginRes = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'test@example.com', password: TEST_PASSWORD });
      const { refreshToken } = (
        loginRes.body as { data: { refreshToken: string } }
      ).data;

      mockPrisma.memberRecord.findFirst.mockResolvedValue(
        DISABLED_MEMBER_RECORD,
      );

      const res = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken });
      expect(res.status).toBe(403);
      expect((res.body as { code: string }).code).toBe('ACCOUNT_DISABLED');
    });
  });

  // ── Rate Limiting ────────────────────────────

  describe('Rate Limiting', () => {
    it('超過速率限制 → 429', async () => {
      mockRedis.throttleIncrement.mockResolvedValue(101); // 超過 limit=100

      const response = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'test@example.com', password: 'any' });

      expect(response.status).toBe(429);
    });
  });
});
