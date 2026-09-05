import { Injectable, OnModuleInit } from '@nestjs/common';
import { RedisService } from '../../../infrastructure/redis/redis.service';
import {
  TokenBlacklistPort,
  type BlacklistLookup,
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

  async getBlacklistReason(token: string): Promise<BlacklistLookup> {
    const stored = await this.redis.getBlacklistReason(token);
    // null 專屬於「不在黑名單」。在黑名單但值無法辨識（改用 reason 之前寫入的
    // 舊格式 '1'）必須回 'unknown' 而非 null——回 null 會讓呼叫端當成沒進過黑名單
    // 而放行，等於部署當下把所有既存的已登出 / 已輪替 token 全部復活。
    if (stored === null) return null;
    return stored === 'rotated' || stored === 'logout' ? stored : 'unknown';
  }

  async clearMemberContext(memberId: string): Promise<void> {
    await this.redis.del(buildMemberContextKey(this.keyPrefix, memberId));
  }

  async clearMany(memberIds: string[]): Promise<void> {
    if (memberIds.length === 0) return;

    // 逐筆 del 而非一次刪整個命名空間：後者要用 KEYS / SCAN 掃描，
    // 而那會連沒受影響的人一起清掉，一次角色調整造成全站回頭查 DB。
    //
    // 不 catch：清除失敗的語意是「權限改了但沒有生效」，
    // 讓它往上冒才不會回報一個呼叫端不知道的狀態。
    await Promise.all(
      memberIds.map((memberId) =>
        this.redis.del(buildMemberContextKey(this.keyPrefix, memberId)),
      ),
    );
  }
}
