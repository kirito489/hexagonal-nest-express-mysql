import { JwtService } from '@nestjs/jwt';
import { RefreshTokenService } from './RefreshTokenService';
import { TokenBlacklistPort } from '../../port/out/auth/TokenBlacklistPort';
import { LoadMemberContextPort } from '../../port/out/member/LoadMemberContextPort';
import { SaveAuthLogPort } from '../../port/out/auth/SaveAuthLogPort';
import { FeatureFlagService } from '../FeatureFlagService';
import { InvalidRefreshTokenException } from '../../../domain/exception/InvalidRefreshTokenException';
import { AccountDisabledException } from '../../../domain/exception/AccountDisabledException';

jest.mock('../../../infrastructure/validate-env', () => ({
  getEnv: () => ({
    ACCESS_SECRET: 'a'.repeat(32),
    REFRESH_SECRET: 'b'.repeat(32),
    ACCESS_TOKEN_EXPIRES_IN: 7200,
    REFRESH_TOKEN_EXPIRES_IN: 604800,
  }),
}));

const MEMBER_UUID = '00000000-0000-4000-8000-000000000001';

const makeContext = () => ({
  id: MEMBER_UUID,
  email: 'u@e.com',
  roleName: '管理者',
  roleCode: 'SUPERADMIN',
  permissions: ['BACKEND:ACCOUNT:VIEW'],
  status: true,
});

describe('RefreshTokenService', () => {
  let service: RefreshTokenService;
  let jwt: { sign: jest.Mock; verify: jest.Mock };
  let blacklist: jest.Mocked<TokenBlacklistPort>;
  let loadMemberContext: jest.Mocked<LoadMemberContextPort>;
  let saveAuthLog: jest.Mocked<SaveAuthLogPort>;
  let featureFlags: { isEnabled: jest.Mock };

  beforeEach(() => {
    jwt = {
      sign: jest.fn((payload: { type: string }) => `signed:${payload.type}`),
      verify: jest.fn(),
    };
    blacklist = {
      isBlacklisted: jest.fn().mockResolvedValue(false),
      addToBlacklist: jest.fn().mockResolvedValue(undefined),
    };
    loadMemberContext = {
      loadMemberContext: jest.fn().mockResolvedValue(makeContext()),
    };
    saveAuthLog = { saveAuthLog: jest.fn() };
    featureFlags = { isEnabled: jest.fn().mockReturnValue(false) };

    service = new RefreshTokenService(
      jwt as unknown as JwtService,
      blacklist,
      loadMemberContext,
      saveAuthLog,
      featureFlags as unknown as FeatureFlagService,
    );
  });

  it('合法 refresh token → 回傳新 access + 新 refresh，舊 refresh 進黑名單', async () => {
    const futureExp = Math.floor(Date.now() / 1000) + 3600;
    jwt.verify.mockReturnValue({
      sub: MEMBER_UUID,
      type: 'refresh',
      exp: futureExp,
    });

    const result = await service.execute({ refreshToken: 'old-refresh' });

    expect(result.accessToken).toBe('signed:access');
    expect(result.refreshToken).toBe('signed:refresh');
    expect(result.accessTokenExpiresIn).toBe(7200);
    expect(result.refreshTokenExpiresIn).toBe(604800);
    expect(blacklist.addToBlacklist).toHaveBeenCalledWith(
      'old-refresh',
      expect.any(Number),
    );
    const [, ttl] = blacklist.addToBlacklist.mock.calls[0];
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(3600);
  });

  it('舊 refresh 已在黑名單 → InvalidRefreshTokenException（rotation 重用偵測前提）', async () => {
    blacklist.isBlacklisted.mockResolvedValueOnce(true);

    await expect(
      service.execute({ refreshToken: 'reused' }),
    ).rejects.toBeInstanceOf(InvalidRefreshTokenException);
    expect(jwt.verify).not.toHaveBeenCalled();
    expect(blacklist.addToBlacklist).not.toHaveBeenCalled();
  });

  it('payload.type 不是 refresh → InvalidRefreshTokenException', async () => {
    jwt.verify.mockReturnValue({ sub: MEMBER_UUID, type: 'access' });

    await expect(
      service.execute({ refreshToken: 'wrong-type' }),
    ).rejects.toBeInstanceOf(InvalidRefreshTokenException);
  });

  it('jwt verify 失敗（簽章不對 / 過期）→ InvalidRefreshTokenException', async () => {
    jwt.verify.mockImplementation(() => {
      throw new Error('invalid signature');
    });

    await expect(
      service.execute({ refreshToken: 'bad-sig' }),
    ).rejects.toBeInstanceOf(InvalidRefreshTokenException);
  });

  it('member 找不到 → InvalidRefreshTokenException', async () => {
    jwt.verify.mockReturnValue({
      sub: MEMBER_UUID,
      type: 'refresh',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    loadMemberContext.loadMemberContext.mockResolvedValueOnce(null);

    await expect(
      service.execute({ refreshToken: 'orphan' }),
    ).rejects.toBeInstanceOf(InvalidRefreshTokenException);
  });

  it('帳號停用 → AccountDisabledException', async () => {
    jwt.verify.mockReturnValue({
      sub: MEMBER_UUID,
      type: 'refresh',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    loadMemberContext.loadMemberContext.mockResolvedValueOnce({
      ...makeContext(),
      status: false,
    });

    await expect(
      service.execute({ refreshToken: 'disabled' }),
    ).rejects.toBeInstanceOf(AccountDisabledException);
  });

  it('payload 沒有 exp → 不呼叫 addToBlacklist（TTL = 0 時跳過）', async () => {
    jwt.verify.mockReturnValue({ sub: MEMBER_UUID, type: 'refresh' });

    await service.execute({ refreshToken: 'no-exp' });

    expect(blacklist.addToBlacklist).not.toHaveBeenCalled();
  });
});
