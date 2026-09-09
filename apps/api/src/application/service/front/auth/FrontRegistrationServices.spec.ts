import { BadRequestException } from '@nestjs/common';
import {
  FrontForgotPasswordService,
  FrontRegisterService,
  FrontResendVerificationService,
  FrontResetPasswordService,
  FrontVerifyEmailService,
} from './FrontRegistrationServices';
import type {
  LoadUserPort,
  UserCredentials,
} from '../../../port/out/user/LoadUserPort';
import type { SaveUserPort } from '../../../port/out/user/SaveUserPort';
import type { UserTokenPort } from '../../../port/out/user/UserTokenPort';
import type { SendEmailPort } from '../../../port/out/shared/SendEmailPort';
import type { PasswordPolicyService } from '../../shared/PasswordPolicyService';

jest.mock('@app/infrastructure/validate-env', () => ({
  getEnv: () => ({
    BCRYPT_ROUNDS: 4,
    EMAIL_VERIFICATION_EXPIRES_IN: 1440,
    FRONT_PASSWORD_RESET_EXPIRES_IN: 30,
    APP_FRONT_URL: 'http://front.test',
    API_BASE_URL: 'http://api.test',
  }),
}));

const USER_ID = '9c2a4f10-7b3e-4d81-9f6a-1e0c5b8d3a72';
const EMAIL = 'user@test.com';

const makeCredentials = (
  overrides: Partial<UserCredentials> = {},
): UserCredentials => ({
  id: USER_ID,
  email: EMAIL,
  displayName: '小明',
  emailVerified: false,
  status: true,
  tokenVersion: 0,
  lastLoginAt: null,
  password: 'hashed',
  ...overrides,
});

const makeMocks = () => {
  const loadUser = {
    loadCredentialsByEmail: jest.fn().mockResolvedValue(null),
    loadUserById: jest.fn(),
  } as jest.Mocked<LoadUserPort>;
  const saveUser = {
    createUser: jest.fn().mockResolvedValue(USER_ID),
    markEmailVerified: jest.fn().mockResolvedValue(undefined),
    updatePassword: jest.fn().mockResolvedValue(undefined),
    touchLastLogin: jest.fn(),
    bumpTokenVersion: jest.fn(),
  } as jest.Mocked<SaveUserPort>;
  const userToken = {
    create: jest.fn().mockResolvedValue('plain-token'),
    claim: jest.fn(),
    invalidateAll: jest.fn().mockResolvedValue(undefined),
  } as jest.Mocked<UserTokenPort>;
  const sendEmail = {
    sendMail: jest.fn().mockResolvedValue(undefined),
  } as jest.Mocked<SendEmailPort>;
  const policy = {
    validateOrThrow: jest.fn(),
  } as unknown as jest.Mocked<PasswordPolicyService>;
  return { loadUser, saveUser, userToken, sendEmail, policy };
};

