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
 * 使用 Refresh Token 重新發行 Access Token + 新的 Refresh Token（rotation）。
 *
 * Refresh rotation：每次 refresh 同時發新 access 與新 refresh，舊 refresh 加入黑名單。
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
    const newRefreshToken = this.jwtService.sign(
      { sub: payload.sub, type: 'refresh' } satisfies JwtPayload,
      { secret: env.REFRESH_SECRET, expiresIn: env.REFRESH_TOKEN_EXPIRES_IN },
    );

    // Rotation：把剛用過的 refresh token 加入黑名單，TTL 配合其剩餘有效期
    // 攻擊者偷到 refresh 但比使用者晚一步 → 進到這個 if 時舊 token 已 blacklisted → 攔下
    const remainingTtl = this.computeRemainingTtl(payload.exp);
    if (remainingTtl > 0) {
      await this.tokenBlacklist.addToBlacklist(refreshToken, remainingTtl);
    }

    await this.logAuth(context, payload.sub, command);

    return {
      accessToken,
      accessTokenExpiresIn: env.ACCESS_TOKEN_EXPIRES_IN,
      refreshToken: newRefreshToken,
      refreshTokenExpiresIn: env.REFRESH_TOKEN_EXPIRES_IN,
    };
  }

  private computeRemainingTtl(exp: number | undefined): number {
    if (!exp) return 0;
    const now = Math.floor(Date.now() / 1000);
    return Math.max(0, exp - now);
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
