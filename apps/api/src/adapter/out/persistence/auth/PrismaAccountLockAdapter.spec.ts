import { PrismaAccountLockAdapter } from './PrismaAccountLockAdapter';
import { PrismaService } from '@app/infrastructure/prisma/prisma.service';
import { RedisService } from '@app/infrastructure/redis/redis.service';

jest.mock('@app/infrastructure/validate-env', () => ({
  getEnv: () => ({ APPLICATION_ACCOUNT_LOCK_DURATION_MIN: 15 }),
}));

const EMAIL = 'target@test.com';

/** 鎖定時效（分鐘），與上方 mock 的設定值一致 */
const DURATION_MIN = 15;
const minutesAgo = (n: number): Date => new Date(Date.now() - n * 60 * 1000);

const makeMocks = () => {
  const prisma = {
    memberRecord: {
      findFirst: jest.fn().mockResolvedValue({ lockedAt: null }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  } as unknown as PrismaService;

  const redis = {
    isAvailable: true,
    keyPrefix: 'app:',
    increment: jest.fn().mockResolvedValue(1),
    del: jest.fn().mockResolvedValue(undefined),
  } as unknown as RedisService;

  return {
    prisma,
    redis,
    adapter: new PrismaAccountLockAdapter(prisma, redis),
  };
};

/** 取出對 memberRecord.updateMany 的第 n 次呼叫參數 */
const updateArgs = (prisma: PrismaService, nth = 0): { data: unknown } => {
  const mock = (
    prisma as unknown as { memberRecord: { updateMany: jest.Mock } }
  ).memberRecord.updateMany;
  return mock.mock.calls[nth][0] as { data: unknown };
};

describe('PrismaAccountLockAdapter', () => {
  // ── characterization：釘住現行行為，供 platform-security-hardening 重構時比對 ──
  //
  // 這一層是本次兩個缺陷的所在（失敗計數的 Redis 鍵大小寫、鎖定時效判定），
  // 而模板先前沒有任何 out adapter 的測試——也就是說改壞了不會有東西紅。
  describe('characterization：解鎖必須同時清兩者', () => {
    it('unlockAccount → lockedAt 設 null 且 failedLoginCount 歸零', async () => {
      const { prisma, redis, adapter } = makeMocks();

      await adapter.unlockAccount(EMAIL);

      // 只清其一會讓帳號在下一次失敗就立刻重新被鎖（api-security-management spec 明文禁止）
      expect(updateArgs(prisma).data).toEqual({
        failedLoginCount: 0,
        lockedAt: null,
      });
      expect(redis.del).toHaveBeenCalledTimes(1);
    });

    it('resetFailedLogin → 同樣清掉 Redis 計數與 DB 兩個欄位', async () => {
      const { prisma, redis, adapter } = makeMocks();

      await adapter.resetFailedLogin(EMAIL);

      expect(updateArgs(prisma).data).toEqual({
        failedLoginCount: 0,
        lockedAt: null,
      });
      expect(redis.del).toHaveBeenCalledTimes(1);
    });

    it('lockAccount → 寫入 lockedAt', async () => {
      const { prisma, adapter } = makeMocks();

      await adapter.lockAccount(EMAIL);

      const data = updateArgs(prisma).data as { lockedAt: Date };
      expect(data.lockedAt).toBeInstanceOf(Date);
    });
  });

  describe('characterization：所有 write path 都排除軟刪紀錄', () => {
    it.each([
      [
        'unlockAccount',
        (a: PrismaAccountLockAdapter) => a.unlockAccount(EMAIL),
      ],
      [
        'resetFailedLogin',
        (a: PrismaAccountLockAdapter) => a.resetFailedLogin(EMAIL),
      ],
      ['lockAccount', (a: PrismaAccountLockAdapter) => a.lockAccount(EMAIL)],
    ])('%s 的 where 帶 deletedAt: null', async (_name, run) => {
      const { prisma, adapter } = makeMocks();

      await run(adapter);

      // 少了它會打到同 email 的舊帳號（軟刪後 email 不釋放）
      const where = (updateArgs(prisma) as unknown as { where: unknown }).where;
      expect(where).toMatchObject({ deletedAt: null });
    });
  });

  describe('checkLock 的三態判定', () => {
    /** 讓 findFirst 回傳指定的 lockedAt */
    const givenLockedAt = (prisma: PrismaService, lockedAt: Date | null) => {
      (
        prisma as unknown as { memberRecord: { findFirst: jest.Mock } }
      ).memberRecord.findFirst.mockResolvedValue({ lockedAt });
    };

    it('從未鎖定 → NONE', async () => {
      const { prisma, adapter } = makeMocks();
      givenLockedAt(prisma, null);

      await expect(adapter.checkLock(EMAIL)).resolves.toBe('NONE');
    });

    it('查無此帳號 → NONE', async () => {
      const { prisma, adapter } = makeMocks();
      (
        prisma as unknown as { memberRecord: { findFirst: jest.Mock } }
      ).memberRecord.findFirst.mockResolvedValue(null);

      await expect(adapter.checkLock(EMAIL)).resolves.toBe('NONE');
    });

    it('鎖定未滿時效 → LOCKED', async () => {
      const { prisma, adapter } = makeMocks();
      givenLockedAt(prisma, minutesAgo(DURATION_MIN - 1));

      await expect(adapter.checkLock(EMAIL)).resolves.toBe('LOCKED');
    });

    it('鎖定已超過時效 → EXPIRED', async () => {
      const { prisma, adapter } = makeMocks();
      givenLockedAt(prisma, minutesAgo(DURATION_MIN + 1));

      await expect(adapter.checkLock(EMAIL)).resolves.toBe('EXPIRED');
    });

    // 邊界：剛好滿時效算到期。取「>=」而非「>」，讓設定的數字就是使用者實際等待的上限
    it('剛好滿時效 → EXPIRED', async () => {
      const { prisma, adapter } = makeMocks();
      givenLockedAt(prisma, minutesAgo(DURATION_MIN));

      await expect(adapter.checkLock(EMAIL)).resolves.toBe('EXPIRED');
    });
  });

  describe('email 正規化（大小寫繞過的修補）', () => {
    // Redis 的鍵是字串比對（區分大小寫），MySQL 的 utf8mb4_unicode_ci 不分大小寫。
    // 漏掉任一支就會讓每種寫法各自累積一份永遠達不到閾值的計數，而每次嘗試都命中同一個帳號。
    it('recordFailedLogin：不同大小寫寫進同一把 Redis 鍵', async () => {
      const { redis, adapter } = makeMocks();

      await adapter.recordFailedLogin('Foo@Example.com');
      await adapter.recordFailedLogin('foo@example.COM');

      const increment = (redis as unknown as { increment: jest.Mock })
        .increment;
      const keys = increment.mock.calls.map((call) => call[0] as string);
      expect(keys[0]).toBe(keys[1]);
      expect(keys[0]).toContain('foo@example.com');
    });

    it.each([
      [
        'resetFailedLogin',
        (a: PrismaAccountLockAdapter) => a.resetFailedLogin('Foo@Example.com'),
      ],
      [
        'unlockAccount',
        (a: PrismaAccountLockAdapter) => a.unlockAccount('Foo@Example.com'),
      ],
      [
        'lockAccount',
        (a: PrismaAccountLockAdapter) => a.lockAccount('Foo@Example.com'),
      ],
    ])('%s：DB 查詢用正規化後的 email', async (_name, run) => {
      const { prisma, adapter } = makeMocks();

      await run(adapter);

      const where = (
        updateArgs(prisma) as unknown as { where: { email: string } }
      ).where;
      expect(where.email).toBe('foo@example.com');
    });

    it('checkLock：DB 查詢用正規化後的 email', async () => {
      const { prisma, adapter } = makeMocks();

      await adapter.checkLock('  Foo@Example.com  ');

      const findFirst = (
        prisma as unknown as { memberRecord: { findFirst: jest.Mock } }
      ).memberRecord.findFirst;
      const where = (findFirst.mock.calls[0][0] as { where: { email: string } })
        .where;
      expect(where.email).toBe('foo@example.com');
    });
  });

  describe('characterization：Redis 不可用時的降級', () => {
    it('recordFailedLogin 在 Redis 不可用時回 0 且不寫 DB', async () => {
      const { prisma, adapter } = makeMocks();
      Object.defineProperty(
        (adapter as unknown as { redis: RedisService }).redis,
        'isAvailable',
        { value: false },
      );

      const count = await adapter.recordFailedLogin(EMAIL);

      expect(count).toBe(0);
      const mock = (
        prisma as unknown as { memberRecord: { updateMany: jest.Mock } }
      ).memberRecord.updateMany;
      expect(mock).not.toHaveBeenCalled();
    });
  });
});
