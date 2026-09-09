import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { FrontAuthFacade } from '@app/application/facade/front/FrontAuthFacade';
import type { FrontTokenPair } from '@app/application/port/in/front/auth/FrontAuthUseCases';
import type { UserContext } from '@app/application/port/out/user/LoadUserPort';
import { ZodValidationPipe } from '@app/infrastructure/zod-validation.pipe';
import { Public } from '../../decorator/public.decorator';
import { FrontAuth } from '../../decorator/front-auth.decorator';
import { CurrentUser } from '../../decorator/current-user.decorator';
import { FrontJwtAuthGuard } from '../../guard/FrontJwtAuthGuard';
import { FrontLoginRequest, frontLoginSchema } from './FrontLoginRequest';
import {
  FrontRefreshTokenRequest,
  frontRefreshTokenSchema,
} from './FrontRefreshTokenRequest';

/**
 * 前台認證 Controller。
 *
 * login / refresh 是 `@Public()`（本來就沒有 token 可帶）；
 * logout 需要認證，用 `@FrontAuth()` + `FrontJwtAuthGuard`
 * ——**不是 `@Public()`**：那會讓一個需要認證的端點在程式碼裡自稱公開。
 */
@Controller('front/auth')
export class FrontAuthController {
  constructor(private readonly frontAuthFacade: FrontAuthFacade) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(
    @Body(new ZodValidationPipe(frontLoginSchema))
    dto: FrontLoginRequest,
  ): Promise<FrontTokenPair> {
    return this.frontAuthFacade.login(dto);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(
    @Body(new ZodValidationPipe(frontRefreshTokenSchema))
    dto: FrontRefreshTokenRequest,
  ): Promise<FrontTokenPair> {
    return this.frontAuthFacade.refresh(dto.refreshToken);
  }

  @FrontAuth()
  @UseGuards(FrontJwtAuthGuard)
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@CurrentUser() user: UserContext): Promise<void> {
    await this.frontAuthFacade.logout(user.id);
  }
}
