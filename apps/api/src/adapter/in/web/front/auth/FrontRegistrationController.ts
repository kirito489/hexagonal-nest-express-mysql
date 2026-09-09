import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { FrontRegistrationFacade } from '@app/application/facade/front/FrontRegistrationFacade';
import { ZodValidationPipe } from '@app/infrastructure/zod-validation.pipe';
import { getEnv } from '@app/infrastructure/validate-env';
import { Public } from '../../decorator/public.decorator';
import {
  FrontRegisterRequest,
  frontRegisterSchema,
} from './FrontRegisterRequest';
import {
  FrontEmailOnlyRequest,
  frontEmailOnlySchema,
} from './FrontEmailOnlyRequest';
import {
  FrontResetPasswordRequest,
  frontResetPasswordSchema,
} from './FrontResetPasswordRequest';
import {
  FrontVerifyEmailQuery,
  frontVerifyEmailQuerySchema,
} from './FrontVerifyEmailQuery';

/** 沿用 admin forgot-password 的 IP 節流：3 次 / 分鐘 */
const MAIL_THROTTLE = { default: { limit: 3, ttl: 60_000 } };

/**
 * 前台註冊 / 信箱驗證 / 密碼重設。
 *
 * 五支全部 `@Public()`——它們本來就沒有 token 可帶。
 *
 * **IP 節流在這裡（`@Throttle`），信箱節流在 Facade**：兩者擋的是不同形狀，
 * IP 節流擋「同一個 IP 對很多信箱各發一封」，信箱節流擋「對同一個信箱轟炸」
 * ——後者換 IP 就繞過 IP 節流，而受害者是那個信箱的擁有者。
 */
@Controller('front/auth')
export class FrontRegistrationController {
  constructor(private readonly facade: FrontRegistrationFacade) {}

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @Throttle(MAIL_THROTTLE)
  async register(
    @Body(new ZodValidationPipe(frontRegisterSchema))
    dto: FrontRegisterRequest,
  ): Promise<{ message: string }> {
    await this.facade.register(dto);
    // 信箱已存在時走的是同一條回應——差別只在有沒有建帳號、寄哪一封信
    return { message: '註冊成功，請至信箱收取驗證信' };
  }

  /**
   * 驗證信箱。
   *
   * **回 302 導回前台，不回 JSON**：這個網址是使用者在信件裡點的，
   * 開啟的是瀏覽器——回 JSON 會讓他看到一坨 `{"success":true}`。
   * 失敗也導回而不是回 4xx，理由相同：一個瀏覽器錯誤頁對他沒有意義。
   */
  @Public()
  @Get('verify-email')
  // 顯式宣告 302：用 @Res() 手動 redirect 時 Nest 不會自己標記狀態碼，
  // 而契約守則比對的是裝飾器與 yaml——不宣告的話它看到的是 GET 的預設 200
  @HttpCode(HttpStatus.FOUND)
  async verifyEmail(
    @Query(new ZodValidationPipe(frontVerifyEmailQuerySchema))
    query: FrontVerifyEmailQuery,
    @Res() res: Response,
  ): Promise<void> {
    const status = await this.facade.verifyEmail(query.token);
    const env = getEnv();
    const base = env.APP_FRONT_URL ?? '';
    res.redirect(
      `${base}${env.APP_FRONT_VERIFY_REDIRECT_PATH}?status=${status}`,
    );
  }

  @Public()
  @Post('resend-verification')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle(MAIL_THROTTLE)
  async resendVerification(
    @Body(new ZodValidationPipe(frontEmailOnlySchema))
    dto: FrontEmailOnlyRequest,
  ): Promise<void> {
    await this.facade.resendVerification(dto.email);
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle(MAIL_THROTTLE)
  async forgotPassword(
    @Body(new ZodValidationPipe(frontEmailOnlySchema))
    dto: FrontEmailOnlyRequest,
  ): Promise<void> {
    await this.facade.forgotPassword(dto.email);
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle(MAIL_THROTTLE)
  async resetPassword(
    @Body(new ZodValidationPipe(frontResetPasswordSchema))
    dto: FrontResetPasswordRequest,
  ): Promise<void> {
    await this.facade.resetPassword(dto);
  }
}
