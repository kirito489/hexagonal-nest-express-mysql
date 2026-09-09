import request from 'supertest';
import { createHash } from 'crypto';
import * as bcrypt from 'bcrypt';
import { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaService } from '@app/infrastructure/prisma/prisma.service';
import { createE2EApp, createMockRedis } from '../setup/test-app';
import { resetDb } from '../helpers/db';

const EMAIL = 'newbie@test.com';
const PASSWORD = 'FrontPass123!';

/**
 * 前台註冊 / 驗證 / 密碼重設 E2E。
 *
 * 重點在兩件只有真的跑起來才驗得到的事：
 * 1. **帳號列舉的防護**——新信箱與已存在的信箱回應必須逐字相同。
 * 2. **token 的 purpose 隔離**——驗證信的 token 不能拿來重設密碼。
 */
describe('Front Registration E2E', () => {
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
    // 信箱節流：increment 回 0 = Redis 不可用 → fail-open，不干擾其他斷言
    mockRedis.increment.mockResolvedValue(0);
    await resetDb(prisma);
    await prisma.userTokenRecord.deleteMany();
    await prisma.userRecord.deleteMany();
  });

  const post = (path: string, body: Record<string, unknown>) =>
    request(app.getHttpServer()).post(`/api/front/auth/${path}`).send(body);

  const registerBody = (email = EMAIL) => ({
    email,
    password: PASSWORD,
    displayName: '新人',
  });

  /**
   * DB 只存 sha256，所以拿不到明文——測試改用「已知明文 → 算雜湊 → 直接寫入」
   * 的方式造 token，繞過信件。
   */
  const seedToken = async (
    userId: string,
    purpose: 'VERIFY_EMAIL' | 'RESET_PASSWORD',
    options: { expired?: boolean; plain?: string } = {},
  ): Promise<string> => {
    const plain = options.plain ?? `plain-${purpose}-${Date.now()}`;
    await prisma.userTokenRecord.create({
      data: {
        userId,
        purpose,
        token: createHash('sha256').update(plain).digest('hex'),
        expiresAt: new Date(Date.now() + (options.expired ? -1000 : 600_000)),
      },
    });
    return plain;
  };

  const seedUser = async (
    overrides: { email?: string; verified?: boolean } = {},
  ) =>
    prisma.userRecord.create({
      data: {
        email: overrides.email ?? EMAIL,
        displayName: '既有使用者',
        password: await bcrypt.hash(PASSWORD, 4),
        emailVerifiedAt: overrides.verified ? new Date() : null,
      },
      select: { id: true },
    });

  describe('POST /register', () => {
    it('新信箱 → 201，建立未驗證帳號', async () => {
      const res = await post('register', registerBody());

      expect(res.status).toBe(201);
      const row = await prisma.userRecord.findFirst({
        where: { email: EMAIL },
        select: { emailVerifiedAt: true },
      });
      expect(row).not.toBeNull();
      expect(row?.emailVerifiedAt).toBeNull();
    });

    /**
     * **這一條是本 change 的核心**：回 409「此信箱已註冊」會讓端點變成
     * 帳號列舉工具。兩種情況的狀態碼與 body 必須逐字相同。
     */
    it('信箱已存在 → 回應與新信箱完全相同，且不新增帳號', async () => {
      const fresh = await post('register', registerBody('first@test.com'));
      await seedUser({ email: 'taken@test.com' });
      const duplicate = await post('register', registerBody('taken@test.com'));

      expect(duplicate.status).toBe(fresh.status);
      expect(duplicate.body).toMatchObject({
        success: true,
        data: (fresh.body as { data: unknown }).data,
      });
      expect(
        await prisma.userRecord.count({ where: { email: 'taken@test.com' } }),
      ).toBe(1);
    });

    it('密碼不符政策 → 400，且不建立帳號', async () => {
      const res = await post('register', {
        ...registerBody(),
        password: 'x',
      });

      expect(res.status).toBe(400);
      expect(await prisma.userRecord.count()).toBe(0);
    });

    it('缺欄位 → 400', async () => {
      expect((await post('register', { email: EMAIL })).status).toBe(400);
    });
  });

  describe('GET /verify-email', () => {
    const verify = (token: string) =>
      request(app.getHttpServer()).get(
        `/api/front/auth/verify-email?token=${token}`,
      );

    it('有效 token → 302 導向 status=success，並寫入 emailVerifiedAt', async () => {
      const user = await seedUser();
      const token = await seedToken(user.id, 'VERIFY_EMAIL');

      const res = await verify(token);

      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('status=success');
      const row = await prisma.userRecord.findFirst({
        where: { id: user.id },
        select: { emailVerifiedAt: true },
      });
      expect(row?.emailVerifiedAt).not.toBeNull();
    });

    it('過期 token → 302 導向 status=invalid（不是 4xx）', async () => {
      const user = await seedUser();
      const token = await seedToken(user.id, 'VERIFY_EMAIL', { expired: true });

      const res = await verify(token);

      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('status=invalid');
    });

    it('同一枚 token 用兩次 → 第二次是 invalid', async () => {
      const user = await seedUser();
      const token = await seedToken(user.id, 'VERIFY_EMAIL');

      await verify(token);
      const second = await verify(token);

      expect(second.headers.location).toContain('status=invalid');
    });
  });

  describe('POST /resend-verification', () => {
    it('未驗證帳號 → 204，舊 token 被作廢', async () => {
      const user = await seedUser();
      await seedToken(user.id, 'VERIFY_EMAIL');

      const res = await post('resend-verification', { email: EMAIL });

      expect(res.status).toBe(204);
      const unused = await prisma.userTokenRecord.count({
        where: { userId: user.id, purpose: 'VERIFY_EMAIL', usedAt: null },
      });
      // 舊的被作廢、新的還在 → 恰好一枚
      expect(unused).toBe(1);
    });

    it.each([
      ['已驗證的帳號', true],
      ['不存在的帳號', null],
    ])('%s → 204 且不產生新 token', async (_name, verified) => {
      if (verified !== null) await seedUser({ verified });

      const res = await post('resend-verification', { email: EMAIL });

      expect(res.status).toBe(204);
      expect(await prisma.userTokenRecord.count()).toBe(0);
    });
  });

  describe('密碼重設', () => {
    it('forgot-password：帳號存在 → 204 並產生 RESET_PASSWORD token', async () => {
      await seedUser();

      const res = await post('forgot-password', { email: EMAIL });

      expect(res.status).toBe(204);
      expect(
        await prisma.userTokenRecord.count({
          where: { purpose: 'RESET_PASSWORD' },
        }),
      ).toBe(1);
    });

    it('forgot-password：帳號不存在 → 同樣 204，不產生 token', async () => {
      const res = await post('forgot-password', { email: 'ghost@test.com' });

      expect(res.status).toBe(204);
      expect(await prisma.userTokenRecord.count()).toBe(0);
    });

    it('reset-password：有效 token → 204，密碼更新且 tokenVersion 遞增', async () => {
      const user = await seedUser();
      const token = await seedToken(user.id, 'RESET_PASSWORD');

      const res = await post('reset-password', {
        token,
        newPassword: 'BrandNew123!',
      });

      expect(res.status).toBe(204);
      const row = await prisma.userRecord.findFirst({
        where: { id: user.id },
        select: { password: true, tokenVersion: true },
      });
      expect(await bcrypt.compare('BrandNew123!', row!.password)).toBe(true);
      // 遞增才能讓攻擊者既有的 session 失效
      expect(row?.tokenVersion).toBe(1);
    });

    /**
     * **purpose 隔離**：少了它，拿驗證信的 token 就能重設密碼——
     * 而驗證信在註冊當下就寄出，取得難度遠低於重設信。
     */
    it('拿 VERIFY_EMAIL 的 token 打 reset-password → 400', async () => {
      const user = await seedUser();
      const token = await seedToken(user.id, 'VERIFY_EMAIL');

      const res = await post('reset-password', {
        token,
        newPassword: 'BrandNew123!',
      });

      expect(res.status).toBe(400);
    });

    it('重設成功後，同帳號另一枚重設 token 也失效', async () => {
      const user = await seedUser();
      const first = await seedToken(user.id, 'RESET_PASSWORD', {
        plain: 'first-token',
      });
      const second = await seedToken(user.id, 'RESET_PASSWORD', {
        plain: 'second-token',
      });

      await post('reset-password', {
        token: first,
        newPassword: 'BrandNew123!',
      }).expect(204);
      const res = await post('reset-password', {
        token: second,
        newPassword: 'Another123!',
      });

      expect(res.status).toBe(400);
    });

    it('新密碼不符政策 → 400，且 token 未被消耗', async () => {
      const user = await seedUser();
      const token = await seedToken(user.id, 'RESET_PASSWORD');

      const res = await post('reset-password', { token, newPassword: 'x' });

      expect(res.status).toBe(400);
      const row = await prisma.userTokenRecord.findFirst({
        where: { userId: user.id },
        select: { usedAt: true },
      });
      // 密碼政策在 claim 之前檢查，否則使用者得重新申請一封信
      expect(row?.usedAt).toBeNull();
    });
  });
});
