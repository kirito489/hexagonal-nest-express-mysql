import { Inject, Injectable } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import {
  FRONT_FORGOT_PASSWORD_USE_CASE,
  FRONT_REGISTER_USE_CASE,
  FRONT_RESEND_VERIFICATION_USE_CASE,
  FRONT_RESET_PASSWORD_USE_CASE,
  FRONT_VERIFY_EMAIL_USE_CASE,
  FrontForgotPasswordUseCase,
  FrontRegisterCommand,
  FrontRegisterUseCase,
  FrontResendVerificationUseCase,
  FrontResetPasswordCommand,
  FrontResetPasswordUseCase,
  FrontVerifyEmailUseCase,
  VerifyEmailStatus,
} from '../../port/in/front/auth/FrontRegistrationUseCases';
import {
  EMAIL_THROTTLE_PORT,
  EmailThrottlePort,
  EmailThrottleScope,
} from '../../port/out/user/EmailThrottlePort';

/**
 * 前台註冊 / 驗證 / 密碼重設的 Facade。
 *
 * **信箱節流在這一層**：它是三支寄信端點共同的前置條件，
 * 放進各 service 會重複三次，而放在 controller 會讓「防濫用」變成
 * 可以被下一支端點忘記的一行裝飾器。
 *
 * IP 節流由 controller 的 `@Throttle` 負責——兩者擋的是不同形狀，缺一不可。
 */
@Injectable()
export class FrontRegistrationFacade {
  constructor(
    @Inject(FRONT_REGISTER_USE_CASE)
    private readonly registerUseCase: FrontRegisterUseCase,
    @Inject(FRONT_VERIFY_EMAIL_USE_CASE)
    private readonly verifyEmailUseCase: FrontVerifyEmailUseCase,
    @Inject(FRONT_RESEND_VERIFICATION_USE_CASE)
    private readonly resendUseCase: FrontResendVerificationUseCase,
    @Inject(FRONT_FORGOT_PASSWORD_USE_CASE)
    private readonly forgotPasswordUseCase: FrontForgotPasswordUseCase,
    @Inject(FRONT_RESET_PASSWORD_USE_CASE)
    private readonly resetPasswordUseCase: FrontResetPasswordUseCase,
    @Inject(EMAIL_THROTTLE_PORT)
    private readonly emailThrottle: EmailThrottlePort,
  ) {}

  async register(command: FrontRegisterCommand): Promise<void> {
    await this.guardEmail(command.email, 'register');
    await this.registerUseCase.execute(command);
  }

  verifyEmail(token: string): Promise<VerifyEmailStatus> {
    // 不節流：它不寄信，且使用者可能重複點同一個連結
    return this.verifyEmailUseCase.execute(token);
  }

  async resendVerification(email: string): Promise<void> {
    await this.guardEmail(email, 'resend');
    await this.resendUseCase.execute(email);
  }

  async forgotPassword(email: string): Promise<void> {
    await this.guardEmail(email, 'forgot');
    await this.forgotPasswordUseCase.execute(email);
  }

  resetPassword(command: FrontResetPasswordCommand): Promise<void> {
    // 不做信箱節流：這支不收 email，且已受 IP 節流與 token 一次性保護
    return this.resetPasswordUseCase.execute(command);
  }

  /** 超額時拋 `ThrottlerException`，讓 429 的回應形狀與全域節流一致 */
  private async guardEmail(
    email: string,
    scope: EmailThrottleScope,
  ): Promise<void> {
    if (await this.emailThrottle.isExceeded(email, scope)) {
      throw new ThrottlerException();
    }
  }
}
