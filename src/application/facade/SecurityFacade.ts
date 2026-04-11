import { Inject, Injectable } from '@nestjs/common';
import {
  ACCOUNT_LOCK_PORT,
  AccountLockPort,
} from '../port/out/auth/AccountLockPort';
import {
  IP_LIST_PORT,
  IpBlacklistItem,
  IpListItem,
  IpListPort,
} from '../port/out/security/IpListPort';

/**
 * 安全管理 Facade：IP 黑白名單 CRUD + 帳號解鎖。
 */
@Injectable()
export class SecurityFacade {
  constructor(
    @Inject(IP_LIST_PORT) private readonly ipList: IpListPort,
    @Inject(ACCOUNT_LOCK_PORT) private readonly accountLock: AccountLockPort,
  ) {}

  listWhitelist(): Promise<IpListItem[]> {
    return this.ipList.listWhitelist();
  }

  addToWhitelist(
    ip: string,
    description?: string,
    createdBy?: string,
  ): Promise<void> {
    return this.ipList.addToWhitelist(ip, description, createdBy);
  }

  removeFromWhitelist(ip: string): Promise<void> {
    return this.ipList.removeFromWhitelist(ip);
  }

  listBlacklist(): Promise<IpBlacklistItem[]> {
    return this.ipList.listBlacklist();
  }

  addToBlacklist(
    ip: string,
    reason?: string,
    createdBy?: string,
  ): Promise<void> {
    return this.ipList.addToBlacklist(ip, reason, false, createdBy);
  }

  removeFromBlacklist(ip: string): Promise<void> {
    return this.ipList.removeFromBlacklist(ip);
  }

  unlockAccount(email: string): Promise<void> {
    return this.accountLock.unlockAccount(email);
  }
}
