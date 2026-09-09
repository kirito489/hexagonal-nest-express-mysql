import request from 'supertest';
import * as bcrypt from 'bcrypt';
import { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaService } from '@app/infrastructure/prisma/prisma.service';
import { createE2EApp, createMockRedis } from '../setup/test-app';
import { resetDb, seedMember } from '../helpers/db';

const EMAIL = 'front-user@test.com';
const PASSWORD = 'FrontPass123!';
const ADMIN_EMAIL = 'admin@test.com';

type TokenPair = {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; emailVerified: boolean };
};

/**
 * 前台認證 E2E。
 *
 * **重點是兩側 token 的隔離**：那是本 change 的核心決定（各自 secret），
 * 而它只有在真的跑起來、真的拿一側的 token 打另一側時才驗得到。
 */
describe('Front Auth E2E', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const mockRedis = createMockRedis();

  beforeAll(async () => {
    ({ app } = await createE2EApp({ redis: mockRedis }));
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    mockRedis.get.mockResolvedValue(null);
    mockRedis.isTokenBlacklisted.mockResolvedValue(false);
    mockRedis.throttleIncrement.mockResolvedValue(1);
    await resetDb(prisma);
    await prisma.userRecord.deleteMany();
    await prisma.userRecord.create({
      data: {
        email: EMAIL,
        displayName: '前台使用者',
        password: await bcrypt.hash(PASSWORD, 4),
      },
    });
  });

  const login = (body: Record<string, unknown>) =>
    request(app.getHttpServer()).post('/api/front/auth/login').send(body);

  const loginOk = async (): Promise<TokenPair> => {
    const res = await login({ email: EMAIL, password: PASSWORD });
    expect(res.status).toBe(200);
    return (res.body as { data: TokenPair }).data;
  };

  /** 取得一枚後台 token，用來驗證跨側隔離 */
  const adminToken = async (): Promise<string> => {
    await seedMember(prisma, {
      email: ADMIN_EMAIL,
      password: PASSWORD,
      roleName: '管理者',
      roleCode: 'SUPERADMIN',
    });
    const res = await request(app.getHttpServer())
      .post('/api/admin/auth/login')
      .send({ email: ADMIN_EMAIL, password: PASSWORD });
    return (res.body as { data: { accessToken: string } }).data.accessToken;
  };

  describe('POST /api/front/auth/login', () => {
    it('帳密正確 → 200 + token 組與使用者摘要', async () => {
      const data = await loginOk();

      expect(data.accessToken).toBeTruthy();
      expect(data.refreshToken).toBeTruthy();
      expect(data.user.email).toBe(EMAIL);
      expect(data.user.emailVerified).toBe(false);
      // 對外摘要不得洩漏內部欄位
      expect(data.user).not.toHaveProperty('password');
      expect(data.user).not.toHaveProperty('tokenVersion');
    });

    /**
     * `touchLastLogin` 刻意是 fire-and-forget（規格要求它失敗不得阻斷登入），
     * 所以回應送出時那筆寫入可能還沒落庫——**直接讀會是競態**。
     * 用輪詢等它，而不是加一個固定的 sleep：後者要嘛太短而間歇失敗、
     * 要嘛太長而拖慢每一次執行。
     */
    it('登入成功會更新 lastLoginAt', async () => {
      await loginOk();

      let lastLoginAt: Date | null = null;
      for (
        let attempt = 0;
        attempt < 20 && lastLoginAt === null;
        attempt += 1
      ) {
        const row = await prisma.userRecord.findFirst({
          where: { email: EMAIL },
          select: { lastLoginAt: true },
        });
        lastLoginAt = row?.lastLoginAt ?? null;
        if (lastLoginAt === null) {
          await new Promise((resolve) => setTimeout(resolve, 25));
        }
      }

      expect(lastLoginAt).not.toBeNull();
    });

    /** 兩者的回應必須完全相同，否則這支端點就是帳號列舉工具 */
    it('密碼錯誤與帳號不存在 → 401，且回應內容完全相同', async () => {
      const wrongPassword = await login({ email: EMAIL, password: 'nope' });
      const noSuchUser = await login({
        email: 'ghost@test.com',
        password: PASSWORD,
      });

      expect(wrongPassword.status).toBe(401);
      expect(noSuchUser.status).toBe(401);
      expect((wrongPassword.body as { message: string }).message).toBe(
        (noSuchUser.body as { message: string }).message,
      );
    });

    it('帳號已停用 → 403', async () => {
      await prisma.userRecord.updateMany({
        where: { email: EMAIL },
        data: { status: false },
      });

      const res = await login({ email: EMAIL, password: PASSWORD });

      expect(res.status).toBe(403);
    });

    it('軟刪除的帳號 → 401（視為不存在）', async () => {
      await prisma.userRecord.updateMany({
        where: { email: EMAIL },
        data: { deletedAt: new Date() },
      });

      const res = await login({ email: EMAIL, password: PASSWORD });

      expect(res.status).toBe(401);
    });

    it('缺欄位 → 400', async () => {
      const res = await login({ email: EMAIL });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/front/me', () => {
    const me = (token?: string) => {
      const req = request(app.getHttpServer()).get('/api/front/me');
      return token ? req.set('Authorization', `Bearer ${token}`) : req;
    };

    it('帶前台 token → 200', async () => {
      const { accessToken } = await loginOk();

      const res = await me(accessToken);

      expect(res.status).toBe(200);
      expect((res.body as { data: { email: string } }).data.email).toBe(EMAIL);
    });

    it('未帶 token → 401', async () => {
      expect((await me()).status).toBe(401);
    });

    /**
     * 本 change 的核心決定：兩側各用一組 secret。
     * 後台 token 在這裡是**簽章驗不過**，而不是「驗過了但 side 不對」。
     */
    it('帶後台 token → 401（跨側隔離）', async () => {
      const token = await adminToken();

      expect((await me(token)).status).toBe(401);
    });
  });

  describe('POST /api/front/auth/refresh', () => {
    const refresh = (refreshToken: string) =>
      request(app.getHttpServer())
        .post('/api/front/auth/refresh')
        .send({ refreshToken });

    it('有效的 refresh token → 200 + 新 token 組', async () => {
      const { refreshToken } = await loginOk();

      const res = await refresh(refreshToken);

      expect(res.status).toBe(200);
      expect((res.body as { data: TokenPair }).data.accessToken).toBeTruthy();
    });

    it('用 access token 換發 → 401', async () => {
      const { accessToken } = await loginOk();

      expect((await refresh(accessToken)).status).toBe(401);
    });

    it('登出後舊的 refresh token 失效', async () => {
      const { accessToken, refreshToken } = await loginOk();
      await request(app.getHttpServer())
        .post('/api/front/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);

      expect((await refresh(refreshToken)).status).toBe(401);
    });
  });

  describe('POST /api/front/auth/logout', () => {
    it('登出 → 204，且原本的 access token 隨即失效', async () => {
      const { accessToken } = await loginOk();

      await request(app.getHttpServer())
        .post('/api/front/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);

      const after = await request(app.getHttpServer())
        .get('/api/front/me')
        .set('Authorization', `Bearer ${accessToken}`);
      expect(after.status).toBe(401);
    });

    it('未帶 token → 401', async () => {
      const res = await request(app.getHttpServer()).post(
        '/api/front/auth/logout',
      );

      expect(res.status).toBe(401);
    });
  });

  /** 反方向的隔離：前台 token 不得通過後台守衛 */
  describe('跨側隔離（前台 token → 後台端點）', () => {
    it('前台 token 打 /api/admin/roles → 401', async () => {
      const { accessToken } = await loginOk();

      const res = await request(app.getHttpServer())
        .get('/api/admin/roles')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(401);
    });
  });
});
