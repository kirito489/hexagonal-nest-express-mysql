import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import {
  LOAD_MEMBER_CONTEXT_PORT,
  LoadMemberContextPort,
} from '../../../../application/port/out/member/LoadMemberContextPort';
import {
  TOKEN_BLACKLIST_PORT,
  TokenBlacklistPort,
} from '../../../../application/port/out/auth/TokenBlacklistPort';
import {
  MEMBER_CONTEXT_CACHE_PORT,
  MemberContextCachePort,
} from '../../../../application/port/out/member/MemberContextCachePort';
import { FeatureFlagService } from '../../../../application/service/FeatureFlagService';
import { JwtPayload } from '../../../../application/port/jwt-payload';
import { getEnv } from '../../../../infrastructure/validate-env';
import {
  MemberContext,
  MemberContextSchema,
} from '../decorator/current-member.decorator';
import { AccountDisabledException } from '../../../../domain/exception/AccountDisabledException';
import { PasswordChangeRequiredException } from '../../../../domain/exception/PasswordChangeRequiredException';

@Injectable()
export class JwtAuthGuard implements CanActivate, OnModuleInit {
  private readonly logger = new Logger(JwtAuthGuard.name);
  private jwtExpiresIn = 0;
  private permissionCacheTtl = 0;

  constructor(
    private readonly jwtService: JwtService,
    @Inject(TOKEN_BLACKLIST_PORT)
    private readonly tokenBlacklist: TokenBlacklistPort,
    @Inject(MEMBER_CONTEXT_CACHE_PORT)
    private readonly memberContextCache: MemberContextCachePort,
    @Inject(LOAD_MEMBER_CONTEXT_PORT)
    private readonly loadMemberContext: LoadMemberContextPort,
    private readonly featureFlags: FeatureFlagService,
  ) {}

  onModuleInit(): void {
    const env = getEnv();
    this.jwtExpiresIn = env.ACCESS_TOKEN_EXPIRES_IN;
    this.permissionCacheTtl = env.PERMISSION_CACHE_TTL;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException('缺少授權憑證，請先登入');
    }

    if (await this.tokenBlacklist.isBlacklisted(token)) {
      this.logger.warn('Token 已在黑名單中');
      throw new UnauthorizedException('Token 已登出或失效');
    }

    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException('Token 驗證失敗');
    }

    //防止 refresh token 被當 access token 使用
    if (payload.type !== 'access') {
      throw new UnauthorizedException('Token 類型不正確');
    }

    const cached = await this.memberContextCache.getByMemberId(payload.sub);
    if (cached) {
      const parsed = MemberContextSchema.safeParse(JSON.parse(cached));
      if (parsed.success) {
        if (!parsed.data.status) throw new AccountDisabledException();
        (request as Request & { member: MemberContext }).member = parsed.data;
        this.checkPasswordExpiry(parsed.data);
        return true;
      }
      // 快取格式不符（可能為 schema 變更後的舊快取），fallback 到 DB 查詢並覆寫快取
      this.logger.warn(
        '[JwtAuthGuard] MemberContext 快取格式不符，fallback 到 DB 查詢',
      );
    }

    if (!this.memberContextCache.isAvailable) {
      this.logger.warn(
        '[JwtAuthGuard] Redis 不可用，MemberContext 快取降級，每次請求直接查詢 DB',
      );
    }

    const data = await this.loadMemberContext.loadMemberContext(payload.sub);
    if (!data) {
      throw new UnauthorizedException('會員不存在');
    }
    if (!data.status) throw new AccountDisabledException();

    const memberContext: MemberContext = {
      sub: data.id,
      email: data.email,
      roleName: data.roleName,
      permissions: data.permissions,
      status: data.status,
      lastPasswordChange: data.lastPasswordChange
        ? data.lastPasswordChange.toISOString()
        : null,
    };

    (request as Request & { member: MemberContext }).member = memberContext;

    const now = Math.floor(Date.now() / 1000);
    const jwtTtl = payload.exp ? payload.exp - now : this.jwtExpiresIn;
    const ttl = Math.min(jwtTtl, this.permissionCacheTtl);
    if (ttl > 0) {
      await this.memberContextCache.setByMemberId(
        payload.sub,
        JSON.stringify(memberContext),
        ttl,
      );
    }

    this.checkPasswordExpiry(memberContext);
    return true;
  }

  private checkPasswordExpiry(member: MemberContext): void {
    if (!this.featureFlags.isEnabled('passwordChangeEnabled')) return;

    const env = getEnv();
    const period = env.APPLICATION_PASSWORD_CHANGE_PERIOD;
    if (period <= 0) return;

    if (!member.lastPasswordChange) {
      throw new PasswordChangeRequiredException();
    }

    const lastChange = new Date(member.lastPasswordChange);
    const expiryDate = new Date(lastChange);
    expiryDate.setMonth(expiryDate.getMonth() + period);

    if (new Date() > expiryDate) {
      throw new PasswordChangeRequiredException();
    }
  }

  private readonly extractToken = (request: Request): string | null => {
    const auth = request.headers.authorization;
    return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
  };
}
