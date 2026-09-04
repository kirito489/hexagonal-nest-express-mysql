import { Injectable } from '@nestjs/common';
import { PrismaService } from '@app/infrastructure/prisma/prisma.service';
import {
  AccountLockPort,
  AccountLockStatus,
} from '@app/application/port/out/auth/AccountLockPort';
import { RedisService } from '@app/infrastructure/redis/redis.service';
import { buildFailedLoginKey } from '@app/infrastructure/redis/cache-keys';
import { getEnv } from '@app/infrastructure/validate-env';
import { normalizeEmail } from '@app/shared/utils/normalize-email';

/**
 * 帳號鎖定 Adapter：
 * - Redis：即時失敗計數（INCR + TTL）
 * - DB：持久化鎖定狀態（lockedAt）
 *
 * Redis 不可用時 graceful degradation（不計數，但 DB 鎖定仍有效）。
 *
 * **每一支對外方法的入口都要 `normalizeEmail`。** Redis 的鍵是字串比對（區分大小寫），
 * 而 MySQL 的 `utf8mb4_unicode_ci` 定序不分大小寫——漏掉任何一支，
 * 攻擊者交替變換大小寫就能讓每一份計數都停在閾值之下，而每次嘗試都命中同一個帳號，
 * **鎖定形同不存在**。
 */
@Injectable()
export class PrismaAccountLockAdapter implements AccountLockPort {
  /**
   * 失敗計數在 Redis 中的 TTL（秒），超過後自動重置。
   *
   * ⚠️ 這個值比鎖定時效（`APPLICATION_ACCOUNT_LOCK_DURATION_MIN`，預設 15 分鐘）長，
   * 因此鎖定到期時**必須由呼叫端清掉計數**，否則使用者到期後第一次打錯就會
   * 因為「計數還在閾值上」立刻重新被鎖。兩者刻意不綁成相等——
   * 綁成巧合一致的話，改動任一邊都會悄悄壞掉。
   */
  private readonly COUNTER_TTL = 1800; // 30 分鐘

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async recordFailedLogin(email: string): Promise<number> {
    const normalized = normalizeEmail(email);

    // Redis 計數（失敗時 graceful degradation，回傳 0）
    if (!this.redis.isAvailable) return 0;
    const key = buildFailedLoginKey(this.redis.keyPrefix, normalized);
    const count = await this.redis.increment(key, this.COUNTER_TTL);

    // 同步更新 DB 的 failedLoginCount（排除軟刪記錄，避免打到同 email 的舊帳號）
    await this.prisma.memberRecord
      .updateMany({
        where: { email: normalized, deletedAt: null },
        data: { failedLoginCount: count },
      })
      .catch(() => {
        // DB 更新失敗不阻塞流程
      });

    return count;
  }

  async resetFailedLogin(email: string): Promise<void> {
    const normalized = normalizeEmail(email);
    const key = buildFailedLoginKey(this.redis.keyPrefix, normalized);
    await this.redis.del(key);

    await this.prisma.memberRecord
      .updateMany({
        where: { email: normalized, deletedAt: null },
        data: { failedLoginCount: 0, lockedAt: null },
      })
      .catch(() => {
        // DB 更新失敗不阻塞流程
      });
  }

  async checkLock(email: string): Promise<AccountLockStatus> {
    // 軟刪 model 的 read path 一律加 deletedAt: null（findUnique 不支援非唯一條件 → 改 findFirst）
    const record = await this.prisma.memberRecord.findFirst({
      where: { email: normalizeEmail(email), deletedAt: null },
      select: { lockedAt: true },
    });

    if (!record?.lockedAt) return 'NONE';

    // 到期時間即時算出，不另存欄位——調整設定要能立刻反映在既有的鎖定紀錄上
    const durationMs =
      getEnv().APPLICATION_ACCOUNT_LOCK_DURATION_MIN * 60 * 1000;
    const unlocksAt = record.lockedAt.getTime() + durationMs;

    return Date.now() >= unlocksAt ? 'EXPIRED' : 'LOCKED';
  }

  async lockAccount(email: string): Promise<void> {
    await this.prisma.memberRecord.updateMany({
      where: { email: normalizeEmail(email), deletedAt: null },
      data: { lockedAt: new Date() },
    });
  }

  async unlockAccount(email: string): Promise<void> {
    const normalized = normalizeEmail(email);
    const key = buildFailedLoginKey(this.redis.keyPrefix, normalized);
    await this.redis.del(key);

    await this.prisma.memberRecord.updateMany({
      where: { email: normalized, deletedAt: null },
      data: { failedLoginCount: 0, lockedAt: null },
    });
  }
}
