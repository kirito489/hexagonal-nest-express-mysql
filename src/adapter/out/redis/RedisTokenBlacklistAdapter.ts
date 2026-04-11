import { Injectable, OnModuleInit } from '@nestjs/common';
import { RedisService } from '../../../infrastructure/redis/redis.service';
import { TokenBlacklistPort } from '../../../application/port/out/auth/TokenBlacklistPort';
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

  addToBlacklist(token: string, ttlSeconds: number): Promise<void> {
    return this.redis.addToBlacklist(token, ttlSeconds);
  }

  isBlacklisted(token: string): Promise<boolean> {
    return this.redis.isTokenBlacklisted(token);
  }

  async clearMemberContext(memberId: string): Promise<void> {
    await this.redis.del(buildMemberContextKey(this.keyPrefix, memberId));
  }
}