/** 寄信是 fire-and-forget，斷言前要讓 microtask 跑完 */
const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('FrontRegisterService', () => {
  const build = (m: ReturnType<typeof makeMocks>) =>
    new FrontRegisterService(
      m.loadUser,
      m.saveUser,
      m.userToken,
      m.sendEmail,
      m.policy,
    );

  it('新信箱 → 建立未驗證帳號並寄驗證信', async () => {
    const m = makeMocks();

    await build(m).execute({
      email: EMAIL,
      password: 'FrontPass123!',
      displayName: '小明',
    });
    await flush();

    expect(m.saveUser.createUser).toHaveBeenCalledWith(
      expect.objectContaining({ email: EMAIL, displayName: '小明' }),
    );
    expect(m.userToken.create).toHaveBeenCalledWith(
      USER_ID,
      'VERIFY_EMAIL',
      1440,
    );
    expect(m.sendEmail.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ to: EMAIL, subject: '請驗證您的電子信箱' }),
    );
  });

  it('密碼以雜湊形式存入，不存明文', async () => {
    const m = makeMocks();

    await build(m).execute({
      email: EMAIL,
      password: 'FrontPass123!',
      displayName: '小明',
    });

    const { password } = m.saveUser.createUser.mock.calls[0][0];
    expect(password).not.toBe('FrontPass123!');
    expect(password).toMatch(/^\$2[aby]\$/);
  });

  /**
   * **回 409「此信箱已註冊」是帳號列舉**——任何人都能拿一份信箱清單
   * 問出誰在這個服務有帳號。
   */
  it('信箱已存在 → 不建帳號、不拋錯，改寄通知信給既有擁有者', async () => {
    const m = makeMocks();
    m.loadUser.loadCredentialsByEmail.mockResolvedValue(makeCredentials());

    await expect(
      build(m).execute({
        email: EMAIL,
        password: 'FrontPass123!',
        displayName: '別人',
      }),
    ).resolves.toBeUndefined();
    await flush();

    expect(m.saveUser.createUser).not.toHaveBeenCalled();
    expect(m.userToken.create).not.toHaveBeenCalled();
    expect(m.sendEmail.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ subject: '您的信箱已有帳號' }),
    );
  });

  /**
   * SMTP 連不上會走滿 timeout，讓「帳號已存在」比「不存在」慢兩個數量級
   * ——那是比狀態碼更明顯的列舉訊號。
   */
  it('寄信失敗不影響回傳（fire-and-forget）', async () => {
    const m = makeMocks();
    m.sendEmail.sendMail.mockRejectedValue(new Error('SMTP down'));

    await expect(
      build(m).execute({
        email: EMAIL,
        password: 'FrontPass123!',
        displayName: '小明',
      }),
    ).resolves.toBeUndefined();
    await flush();
  });

  it('密碼不符政策 → 在建立帳號之前就擋下', async () => {
    const m = makeMocks();
    (m.policy.validateOrThrow as jest.Mock).mockImplementation(() => {
      throw new BadRequestException('密碼太弱');
    });

    await expect(
      build(m).execute({ email: EMAIL, password: 'x', displayName: '小明' }),
    ).rejects.toThrow(BadRequestException);
    expect(m.saveUser.createUser).not.toHaveBeenCalled();
  });

  it('email 正規化後才查詢與建立', async () => {
    const m = makeMocks();

    await build(m).execute({
      email: '  User@Test.com  ',
      password: 'FrontPass123!',
      displayName: '小明',
    });

    expect(m.loadUser.loadCredentialsByEmail).toHaveBeenCalledWith(EMAIL);
    expect(m.saveUser.createUser.mock.calls[0][0].email).toBe(EMAIL);
  });
});

describe('FrontVerifyEmailService', () => {
  const build = (m: ReturnType<typeof makeMocks>) =>
    new FrontVerifyEmailService(m.saveUser, m.userToken);

  it('有效 token → 寫入 emailVerifiedAt 並回 success', async () => {
    const m = makeMocks();
    m.userToken.claim.mockResolvedValue({ userId: USER_ID });

    await expect(build(m).execute('t')).resolves.toBe('success');
    expect(m.saveUser.markEmailVerified).toHaveBeenCalledWith(USER_ID);
  });

  it('claim 時指定 VERIFY_EMAIL 用途', async () => {
    const m = makeMocks();
    m.userToken.claim.mockResolvedValue({ userId: USER_ID });

    await build(m).execute('t');

    expect(m.userToken.claim).toHaveBeenCalledWith('t', 'VERIFY_EMAIL');
  });

  /** 不拋例外：呼叫端要把結果轉成 302，錯誤頁對點信的使用者沒有意義 */
  it('無效 token → 回 invalid，不拋例外', async () => {
    const m = makeMocks();
    m.userToken.claim.mockResolvedValue(null);

    await expect(build(m).execute('bad')).resolves.toBe('invalid');
    expect(m.saveUser.markEmailVerified).not.toHaveBeenCalled();
  });
});

