import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { UserContext } from '@app/application/port/out/user/LoadUserPort';
import { FRONT_USER_KEY } from '../guard/FrontJwtAuthGuard';

/**
 * 取出目前登入的前台使用者（由 `FrontJwtAuthGuard` 掛上）。
 *
 * 與後台的 `@CurrentMember()` 對稱。取不到代表該 handler 漏掛 `@FrontAuth()`
 * 或 `@UseGuards(FrontJwtAuthGuard)`——直接拋，不回 undefined 讓錯誤往下游擴散。
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): UserContext => {
    const request = ctx
      .switchToHttp()
      .getRequest<Request & { [FRONT_USER_KEY]?: UserContext }>();
    const user = request[FRONT_USER_KEY];
    if (!user) {
      throw new Error('UserContext 未設定，請確認 FrontJwtAuthGuard 已套用');
    }
    return user;
  },
);
