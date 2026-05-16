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
    const accessToken = req.headers.authorization?.slice(7) ?? '';
    await this.authFacade.logout({
      accessToken,
      refreshToken: dto.refreshToken,
      email: actor.email,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(
    @Body(new ZodValidationPipe(forgotPasswordSchema))
    dto: ForgotPasswordRequest,
  ): Promise<{ message: string }> {
    await this.authFacade.forgotPassword({ email: dto.email });
    return { message: '若此信箱已註冊，您將收到密碼重設信件' };
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(
    @Body(new ZodValidationPipe(resetPasswordSchema))
    dto: ResetPasswordRequest,
  ): Promise<{ message: string }> {
    await this.authFacade.resetPassword({
      token: dto.token,
      newPassword: dto.newPassword,
    });
    return { message: '密碼已成功重設' };
  }
}
