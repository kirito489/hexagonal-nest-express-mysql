import { Global, Module } from '@nestjs/common';
import { SecurityController } from '../adapter/in/web/security/SecurityController';
import { SecurityFacade } from '../application/facade/SecurityFacade';
import { PrismaAccountLockAdapter } from '../adapter/out/persistence/auth/PrismaAccountLockAdapter';
import { PrismaIpListRepository } from '../adapter/out/persistence/security/PrismaIpListRepository';
import { RedisIpBlockAdapter } from '../adapter/out/redis/RedisIpBlockAdapter';
import { ACCOUNT_LOCK_PORT } from '../application/port/out/auth/AccountLockPort';
import { IP_BLOCK_PORT } from '../application/port/out/security/IpBlockPort';
import { IP_LIST_PORT } from '../application/port/out/security/IpListPort';
import { JwtModule } from './jwt.module';
import { MemberModule } from './member.module';

/**
 * @Global() — 安全相關 Port 全域可用。
 * 提供帳號鎖定、IP 封鎖、IP 黑白名單等安全功能的 Adapter。
 * 同時提供 SecurityController（Admin CRUD API）。
 */
@Global()
@Module({
  imports: [JwtModule, MemberModule],
  controllers: [SecurityController],
  providers: [
    PrismaAccountLockAdapter,
    { provide: ACCOUNT_LOCK_PORT, useExisting: PrismaAccountLockAdapter },
    PrismaIpListRepository,
    { provide: IP_LIST_PORT, useExisting: PrismaIpListRepository },
    RedisIpBlockAdapter,
    { provide: IP_BLOCK_PORT, useExisting: RedisIpBlockAdapter },
    SecurityFacade,
  ],
  exports: [ACCOUNT_LOCK_PORT, IP_LIST_PORT, IP_BLOCK_PORT],
})
export class SecurityModule {}
