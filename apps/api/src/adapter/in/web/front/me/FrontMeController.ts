import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  toSummary,
  type FrontUserSummary,
} from '@app/application/port/in/front/auth/FrontAuthUseCases';
import type { UserContext } from '@app/application/port/out/user/LoadUserPort';
import { FrontAuth } from '../../decorator/front-auth.decorator';
import { CurrentUser } from '../../decorator/current-user.decorator';
import { FrontJwtAuthGuard } from '../../guard/FrontJwtAuthGuard';

/** 回應含 `lastLoginAt`，前台可用來提示「上次登入」 */
type FrontMeResponse = FrontUserSummary & { lastLoginAt: Date | null };

/**
 * 前台的個人資料。
 *
 * 直接用守衛掛上的 `UserContext`——它剛剛才查過 DB，再查一次沒有意義。
 */
@Controller('front/me')
export class FrontMeController {
  @FrontAuth()
  @UseGuards(FrontJwtAuthGuard)
  @Get()
  me(@CurrentUser() user: UserContext): FrontMeResponse {
    return { ...toSummary(user), lastLoginAt: user.lastLoginAt };
  }
}
