import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { LoginService } from './LoginService';
import { FeatureFlagService } from '../../shared/FeatureFlagService';
import { LoadMemberPort } from '../../../port/out/member/LoadMemberPort';
import { SaveMemberPort } from '../../../port/out/member/SaveMemberPort';
import { SaveAuthLogPort } from '../../../port/out/auth/SaveAuthLogPort';
import { AccountLockPort } from '../../../port/out/auth/AccountLockPort';
import { IpBlockPort } from '../../../port/out/security/IpBlockPort';
import { IpListPort } from '../../../port/out/security/IpListPort';
import { RecaptchaVerifyPort } from '../../../port/out/auth/RecaptchaVerifyPort';
import { SessionActivityPort } from '../../../port/out/auth/SessionActivityPort';
import { Member } from '@app/domain/model/Member';
import { AccountDisabledException } from '@app/domain/exception/AccountDisabledException';
import { AccountLockedException } from '@app/domain/exception/AccountLockedException';

jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  // 帳號不存在時用來抹平時間差的假 hash
  hashSync: jest.fn().mockReturnValue('$2b$04$dummy'),
}));

jest.mock('../../../../infrastructure/validate-env', () => ({
  getEnv: () => ({
    ACCESS_SECRET: 'test-access-secret',
    ACCESS_TOKEN_EXPIRES_IN: 7200,
    REFRESH_SECRET: 'test-refresh-secret',
    REFRESH_TOKEN_EXPIRES_IN: 86400,
    APPLICATION_SESSION_IDLE_TIMEOUT: 120,
    APPLICATION_ACCOUNT_LOCK_THRESHOLD: 3,
    APPLICATION_ACCOUNT_LOCK_DURATION_MIN: 15,
    APPLICATION_IP_BLOCK_THRESHOLD: 5,
  }),
}));

const MEMBER_ID = '00000000-0000-0000-0000-000000000001';
const ROLE_ID = '00000000-0000-0000-0000-000000000002';

const makeMember = (status = true) =>
  Member.reconstitute(
    MEMBER_ID,
    'admin@test.com',
    'Admin',
    '$2b$10$hashed',
    ROLE_ID,
    status,
    false,
    new Date(),
    'Admin',
  );

const mockLoadMember = {
  loadMemberByEmail: jest.fn(),
  loadMemberById: jest.fn(),
  loadMemberDomainById: jest.fn(),
  existsByEmail: jest.fn(),
  listMembers: jest.fn(),
  loadMemberContext: jest.fn(),
} as unknown as jest.Mocked<LoadMemberPort>;

const mockSaveAuthLog = {
  saveAuthLog: jest.fn(),
} as jest.Mocked<SaveAuthLogPort>;

const mockSaveMember = {
  createMember: jest.fn(),
  updateMember: jest.fn(),
  saveMemberWithPassword: jest.fn(),
  deleteMember: jest.fn(),
  updateLastLoginAt: jest.fn().mockResolvedValue(undefined),
  incrementTokenVersion: jest.fn(),
} as jest.Mocked<SaveMemberPort>;

const mockAccountLock = {
  isLocked: jest.fn().mockResolvedValue(false),
  checkLock: jest.fn().mockResolvedValue('NONE'),
  lockAccount: jest.fn(),
  recordFailedLogin: jest.fn().mockResolvedValue(0),
  resetFailedLogin: jest.fn(),
  unlockAccount: jest.fn(),
  listLocked: jest.fn().mockResolvedValue({ list: [], total: 0 }),
} as unknown as jest.Mocked<AccountLockPort>;

/**
 * 設定「這個帳號目前的鎖定狀態」，不指定 service 用哪支 port 方法去問。
 *
 * 同時餵新舊兩支（布林的 `isLocked` 與三態的 `checkLock`），
 * 讓斷言只依賴**行為**——鎖定狀態的查詢方式改變時，這裡改一處即可，
 * 各個測試不必跟著動。綁在單一機制上的測試在重構當下就得改寫，
 * 而那正好是最需要它保持不變的時刻。
 */
const givenLockState = (state: 'none' | 'locked' | 'expired'): void => {
  const mock = mockAccountLock as unknown as {
    isLocked: jest.Mock;
    checkLock: jest.Mock;
  };
  mock.isLocked.mockResolvedValue(state === 'locked');
  mock.checkLock.mockResolvedValue(state.toUpperCase());
};

const mockIpBlock = {
  recordFailedIpAttempt: jest.fn().mockResolvedValue(0),
  resetIpAttempts: jest.fn(),
} as jest.Mocked<IpBlockPort>;