describe('FrontResendVerificationService', () => {
  const build = (m: ReturnType<typeof makeMocks>) =>
    new FrontResendVerificationService(m.loadUser, m.userToken, m.sendEmail);

  it('未驗證的帳號 → 先作廢舊 token 再寄新的', async () => {
    const m = makeMocks();
    m.loadUser.loadCredentialsByEmail.mockResolvedValue(makeCredentials());

    await build(m).execute(EMAIL);
    await flush();

    expect(m.userToken.invalidateAll).toHaveBeenCalledWith(
      USER_ID,
      'VERIFY_EMAIL',
    );
    expect(m.userToken.create).toHaveBeenCalled();
    expect(m.sendEmail.sendMail).toHaveBeenCalled();
  });

  it.each([
    ['帳號不存在', null],
    ['已驗證', makeCredentials({ emailVerified: true })],
  ])('%s → 靜默略過，不寄信', async (_name, user) => {
    const m = makeMocks();
    m.loadUser.loadCredentialsByEmail.mockResolvedValue(user);

    await expect(build(m).execute(EMAIL)).resolves.toBeUndefined();
    await flush();

    expect(m.sendEmail.sendMail).not.toHaveBeenCalled();
  });
});

describe('FrontForgotPasswordService', () => {
  const build = (m: ReturnType<typeof makeMocks>) =>
    new FrontForgotPasswordService(m.loadUser, m.userToken, m.sendEmail);

  it('帳號存在 → 產生重設 token 並寄信', async () => {
    const m = makeMocks();
    m.loadUser.loadCredentialsByEmail.mockResolvedValue(makeCredentials());

    await build(m).execute(EMAIL);
    await flush();

    expect(m.userToken.create).toHaveBeenCalledWith(
      USER_ID,
      'RESET_PASSWORD',
      30,
    );
    expect(m.sendEmail.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ subject: '密碼重設通知' }),
    );
  });

  it('帳號不存在 → 靜默略過，不寄信', async () => {
    const m = makeMocks();

    await expect(build(m).execute('ghost@test.com')).resolves.toBeUndefined();
    await flush();

    expect(m.sendEmail.sendMail).not.toHaveBeenCalled();
  });
});

describe('FrontResetPasswordService', () => {
  const build = (m: ReturnType<typeof makeMocks>) =>
    new FrontResetPasswordService(m.saveUser, m.userToken, m.policy);

  it('有效 token → 更新密碼並作廢其他重設 token', async () => {
    const m = makeMocks();
    m.userToken.claim.mockResolvedValue({ userId: USER_ID });

    await build(m).execute({ token: 't', newPassword: 'NewPass123!' });

    expect(m.userToken.claim).toHaveBeenCalledWith('t', 'RESET_PASSWORD');
    expect(m.saveUser.updatePassword).toHaveBeenCalledWith(
      USER_ID,
      expect.stringMatching(/^\$2[aby]\$/),
    );
    expect(m.userToken.invalidateAll).toHaveBeenCalledWith(
      USER_ID,
      'RESET_PASSWORD',
    );
  });

  it('token 無效 → 400', async () => {
    const m = makeMocks();
    m.userToken.claim.mockResolvedValue(null);

    await expect(
      build(m).execute({ token: 'bad', newPassword: 'NewPass123!' }),
    ).rejects.toThrow(BadRequestException);
  });

  /**
   * 順序很重要：反過來的話 token 會被消耗掉，而使用者只是密碼打太短，
   * 卻得重新申請一封信。
   */
  it('密碼政策在 claim 之前檢查，不白白消耗 token', async () => {
    const m = makeMocks();
    (m.policy.validateOrThrow as jest.Mock).mockImplementation(() => {
      throw new BadRequestException('密碼太弱');
    });

    await expect(
      build(m).execute({ token: 't', newPassword: 'x' }),
    ).rejects.toThrow(BadRequestException);
    expect(m.userToken.claim).not.toHaveBeenCalled();
  });
});
