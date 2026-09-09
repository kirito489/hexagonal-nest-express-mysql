import {
  ExecutionContext,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { JwtAuthGuard } from './JwtAuthGuard';
import { FeatureFlagService } from '@app/application/service/shared/FeatureFlagService';
import { TokenBlacklistPort } from '@app/application/port/out/auth/TokenBlacklistPort';
import { MemberContextCachePort } from '@app/application/port/out/member/MemberContextCachePort';
import { LoadMemberContextPort } from '@app/application/port/out/member/LoadMemberContextPort';

jest.mock('../../../../infrastructure/validate-env', () => ({
  getEnv: () => ({
    REDIS_KEY_PREFIX: 'nest:',
    ACCESS_TOKEN_EXPIRES_IN: 28800,
    PERMISSION_CACHE_TTL: 300,
    APPLICATION_PASSWORD_CHANGE_PERIOD: 6,
  }),
}));

const TEST_UUID = '00000000-0000-0000-0000-000000000001';

const makeContext = (authHeader?: string): ExecutionContext => {
  const request = {
    headers: { authorization: authHeader },
    log: { error: jest.fn() },
  };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
};

const mockJwt = {
  verify: jest.fn(),
} as unknown as JwtService;

const mockTokenBlacklist: jest.Mocked<TokenBlacklistPort> = {
  addToBlacklist: jest.fn(),
  isBlacklisted: jest.fn(),
  getBlacklistReason: jest.fn(),
};

const mockMemberContextCache: jest.Mocked<MemberContextCachePort> = {
  getByMemberId: jest.fn(),
  setByMemberId: jest.fn(),
  isAvailable: true,
};

const mockLoadMemberContext: jest.Mocked<LoadMemberContextPort> = {
  loadMemberContext: jest.fn(),
};

const mockFeatureFlags = {
  isEnabled: jest.fn().mockReturnValue(false),
  onModuleInit: jest.fn(),
};

const mockReflector = {
  getAllAndOverride: jest.fn().mockReturnValue(undefined),
} as unknown as Reflector;

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;

  beforeEach(() => {
    jest.clearAllMocks();
    guard = new JwtAuthGuard(
      mockReflector,
      mockJwt,
      mockTokenBlacklist,
      mockMemberContextCache,
      mockLoadMemberContext,
      mockFeatureFlags as unknown as FeatureFlagService,
    );
    guard.onModuleInit();
  });

  it('無 Authorization header → UnauthorizedException', async () => {
    await expect(guard.canActivate(makeContext())).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('Token 在黑名單 → UnauthorizedException', async () => {
    mockTokenBlacklist.isBlacklisted.mockResolvedValue(true);

    await expect(
      guard.canActivate(makeContext('Bearer blacklisted-token')),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('Redis 不可用（isBlacklisted 拋出）→ ServiceUnavailableException', async () => {
    mockTokenBlacklist.isBlacklisted.mockRejectedValue(
      new ServiceUnavailableException('認證服務暫時不可用，請稍後再試'),
    );

    await expect(
      guard.canActivate(makeContext('Bearer some-token')),
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it('Token verify 失敗 → UnauthorizedException', async () => {
    mockTokenBlacklist.isBlacklisted.mockResolvedValue(false);
    (mockJwt.verify as jest.Mock).mockImplementation(() => {
      throw new Error('invalid');
    });

    await expect(
      guard.canActivate(makeContext('Bearer bad-token')),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('快取命中 → 直接回傳 true，不查 DB', async () => {
    mockTokenBlacklist.isBlacklisted.mockResolvedValue(false);
    (mockJwt.verify as jest.Mock).mockReturnValue({
      sub: TEST_UUID,
      type: 'access',
    });
    const cached = JSON.stringify({
      sub: TEST_UUID,
      email: 'u@e.com',
      roleName: 'admin',
      roleCode: 'SUPERADMIN',
      permissions: ['member.view'],
      status: true,
    });
    mockMemberContextCache.getByMemberId.mockResolvedValue(cached);

    const result = await guard.canActivate(makeContext('Bearer valid-token'));

    expect(result).toBe(true);
    expect(mockLoadMemberContext.loadMemberContext).not.toHaveBeenCalled();
  });

  it('快取未命中，DB 查詢成功 → 回傳 true 且寫入快取', async () => {
    mockTokenBlacklist.isBlacklisted.mockResolvedValue(false);
    (mockJwt.verify as jest.Mock).mockReturnValue({
      sub: TEST_UUID,
      type: 'access',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    mockMemberContextCache.getByMemberId.mockResolvedValue(null);
    mockLoadMemberContext.loadMemberContext.mockResolvedValue({
      id: TEST_UUID,
      email: 'u@e.com',
      roleName: 'admin',
      roleCode: 'SUPERADMIN',
      permissions: ['member.view'],
      status: true,
    });

    const result = await guard.canActivate(makeContext('Bearer valid-token'));

    expect(result).toBe(true);
    expect(mockMemberContextCache.setByMemberId).toHaveBeenCalled();
  });

  it('快取未命中，DB 找不到使用者 → UnauthorizedException', async () => {
    mockTokenBlacklist.isBlacklisted.mockResolvedValue(false);
    (mockJwt.verify as jest.Mock).mockReturnValue({
      sub: TEST_UUID,
      type: 'access',
    });
    mockMemberContextCache.getByMemberId.mockResolvedValue(null);
    mockLoadMemberContext.loadMemberContext.mockResolvedValue(null);

    await expect(
      guard.canActivate(makeContext('Bearer valid-token')),
    ).rejects.toThrow(UnauthorizedException);
  });
  /**
   * side 的過渡期行為。
   *
   * 加 `side` 欄位時，**已經簽出去的 admin token 裡沒有它**——當成必填會讓
   * 所有人在部署當下被登出。這一條把那個寬鬆釘住，因為它看起來像個可以順手
   * 收緊的 `??`，而收緊的代價要等到部署才看得見。
   *
   * 前台側不套用這個寬鬆（前台是全新的，不存在舊 token）。
   */
  describe('token 的側別', () => {
    const givenPayload = (payload: Record<string, unknown>) => {
      mockTokenBlacklist.isBlacklisted.mockResolvedValue(false);
      (mockJwt.verify as jest.Mock).mockReturnValue(payload);
      mockMemberContextCache.getByMemberId.mockResolvedValue(
        JSON.stringify({
          sub: TEST_UUID,
          email: 'u@e.com',
          roleName: 'admin',
          roleCode: 'SUPERADMIN',
          permissions: [],
          status: true,
        }),
      );
    };

    it('沒有 side 的舊 token 仍然有效（視為 admin）', async () => {
      givenPayload({ sub: TEST_UUID, type: 'access' });

      await expect(
        guard.canActivate(makeContext('Bearer legacy-token')),
      ).resolves.toBe(true);
    });

    it('side 為 admin → 通過', async () => {
      givenPayload({ sub: TEST_UUID, type: 'access', side: 'admin' });

      await expect(
        guard.canActivate(makeContext('Bearer admin-token')),
      ).resolves.toBe(true);
    });

    it('side 為 front → 拒絕', async () => {
      givenPayload({ sub: TEST_UUID, type: 'access', side: 'front' });

      await expect(
        guard.canActivate(makeContext('Bearer front-token')),
      ).rejects.toThrow();
    });
  });
});