const mockIpList = {
  addToBlacklist: jest.fn(),
  removeFromBlacklist: jest.fn(),
  isBlacklisted: jest.fn(),
  listBlacklist: jest.fn(),
  addToWhitelist: jest.fn(),
  removeFromWhitelist: jest.fn(),
  isWhitelisted: jest.fn(),
  listWhitelist: jest.fn(),
} as unknown as jest.Mocked<IpListPort>;

const mockRecaptcha = {
  verify: jest.fn().mockResolvedValue(true),
} as jest.Mocked<RecaptchaVerifyPort>;

const mockSessionActivity = {
  touchActivity: jest.fn(),
  getLastActivity: jest.fn(),
  isActive: jest.fn(),
} as unknown as jest.Mocked<SessionActivityPort>;

const mockJwt = {
  sign: jest.fn().mockReturnValue('mock-token'),
} as unknown as jest.Mocked<JwtService>;

const makeFeatureFlags = (overrides: Partial<Record<string, boolean>> = {}) =>
  ({
    isEnabled: jest.fn((flag: string) => overrides[flag] ?? false),
    onModuleInit: jest.fn(),
  }) as unknown as FeatureFlagService;

const makeService = (flags?: FeatureFlagService) =>
  new LoginService(
    mockLoadMember,
    mockSaveMember,
    mockSaveAuthLog,
    mockAccountLock,
    mockIpBlock,
    mockIpList,
    mockRecaptcha,
    mockSessionActivity,
    mockJwt,
    flags ?? makeFeatureFlags(),
  );

