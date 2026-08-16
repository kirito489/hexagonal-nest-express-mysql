import { Injectable, OnModuleInit } from '@nestjs/common';
import { RedisService } from '../../../infrastructure/redis/redis.service';
import {
  TokenBlacklistPort,
  type BlacklistReason,
} from '../../../application/port/out/auth/TokenBlacklistPort';
import { ClearMemberContextPort } from '../../../application/port/out/member/ClearMemberContextPort';
import { buildMemberContextKey } from '../../../infrastructure/redis/cache-keys';
import { getEnv } from '../../../infrastructure/validate-env';

/**
 * Outbound Adapter：同時實作 TokenBlacklistPort 和 ClearMemberContextPort。
 * 兩者都委派給 RedisService，但在應用層保持職責分離。
 */
@Injectable()
export class RedisTokenBlacklistAdapter
  implements TokenBlacklistPort, ClearMemberContextPort, OnModuleInit
{
  private keyPrefix = '';

  constructor(private readonly redis: RedisService) {}

  onModuleInit(): void {
    this.keyPrefix = getEnv().REDIS_KEY_PREFIX;
  }

  addToBlacklist(
    token: string,
    ttlSeconds: number,
    reason: BlacklistReason,
  ): Promise<void> {
    return this.redis.addToBlacklist(token, ttlSeconds, reason);
  }

  isBlacklisted(token: string): Promise<boolean> {
    return this.redis.isTokenBlacklisted(token);
  }

  async getBlacklistReason(token: string): Promise<BlacklistReason | null> {
    const stored = await this.redis.getBlacklistReason(token);
    // 舊格式紀錄（值為 '1'）落在這裡回 null，呼叫端會當成「非遭竊」處理
    return stored === 'rotated' || stored === 'logout' ? stored : null;
  }

  async clearMemberContext(memberId: string): Promise<void> {
    await this.redis.del(buildMemberContextKey(this.keyPrefix, memberId));
  }
}
