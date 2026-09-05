// ⚠️ 必須是第一個 import：它設定的 env 要在 AppModule 的裝飾器求值（= 被 import 時）
// 之前生效，否則 getEnv() 會以「鎖定關閉」快取住，而症狀是登入回 200 完全指不到原因。
import {
  ACCOUNT_LOCK_DURATION_MIN,
  ACCOUNT_LOCK_THRESHOLD,
} from '../setup/enable-account-lock';
import request from 'supertest';
import { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaService } from '@app/infrastructure/prisma/prisma.service';
import { createE2EApp, createMockRedis } from '../setup/test-app';
import { resetDb, seedMember } from '../helpers/db';
import { expectApiError } from '../helpers/assertions';
import { ResponseCodes } from '@app/shared/constants/response-codes';

const EMAIL = 'lock-target@example.com';
const PASSWORD = 'TestPass123!';
const THRESHOLD = ACCOUNT_LOCK_THRESHOLD;
const DURATION_MIN = ACCOUNT_LOCK_DURATION_MIN;

/**
 * 會真的計數的 Redis increment mock（依 key 各自累加）。
 *
 * **不能用 `createMockRedis()` 的預設值**——它的 `increment` 永遠回 1，
 * 計數永遠到不了閾值，於是「連續失敗會鎖定」這件事根本沒被驗到，
 * 而測試看起來是綠的。同理，大小寫繞過那條的整個重點就是
 * 「兩種寫法會不會落在同一把 key」，無狀態的 mock 連問題都表達不出來。
 */
const makeCountingRedis = () => {
  const counters = new Map<string, number>();
  const redis = createMockRedis();

  redis.increment.mockImplementation((key: string) => {
    const next = (counters.get(key) ?? 0) + 1;
    counters.set(key, next);
    return Promise.resolve(next);
  });
  redis.del.mockImplementation((key: string) => {
    counters.delete(key);
    return Promise.resolve(undefined);
  });

  return { redis, counters };
};

const login = (app: NestExpressApplication, email: string, password: string) =>
  request(app.getHttpServer())
    .post('/api/admin/auth/login')
    .send({ email, password });

