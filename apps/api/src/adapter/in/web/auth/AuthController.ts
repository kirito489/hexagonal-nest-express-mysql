import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthFacade } from '../../../../application/facade/AuthFacade';
import { LoginResult } from '../../../../application/port/in/auth/LoginUseCase';
import { RefreshTokenResult } from '../../../../application/port/in/auth/RefreshTokenUseCase';
import { LoginRequest, loginSchema } from './LoginRequest';
import { LogoutRequest, logoutSchema } from './LogoutRequest';
import {
  ForgotPasswordRequest,
  forgotPasswordSchema,
} from './ForgotPasswordRequest';
import {
  ResetPasswordRequest,
  resetPasswordSchema,
} from './ResetPasswordRequest';
import { RefreshTokenRequest, refreshTokenSchema } from './RefreshTokenRequest';
import { JwtAuthGuard } from '../guard/JwtAuthGuard';
import {
  CurrentMember,
  MemberContext,
} from '../decorator/current-member.decorator';
import { ZodValidationPipe } from '../../../../infrastructure/zod-validation.pipe';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';

@Controller('auth')
export class AuthController {
  constructor(private readonly authFacade: AuthFacade) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body(new ZodValidationPipe(loginSchema)) dto: LoginRequest,
    @Req() req: Request,
  ): Promise<LoginResult> {
    return this.authFacade.login({
      email: dto.email,
      password: dto.password,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      recaptchaToken: dto.recaptchaToken,
    });
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Body(new ZodValidationPipe(refreshTokenSchema)) dto: RefreshTokenRequest,
  ): Promise<RefreshTokenResult> {
    return this.authFacade.refreshToken({
      refreshToken: dto.refreshToken,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  async logout(
    @Req() req: Request,
    @Body(new ZodValidationPipe(logoutSchema)) dto: LogoutRequest,
    @CurrentMember() actor: MemberContext,
  ): Promise<void> {
    // 與 JwtAuthGuard.extractToken 一致：確認 Bearer 前綴再取 token
    const auth = req.headers.authorization;
    const accessToken = auth?.startsWith('Bearer ') ? auth.slice(7) : '';
    await this.authFacade.logout({
      accessToken,
      refreshToken: dto.refreshToken,
      email: actor.email,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  // 嚴格節流：防帳號列舉與 SMTP 轟炸（每來源每分鐘 3 次）。
  // 同時壓低「存在 vs 不存在」回應時間差可被利用的次數。
  @Post('forgot-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  async forgotPassword(
    @Body(new ZodValidationPipe(forgotPasswordSchema))
    dto: ForgotPasswordRequest,
  ): Promise<void> {
    // 不論信箱是否存在皆回 204（防列舉），訊息文案由前端固定呈現
    await this.authFacade.forgotPassword({ email: dto.email });
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  async resetPassword(
    @Body(new ZodValidationPipe(resetPasswordSchema))
    dto: ResetPasswordRequest,
  ): Promise<void> {
    await this.authFacade.resetPassword({
      token: dto.token,
      newPassword: dto.newPassword,
    });
  }
}
