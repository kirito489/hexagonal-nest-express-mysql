import { Inject, Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  RefreshTokenCommand,
  RefreshTokenResult,
  RefreshTokenUseCase,
} from '../../port/in/auth/RefreshTokenUseCase';
import {
  TOKEN_BLACKLIST_PORT,
  TokenBlacklistPort,
} from '../../port/out/auth/TokenBlacklistPort';
import {
  LOAD_MEMBER_CONTEXT_PORT,
  LoadMemberContextPort,
  MemberContextData,
} from '../../port/out/member/LoadMemberContextPort';
import {
  SAVE_AUTH_LOG_PORT,
  SaveAuthLogPort,
} from '../../port/out/auth/SaveAuthLogPort';
import { FeatureFlagService } from '../FeatureFlagService';
import { JwtPayload } from '../../port/jwt-payload';
import { getEnv } from '../../../infrastructure/validate-env';
import { InvalidRefreshTokenException } from '../../../domain/exception/InvalidRefreshTokenException';
import { AccountDisabledException } from '../../../domain/exception/AccountDisabledException';

/**
 * Refresh Token で Access Token を再発行 / 使用 Refresh Token 重新發行 Access Token
 *
 * Refresh token 採絕對效期，不旋轉。
 * 帳號停用、在黑名單、type 不符一律拒絕。
 * 啟用 authLogEnabled 時將 REFRESH 事件記錄至 auth_logs。
 */
@Injectable()
export class RefreshTokenService implements RefreshTokenUseCase {
  private readonly logger = new Logger(RefreshTokenService.name);

  constructor(
    private readonly jwtService: JwtService,
    @Inject(TOKEN_BLACKLIST_PORT)
    private readonly tokenBlacklist: TokenBlacklistPort,
    @Inject(LOAD_MEMBER_CONTEXT_PORT)
    private readonly loadMemberContext: LoadMemberContextPort,
    @Inject(SAVE_AUTH_LOG_PORT)
    private readonly saveAuthLog: SaveAuthLogPort,
    private readonly featureFlags: FeatureFlagService,
  ) {}

  async execute(command: RefreshTokenCommand): Promise<RefreshTokenResult> {
    const { refreshToken } = command;
    const env = getEnv();

    if (await this.tokenBlacklist.isBlacklisted(refreshToken)) {
      throw new InvalidRefreshTokenException();
    }

    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify<JwtPayload>(refreshToken, {
        secret: env.REFRESH_SECRET,
      });
    } catch {
      throw new InvalidRefreshTokenException();
    }

    if (payload.type !== 'refresh') {
      throw new InvalidRefreshTokenException();
    }

    const context = await this.loadMemberContext.loadMemberContext(payload.sub);
    if (!context) {
      throw new InvalidRefreshTokenException();
    }
    if (!context.status) {
      throw new AccountDisabledException();
    }

    const accessToken = this.jwtService.sign(
      { sub: payload.sub, type: 'access' } satisfies JwtPayload,
      { secret: env.ACCESS_SECRET, expiresIn: env.ACCESS_TOKEN_EXPIRES_IN },
    );

    await this.logAuth(context, payload.sub, command);

    return {
      accessToken,
      accessTokenExpiresIn: env.ACCESS_TOKEN_EXPIRES_IN,
    };
  }

  /**
   * REFRESH auth log 記錄（FeatureFlag 控制）
   */
  private async logAuth(
    context: MemberContextData,
    memberId: string,
    command: RefreshTokenCommand,
  ): Promise<void> {
    if (!this.featureFlags.isEnabled('authLogEnabled')) return;
    try {
      await this.saveAuthLog.saveAuthLog({
        memberId,
        email: context.email,
        action: 'REFRESH',
        ipAddress: command.ip,
        userAgent: command.userAgent,
      });
    } catch (err) {
      this.logger.error('更新日誌寫入失敗', err);
    }
  }
}
