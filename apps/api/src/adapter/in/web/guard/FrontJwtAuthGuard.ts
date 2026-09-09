import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import type { JwtPayload } from '@app/application/port/jwt-payload';
import {
  LOAD_USER_PORT,
  LoadUserPort,
  UserContext,
} from '@app/application/port/out/user/LoadUserPort';
import { getEnv } from '@app/infrastructure/validate-env';
import { HttpMessages } from '@app/shared/constants/response-messages';

/** 掛在 request 上供 @CurrentUser() 取用 */
export const FRONT_USER_KEY = 'frontUser';

/**
 * 前台的認證守衛。
 *
 * **與後台各用一組 secret**：忘記比對 `side` 時，各自 secret 讓它變成
 * 簽章驗證失敗而非跨側存取——fail-closed。`side` 檢查是第二道，
 * 用途是錯誤訊息說得出「這是前台的 token」。
 *
 * **前台不套用 `side` 的過渡寬鬆**（後台是 `payload.side ?? 'admin'`）：
 * 前台是全新的，不存在沒有 `side` 的舊 token。
 *
 * `UserContext` 直接查 DB、**不做快取**：它只有一次主鍵查詢、沒有 join，
 * 而快取要配一整套失效機制（改資料、停用、tokenVersion），
 * 加了之後「為什麼前台看到舊資料」會是一個沒有人想除的 bug。
 */
@Injectable()
export class FrontJwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    @Inject(LOAD_USER_PORT) private readonly loadUser: LoadUserPort,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(request);
    if (!token) {
      throw new UnauthorizedException(HttpMessages.MISSING_CREDENTIALS);
    }

    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify<JwtPayload>(token, {
        secret: getEnv().FRONT_ACCESS_SECRET,
      });
    } catch {
      throw new UnauthorizedException(HttpMessages.TOKEN_VERIFY_FAILED);
    }

    if (payload.type !== 'access') {
      throw new UnauthorizedException(HttpMessages.TOKEN_WRONG_TYPE);
    }
    if (payload.side !== 'front') {
      throw new UnauthorizedException(HttpMessages.TOKEN_WRONG_SIDE);
    }

    const user = await this.loadUser.loadUserById(payload.sub);
    if (!user) {
      throw new UnauthorizedException(HttpMessages.TOKEN_MEMBER_NOT_FOUND);
    }
    if (!user.status) {
      throw new UnauthorizedException(HttpMessages.TOKEN_SUPERSEDED);
    }
    // tokenVersion 不符代表該 token 已被登出或改密碼撤銷
    if (payload.tokenVersion !== user.tokenVersion) {
      throw new UnauthorizedException(HttpMessages.TOKEN_SUPERSEDED);
    }

    (request as Request & { [FRONT_USER_KEY]?: UserContext })[FRONT_USER_KEY] =
      user;
    return true;
  }

  private extractToken(request: Request): string | null {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) return null;
    return header.slice('Bearer '.length).trim() || null;
  }
}