describe('Security hardening E2E', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let counters: Map<string, number>;
  let mockRedis: ReturnType<typeof createMockRedis>;

  beforeAll(async () => {
    const counting = makeCountingRedis();
    mockRedis = counting.redis;
    counters = counting.counters;
    ({ app } = await createE2EApp({ redis: mockRedis }));
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    counters.clear();
    mockRedis.get.mockResolvedValue(null);
    mockRedis.isTokenBlacklisted.mockResolvedValue(false);
    mockRedis.getBlacklistReason.mockResolvedValue(null);
    mockRedis.throttleIncrement.mockResolvedValue(1);
    await resetDb(prisma);
  });

  describe('安全標頭與 CSP 範圍', () => {
    it('一般路徑 → 有 Content-Security-Policy', async () => {
      const res = await login(app, 'nobody@example.com', 'whatever');

      expect(res.headers['content-security-policy']).toBeDefined();
    });

    // docs-json 是 JSON 不是 UI，不需要放寬——用 startsWith 判斷會把它一起豁免掉
    it('/api/admin/docs-json → 也有 CSP', async () => {
      const res = await request(app.getHttpServer()).get(
        '/api/admin/docs-json',
      );

      expect(res.headers['content-security-policy']).toBeDefined();
    });

    it('/api/admin/docs → 沒有 CSP（Swagger UI 依賴 inline script）', async () => {
      const res = await request(app.getHttpServer()).get('/api/admin/docs');

      expect(res.headers['content-security-policy']).toBeUndefined();
    });

    it('一般路徑仍有其餘安全標頭', async () => {
      const res = await login(app, 'nobody@example.com', 'whatever');

      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options']).toBeDefined();
    });
  });

  describe('帳號鎖定的時效', () => {
    it(`連續 ${THRESHOLD} 次失敗 → 鎖定，之後即使密碼正確也回 423`, async () => {
      await seedMember(prisma, { email: EMAIL, password: PASSWORD });

      for (let i = 0; i < THRESHOLD; i += 1) {
        await login(app, EMAIL, 'wrong-password');
      }

      const res = await login(app, EMAIL, PASSWORD);
      expectApiError(res, 423, ResponseCodes.ACCOUNT_LOCKED);
    });

    it('鎖定逾時後 → 正確密碼可登入', async () => {
      const member = await seedMember(prisma, {
        email: EMAIL,
        password: PASSWORD,
      });
      // 直接把 lockedAt 推到時效之前，模擬「鎖了但已經過期」
      await prisma.memberRecord.update({
        where: { id: member.memberId },
        data: {
          lockedAt: new Date(Date.now() - (DURATION_MIN + 1) * 60 * 1000),
        },
      });

      const res = await login(app, EMAIL, PASSWORD);

      expect(res.status).toBe(200);
      expect(res.body.data.accessToken).toBeDefined();
    });

    // 到期沒清計數的話，Redis 計數的 TTL（30 分）比時效（15 分）長，
    // 使用者到期後第一次打錯就會因為「計數還在閾值上」立刻重新被鎖，
    // 實際鎖定時間變成計數的 TTL 而非設定的時效。
    it('鎖定逾時後打錯密碼 → 回 401 而非 423（殘留計數已被清掉）', async () => {
      const member = await seedMember(prisma, {
        email: EMAIL,
        password: PASSWORD,
      });
      for (let i = 0; i < THRESHOLD; i += 1) {
        await login(app, EMAIL, 'wrong-password');
      }
      await prisma.memberRecord.update({
        where: { id: member.memberId },
        data: {
          lockedAt: new Date(Date.now() - (DURATION_MIN + 1) * 60 * 1000),
        },
      });

      const res = await login(app, EMAIL, 'wrong-password-again');

      expect(res.status).toBe(401);
    });
  });

  describe('大小寫不能規避失敗計數', () => {
    it(`交替大小寫共 ${THRESHOLD} 次失敗 → 仍然鎖定`, async () => {
      await seedMember(prisma, { email: EMAIL, password: PASSWORD });

      // Redis 鍵是字串比對（區分大小寫），DB 定序 utf8mb4_unicode_ci 不分大小寫——
      // 沒有正規化的話，每種寫法各自累積一份永遠到不了閾值的計數。
      //
      // 變體只變大小寫，不加前後空白：帶空白的字串會被 DTO 的 Zod `.email()`
      // 擋在 400，那次嘗試根本進不到 service，計數自然少一次。
      // （`normalizeEmail` 的 trim 因此在 HTTP 路徑上到不了，
      //   它守的是其他呼叫端與縱深防禦，不是這條路。）
      const variants = [
        EMAIL,
        EMAIL.toUpperCase(),
        EMAIL.replace('lock', 'Lock'),
      ];
      for (const variant of variants) {
        await login(app, variant, 'wrong-password');
      }

      const res = await login(app, EMAIL, PASSWORD);
      expectApiError(res, 423, ResponseCodes.ACCOUNT_LOCKED);
    });

    it('失敗計數只落在一把 Redis 鍵上', async () => {
      await seedMember(prisma, { email: EMAIL, password: PASSWORD });

      await login(app, EMAIL, 'wrong');
      await login(app, EMAIL.toUpperCase(), 'wrong');

      const failedLoginKeys = [...counters.keys()].filter((key) =>
        key.includes('failed-login:'),
      );
      expect(failedLoginKeys).toHaveLength(1);
      expect(counters.get(failedLoginKeys[0])).toBe(2);
    });
  });
  /**
   * D3 的漂移點:列表的到期判定與登入路徑必須是同一份規則。
   *
   * 漂移的症狀是「列表說鎖著、但那個人登得進去」——看起來像資料不同步,
   * 實際是兩份計算。**這一條同時斷言兩邊**,所以任一邊改了規則都會紅。
   *
   * 本 spec 開啟了鎖定功能,因此也是驗 `lockEnabled: true` 的地方。
   */
  describe('鎖定列表與登入路徑的一致性', () => {
    const ADMIN_EMAIL = 'lock-admin@example.com';

    /** 以 SUPERADMIN 登入並取得 token */
    const superadminToken = async (): Promise<string> => {
      await seedMember(prisma, {
        email: ADMIN_EMAIL,
        password: PASSWORD,
        roleName: '管理者',
        roleCode: 'SUPERADMIN',
      });
      const res = await login(app, ADMIN_EMAIL, PASSWORD);
      return (res.body as { data: { accessToken: string } }).data.accessToken;
    };

    const listLocks = (token: string, query = '') =>
      request(app.getHttpServer())
        .get(`/api/admin/security/locks${query}`)
        .set('Authorization', `Bearer ${token}`);

    it('功能已啟用 → lockEnabled 為 true', async () => {
      const token = await superadminToken();

      const res = await listLocks(token);

      expect(res.status).toBe(200);
      expect(
        (res.body as { data: { lockEnabled: boolean } }).data.lockEnabled,
      ).toBe(true);
    });

    it('鎖定中的帳號:列表說 locked,且該帳號登不進去', async () => {
      const token = await superadminToken();
      await seedMember(prisma, { email: EMAIL, password: PASSWORD });
      for (let i = 0; i < THRESHOLD; i += 1) {
        await login(app, EMAIL, 'wrong-password');
      }

      const res = await listLocks(token);
      const { list } = (
        res.body as { data: { list: Array<{ email: string; status: string }> } }
      ).data;
      const row = list.find((item) => item.email === EMAIL);

      expect(row?.status).toBe('locked');
      // 同一筆資料的另一半:此時登入必須被擋
      expectApiError(
        await login(app, EMAIL, PASSWORD),
        423,
        ResponseCodes.ACCOUNT_LOCKED,
      );
    });

    it('剛好超過時效:列表說 expired,且該帳號同時登得進去', async () => {
      const token = await superadminToken();
      const member = await seedMember(prisma, {
        email: EMAIL,
        password: PASSWORD,
      });
      await prisma.memberRecord.update({
        where: { id: member.memberId },
        data: {
          lockedAt: new Date(Date.now() - (DURATION_MIN + 1) * 60 * 1000),
        },
      });

      const res = await listLocks(token, '?status=expired');
      const { list } = (
        res.body as { data: { list: Array<{ email: string; status: string }> } }
      ).data;
      const row = list.find((item) => item.email === EMAIL);

      expect(row?.status).toBe('expired');
      // 兩份規則若漂移,這一行會綠而上一行會紅(或反過來)
      expect((await login(app, EMAIL, PASSWORD)).status).toBe(200);
    });

    it('預設過濾不會把已到期的列成鎖定中', async () => {
      const token = await superadminToken();
      const member = await seedMember(prisma, {
        email: EMAIL,
        password: PASSWORD,
      });
      await prisma.memberRecord.update({
        where: { id: member.memberId },
        data: {
          lockedAt: new Date(Date.now() - (DURATION_MIN + 1) * 60 * 1000),
        },
      });

      const res = await listLocks(token);

      expect(
        (
          res.body as { data: { list: Array<{ email: string }> } }
        ).data.list.map((item) => item.email),
      ).not.toContain(EMAIL);
    });
  });
});
