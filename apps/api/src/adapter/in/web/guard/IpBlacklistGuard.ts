import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Request } from 'express';
import { FeatureFlagService } from '../../../../application/service/FeatureFlagService';
import {
  IP_LIST_PORT,
  IpListPort,
} from '../../../../application/port/out/security/IpListPort';

/**
 * 全域 Guard：當 IP 黑名單功能啟用時，檢查請求來源 IP 是否在黑名單中。
 * 功能關閉時直接放行。
 */
@Injectable()
export class IpBlacklistGuard implements CanActivate {
  constructor(
    private readonly featureFlags: FeatureFlagService,
    @Inject(IP_LIST_PORT) private readonly ipList: IpListPort,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!this.featureFlags.isEnabled('ipBlacklistEnabled')) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const ip = request.ip;

    if (ip && (await this.ipList.isBlacklisted(ip))) {
      throw new ForbiddenException('IP 位址已被封鎖');
    }

    return true;
  }
}
