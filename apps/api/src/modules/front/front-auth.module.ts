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
import { FrontRegistrationController } from '../../adapter/in/web/front/auth/FrontRegistrationController';
import { FrontRegistrationFacade } from '../../application/facade/front/FrontRegistrationFacade';
import {
  FRONT_FORGOT_PASSWORD_USE_CASE,
  FRONT_REGISTER_USE_CASE,
  FRONT_RESEND_VERIFICATION_USE_CASE,
  FRONT_RESET_PASSWORD_USE_CASE,
  FRONT_VERIFY_EMAIL_USE_CASE,
} from '../../application/port/in/front/auth/FrontRegistrationUseCases';
import {
  FrontForgotPasswordService,
  FrontRegisterService,
  FrontResendVerificationService,
  FrontResetPasswordService,
  FrontVerifyEmailService,
} from '../../application/service/front/auth/FrontRegistrationServices';
import { USER_TOKEN_PORT } from '../../application/port/out/user/UserTokenPort';
import { EMAIL_THROTTLE_PORT } from '../../application/port/out/user/EmailThrottlePort';
import { PrismaUserTokenRepository } from '../../adapter/out/persistence/user/PrismaUserTokenRepository';
import { RedisEmailThrottleAdapter } from '../../adapter/out/redis/RedisEmailThrottleAdapter';
import { PasswordPolicyService } from '../../application/service/shared/PasswordPolicyService';

/**
 * 前台認證模組。
 *
 * `FrontJwtAuthGuard` 以 `@UseGuards` 掛在 controller 上（**不是全域**）——
 * 全域的 `JwtAuthGuard` 只認後台，兩者並存時全域那支會先跑，
 * 靠 `@FrontAuth()` 讓它放行。
 */
@Module({
  imports: [JwtModule.register({})],
  controllers: [
    FrontAuthController,
    FrontRegistrationController,
    FrontMeController,
  ],
  providers: [
    FrontAuthFacade,
    FrontJwtAuthGuard,
    PrismaUserRepository,
    { provide: LOAD_USER_PORT, useExisting: PrismaUserRepository },
    { provide: SAVE_USER_PORT, useExisting: PrismaUserRepository },
    { provide: FRONT_LOGIN_USE_CASE, useClass: FrontLoginService },
    { provide: FRONT_REFRESH_USE_CASE, useClass: FrontRefreshTokenService },
    { provide: FRONT_LOGOUT_USE_CASE, useClass: FrontLogoutService },
    FrontRegistrationFacade,
    PasswordPolicyService,
    PrismaUserTokenRepository,
    RedisEmailThrottleAdapter,
    { provide: USER_TOKEN_PORT, useExisting: PrismaUserTokenRepository },
    { provide: EMAIL_THROTTLE_PORT, useExisting: RedisEmailThrottleAdapter },
    { provide: FRONT_REGISTER_USE_CASE, useClass: FrontRegisterService },
    { provide: FRONT_VERIFY_EMAIL_USE_CASE, useClass: FrontVerifyEmailService },
    {
      provide: FRONT_RESEND_VERIFICATION_USE_CASE,
      useClass: FrontResendVerificationService,
    },
    {
      provide: FRONT_FORGOT_PASSWORD_USE_CASE,
      useClass: FrontForgotPasswordService,
    },
    {
      provide: FRONT_RESET_PASSWORD_USE_CASE,
      useClass: FrontResetPasswordService,
    },
  ],
})
export class FrontAuthModule {}
