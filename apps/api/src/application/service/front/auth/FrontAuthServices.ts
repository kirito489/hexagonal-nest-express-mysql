import {
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import {
  LOAD_USER_PORT,
  LoadUserPort,
  UserContext,
} from '../../../port/out/user/LoadUserPort';
import {
  SAVE_USER_PORT,
  SaveUserPort,
} from '../../../port/out/user/SaveUserPort';
import {
  FrontLoginCommand,
  FrontLoginUseCase,
  FrontLogoutUseCase,
  FrontRefreshUseCase,
  FrontTokenPair,
  toSummary,
} from '../../../port/in/front/auth/FrontAuthUseCases';
import type { JwtPayload } from '../../../port/jwt-payload';
import { getEnv } from '@app/infrastructure/validate-env';
import { normalizeEmail } from '@app/shared/utils/normalize-email';
import { HttpMessages } from '@app/shared/constants/response-messages';
import { AccountDisabledException } from '@app/domain/exception/AccountDisabledException';

/**
 * 簽發前台的 token 組。
 *
 * **與後台各用一組 secret**：忘記比對 `side` 時，各自 secret 讓它變成
 * 簽章驗證失敗而非跨側存取。
 */
const issueTokens = (
  jwtService: JwtService,
  user: UserContext,
  tokenVersion: number,
): FrontTokenPair => {
  const env = getEnv();
  const base = { sub: user.id, side: 'front', tokenVersion } as const;
  return {
    accessToken: jwtService.sign(
      { ...base, type: 'access' } satisfies JwtPayload,
      {
        secret: env.FRONT_ACCESS_SECRET,
        expiresIn: env.ACCESS_TOKEN_EXPIRES_IN,
      },
    ),
    refreshToken: jwtService.sign(
      { ...base, type: 'refresh' } satisfies JwtPayload,
      {
        secret: env.FRONT_REFRESH_SECRET,
        expiresIn: env.REFRESH_TOKEN_EXPIRES_IN,
      },
    ),
    accessTokenExpiresIn: env.ACCESS_TOKEN_EXPIRES_IN,
    refreshTokenExpiresIn: env.REFRESH_TOKEN_EXPIRES_IN,
    user: toSummary({ ...user, tokenVersion }),
  };
};

@Injectable()
export class FrontLoginService implements FrontLoginUseCase {
  private readonly logger = new Logger(FrontLoginService.name);

  constructor(
    private readonly jwtService: JwtService,
    @Inject(LOAD_USER_PORT) private readonly loadUser: LoadUserPort,
    @Inject(SAVE_USER_PORT) private readonly saveUser: SaveUserPort,
  ) {}

  async execute(command: FrontLoginCommand): Promise<FrontTokenPair> {
    const email = normalizeEmail(command.email);
    const found = await this.loadUser.loadCredentialsByEmail(email);

    // 帳號不存在與密碼錯誤回**完全相同**的 401——區分開來會讓這支端點
    // 變成帳號列舉工具。bcrypt 仍然跑一次比對以避免時序差異洩漏帳號存在
    const passwordMatches = found
      ? await bcrypt.compare(command.password, found.password)
      : await bcrypt.compare(command.password, DUMMY_HASH);
    if (!found || !passwordMatches) {
      throw new UnauthorizedException(HttpMessages.INVALID_CREDENTIALS);
    }

    if (!found.status) {
      throw new AccountDisabledException();
    }

    // 稽核資訊，失敗不阻斷登入
    this.saveUser.touchLastLogin(found.id).catch((err) => {
      this.logger.warn('touchLastLogin 失敗', err);
    });

    return issueTokens(this.jwtService, found, found.tokenVersion);
  }
}

/**
 * 帳號不存在時拿來比對的假雜湊。
 *
 * 少了它，「帳號不存在」會**明顯比「密碼錯誤」快**（省掉一次 bcrypt），
 * 而那個時間差本身就是帳號列舉的管道——回應內容一致但耗時不一致，
 * 等於把剛才擋掉的資訊從側通道漏回去。
 */
const DUMMY_HASH =
  '$2b$10$CwTycUXWue0Thq9StjUM0uJ8.CqBqZ0Ck1xQnJ7XKZ5Zx0Zx0Zx0K';

@Injectable()
export class FrontRefreshTokenService implements FrontRefreshUseCase {
  constructor(
    private readonly jwtService: JwtService,
    @Inject(LOAD_USER_PORT) private readonly loadUser: LoadUserPort,
  ) {}

  async execute(refreshToken: string): Promise<FrontTokenPair> {
    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify<JwtPayload>(refreshToken, {
        secret: getEnv().FRONT_REFRESH_SECRET,
      });
    } catch {
      throw new UnauthorizedException(HttpMessages.TOKEN_VERIFY_FAILED);
    }

    if (payload.type !== 'refresh') {
      throw new UnauthorizedException(HttpMessages.TOKEN_WRONG_TYPE);
    }
    // 前台不套用後台的 `side ?? 'admin'` 過渡寬鬆：前台沒有舊 token
    if (payload.side !== 'front') {
      throw new UnauthorizedException(HttpMessages.TOKEN_WRONG_SIDE);
    }

    const user = await this.loadUser.loadUserById(payload.sub);
    if (!user || !user.status) {
      throw new UnauthorizedException(HttpMessages.TOKEN_MEMBER_NOT_FOUND);
    }
    // 不符代表該 token 已被登出或改密碼撤銷
    if (payload.tokenVersion !== user.tokenVersion) {
      throw new UnauthorizedException(HttpMessages.TOKEN_SUPERSEDED);
    }

    return issueTokens(this.jwtService, user, user.tokenVersion);
  }
}

@Injectable()
export class FrontLogoutService implements FrontLogoutUseCase {
  constructor(
    @Inject(SAVE_USER_PORT) private readonly saveUser: SaveUserPort,
  ) {}

  async execute(userId: string): Promise<void> {
    // 遞增 tokenVersion 是「讓所有裝置的既發 token 一次失效」的唯一手段
    await this.saveUser.bumpTokenVersion(userId);
  }
}