describe('LoginService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (mockJwt.sign as jest.Mock).mockReturnValue('mock-token');
  });

  it('正確憑證 → 回傳 accessToken、refreshToken 及會員資訊', async () => {
    (mockLoadMember.loadMemberByEmail as jest.Mock).mockResolvedValue(
      makeMember(),
    );
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);

    const result = await makeService().execute({
      email: 'admin@test.com',
      password: 'Password1!',
    });

    expect(result.accessToken).toBe('mock-token');
    expect(result.refreshToken).toBe('mock-token');
    expect(result.member.id).toBe(MEMBER_ID);
    expect(mockJwt.sign).toHaveBeenCalledTimes(2);
  });

  it('登入成功 → 觸發 updateLastLoginAt（fire-and-forget）', async () => {
    (mockLoadMember.loadMemberByEmail as jest.Mock).mockResolvedValue(
      makeMember(),
    );
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    mockSaveMember.updateLastLoginAt.mockClear();

    await makeService().execute({
      email: 'admin@test.com',
      password: 'Password1!',
    });

    expect(mockSaveMember.updateLastLoginAt).toHaveBeenCalledWith(MEMBER_ID);
    expect(mockSaveMember.updateLastLoginAt).toHaveBeenCalledTimes(1);
  });

  it('updateLastLoginAt 失敗不應阻擋登入流程（catch + warn）', async () => {
    (mockLoadMember.loadMemberByEmail as jest.Mock).mockResolvedValue(
      makeMember(),
    );
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    mockSaveMember.updateLastLoginAt.mockRejectedValueOnce(
      new Error('DB down'),
    );

    const result = await makeService().execute({
      email: 'admin@test.com',
      password: 'Password1!',
    });

    expect(result.accessToken).toBe('mock-token');
  });

  it('會員不存在 → 拋出 UnauthorizedException', async () => {
    (mockLoadMember.loadMemberByEmail as jest.Mock).mockResolvedValue(null);

    await expect(
      makeService().execute({ email: 'no@test.com', password: 'pw' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  // 少了這一步，「帳號不存在」會比「密碼錯誤」快約一個 bcrypt 的時間（rounds=12 下約 100ms），
  // 訊息雖然統一，回應時間仍足以用來列舉帳號
  it('會員不存在 → 仍執行一次 bcrypt 比對以抹平時間差', async () => {
    (mockLoadMember.loadMemberByEmail as jest.Mock).mockResolvedValue(null);
    const compare = jest.mocked(bcrypt.compare);
    compare.mockClear();

    await expect(
      makeService().execute({ email: 'no@test.com', password: 'pw' }),
    ).rejects.toThrow(UnauthorizedException);

    expect(compare).toHaveBeenCalledTimes(1);
  });

  it('密碼錯誤 → 拋出 UnauthorizedException', async () => {
    (mockLoadMember.loadMemberByEmail as jest.Mock).mockResolvedValue(
      makeMember(),
    );
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);

    await expect(
      makeService().execute({ email: 'admin@test.com', password: 'wrong' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('帳號已停用（status=false）→ 拋出 AccountDisabledException', async () => {
    (mockLoadMember.loadMemberByEmail as jest.Mock).mockResolvedValue(
      makeMember(false),
    );
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);

    await expect(
      makeService().execute({
        email: 'admin@test.com',
        password: 'Password1!',
      }),
    ).rejects.toThrow(AccountDisabledException);
  });

  it('帳號鎖定功能啟用且帳號已鎖定 → 拋出 ForbiddenException', async () => {
    givenLockState('locked');
    const service = makeService(makeFeatureFlags({ accountLockEnabled: true }));

    await expect(
      service.execute({ email: 'admin@test.com', password: 'pw' }),
    ).rejects.toThrow(AccountLockedException);
    expect(mockLoadMember.loadMemberByEmail).not.toHaveBeenCalled();
  });

  // ── characterization：釘住現行的鎖定行為，供 platform-security-hardening 重構時比對 ──
  //
  // 斷言一律寫在**行為**（被拒絕 / 放行）上，不寫在機制（呼叫了哪支 port 方法）上。
  // 鎖定狀態的查詢即將由布林的 isLocked 換成三態的 checkLock，綁在機制上的測試
  // 屆時得跟著改，而改測試的同時就失去了它要提供的保護。
  describe('characterization：鎖定行為', () => {
    it('已鎖定 + 密碼正確 → 仍然被拒絕', async () => {
      givenLockState('locked');
      (mockLoadMember.loadMemberByEmail as jest.Mock).mockResolvedValue(
        makeMember(),
      );
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await expect(
        makeService(makeFeatureFlags({ accountLockEnabled: true })).execute({
          email: 'admin@test.com',
          password: 'Password1!',
        }),
      ).rejects.toThrow(AccountLockedException);
    });

    it('已鎖定 + 密碼錯誤 → 被拒絕，且不是密碼錯誤的那種拒絕', async () => {
      givenLockState('locked');
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        makeService(makeFeatureFlags({ accountLockEnabled: true })).execute({
          email: 'admin@test.com',
          password: 'wrong',
        }),
      ).rejects.toThrow(AccountLockedException);
    });

    it('未鎖定 + 密碼正確 → 放行', async () => {
      givenLockState('none');
      (mockLoadMember.loadMemberByEmail as jest.Mock).mockResolvedValue(
        makeMember(),
      );
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await makeService(
        makeFeatureFlags({ accountLockEnabled: true }),
      ).execute({ email: 'admin@test.com', password: 'Password1!' });

      expect(result.accessToken).toBe('mock-token');
    });

    it('鎖定已逾時 + 密碼正確 → 放行', async () => {
      givenLockState('expired');
      (mockLoadMember.loadMemberByEmail as jest.Mock).mockResolvedValue(
        makeMember(),
      );
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await makeService(
        makeFeatureFlags({ accountLockEnabled: true }),
      ).execute({ email: 'admin@test.com', password: 'Password1!' });

      expect(result.accessToken).toBe('mock-token');
    });

    // 「到期要清計數」只能在**登入失敗**的情境驗。
    // 成功路徑本來就會呼叫 resetFailedLogin，在那裡斷言的話，
    // 把 EXPIRED 分支的清除整段拿掉測試照樣綠——斷言被成功路徑餵飽了。
    // 這裡密碼是錯的，走不到成功路徑，resetFailedLogin 只可能來自 EXPIRED 分支。
    it('鎖定已逾時 + 密碼錯誤 → 回 401，且殘留的失敗計數已被清掉', async () => {
      givenLockState('expired');
      (mockLoadMember.loadMemberByEmail as jest.Mock).mockResolvedValue(
        makeMember(),
      );
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        makeService(makeFeatureFlags({ accountLockEnabled: true })).execute({
          email: 'admin@test.com',
          password: 'wrong',
        }),
      ).rejects.toThrow(UnauthorizedException);

      // 不清的話，Redis 計數的 TTL（30 分）比時效（15 分）長，
      // 使用者到期後第一次打錯就會因為「計數還在閾值上」立刻重新被鎖
      expect(mockAccountLock.resetFailedLogin).toHaveBeenCalledWith(
        'admin@test.com',
      );
    });

    it('鎖定功能關閉 → 即使處於鎖定狀態也放行', async () => {
      givenLockState('locked');
      (mockLoadMember.loadMemberByEmail as jest.Mock).mockResolvedValue(
        makeMember(),
      );
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await makeService().execute({
        email: 'admin@test.com',
        password: 'Password1!',
      });

      expect(result.accessToken).toBe('mock-token');
    });
  });
});
