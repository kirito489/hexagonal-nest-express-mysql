import { Injectable } from '@nestjs/common';
import { RedisService } from '@app/infrastructure/redis/redis.service';
import { buildEmailThrottleKey } from '@app/infrastructure/redis/cache-keys';
import {
  EmailThrottlePort,
  EmailThrottleScope,
} from '@app/application/port/out/user/EmailThrottlePort';
import { normalizeEmail } from '@app/shared/utils/normalize-email';

/** 每個信箱在視窗內允許的次數，與視窗長度（秒） */
const LIMIT = 3;
const WINDOW_SECONDS = 3600;

/**
 * 以 Redis 計數的信箱節流。
 *
 * **fail-open**：`RedisService.increment` 在 Redis 不可用時回 0，
 * 而 0 永遠小於上限——也就是自然放行。這是刻意的，見 `EmailThrottlePort` 的說明。
 */
@Injectable()
export class RedisEmailThrottleAdapter implements EmailThrottlePort {
  constructor(private readonly redis: RedisService) {}

  async isExceeded(email: string, scope: EmailThrottleScope): Promise<boolean> {
    // 正規化後才當 key：否則交替大小寫可以讓每種寫法各自累積一份計數
    const key = buildEmailThrottleKey(
      this.redis.keyPrefix,
      normalizeEmail(email),
      scope,
    );
    const count = await this.redis.increment(key, WINDOW_SECONDS);
    return count > LIMIT;
  }
}
