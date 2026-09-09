import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { FrontAuthController } from '../../adapter/in/web/front/auth/FrontAuthController';
import { FrontMeController } from '../../adapter/in/web/front/me/FrontMeController';
import { FrontAuthFacade } from '../../application/facade/front/FrontAuthFacade';
import {
  FRONT_LOGIN_USE_CASE,
  FRONT_LOGOUT_USE_CASE,
  FRONT_REFRESH_USE_CASE,
} from '../../application/port/in/front/auth/FrontAuthUseCases';
import {
  FrontLoginService,
  FrontLogoutService,
  FrontRefreshTokenService,
} from '../../application/service/front/auth/FrontAuthServices';
import { LOAD_USER_PORT } from '../../application/port/out/user/LoadUserPort';
import { SAVE_USER_PORT } from '../../application/port/out/user/SaveUserPort';
import { PrismaUserRepository } from '../../adapter/out/persistence/user/PrismaUserRepository';
import { FrontJwtAuthGuard } from '../../adapter/in/web/guard/FrontJwtAuthGuard';

/**
 * 前台認證模組。
 *
 * `FrontJwtAuthGuard` 以 `@UseGuards` 掛在 controller 上（**不是全域**）——
 * 全域的 `JwtAuthGuard` 只認後台，兩者並存時全域那支會先跑，
 * 靠 `@FrontAuth()` 讓它放行。
 */
@Module({
  imports: [JwtModule.register({})],
  controllers: [FrontAuthController, FrontMeController],
  providers: [
    FrontAuthFacade,
    FrontJwtAuthGuard,
    PrismaUserRepository,
    { provide: LOAD_USER_PORT, useExisting: PrismaUserRepository },
    { provide: SAVE_USER_PORT, useExisting: PrismaUserRepository },
    { provide: FRONT_LOGIN_USE_CASE, useClass: FrontLoginService },
    { provide: FRONT_REFRESH_USE_CASE, useClass: FrontRefreshTokenService },
    { provide: FRONT_LOGOUT_USE_CASE, useClass: FrontLogoutService },
  ],
})
export class FrontAuthModule {}
