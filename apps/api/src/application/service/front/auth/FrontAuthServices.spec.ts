import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import {
  FrontLoginService,
  FrontLogoutService,
  FrontRefreshTokenService,
} from './FrontAuthServices';
import type {
  LoadUserPort,
  UserContext,
  UserCredentials,
} from '../../../port/out/user/LoadUserPort';
import type { SaveUserPort } from '../../../port/out/user/SaveUserPort';
import { AccountDisabledException } from '@app/domain/exception/AccountDisabledException';

// bcrypt 的 export 不可 redefine，spyOn 會拋 TypeError——用 module mock 包住真實實作
jest.mock('bcrypt', () => {
  const actual = jest.requireActual<typeof import('bcrypt')>('bcrypt');
  // 明確指定回傳型別：actual.compare 有 callback 版的多載，
  // 直接傳會被挑到回傳 void 的那一個而觸發 no-misused-promises
  const compare = jest.fn(
    (data: string, hash: string): Promise<boolean> =>
      actual.compare(data, hash),
  );
  return { ...actual, compare };
});

jest.mock('@app/infrastructure/validate-env', () => ({
  getEnv: () => ({
    FRONT_ACCESS_SECRET: 'front-access-secret-at-least-32ch',
    FRONT_REFRESH_SECRET: 'front-refresh-secret-at-least-32c',
    ACCESS_TOKEN_EXPIRES_IN: 900,
    REFRESH_TOKEN_EXPIRES_IN: 86400,
  }),
}));

const USER_ID = '9c2a4f10-7b3e-4d81-9f6a-1e0c5b8d3a72';
const PASSWORD = 'FrontPass123!';

const makeContext = (overrides: Partial<UserContext> = {}): UserContext => ({
  id: USER_ID,
  email: 'user@test.com',
  displayName: '小明',
  emailVerified: false,
  status: true,
  tokenVersion: 0,
  lastLoginAt: null,
  ...overrides,
});

const makeCredentials = async (
  overrides: Partial<UserCredentials> = {},
): Promise<UserCredentials> => ({
  ...makeContext(),
  password: await bcrypt.hash(PASSWORD, 4),
  ...overrides,
});

const makeMocks = () => {
  const jwt = { sign: jest.fn(() => 'signed'), verify: jest.fn() };
  const loadUser = {
    loadCredentialsByEmail: jest.fn(),
    loadUserById: jest.fn(),
  } as jest.Mocked<LoadUserPort>;
  const saveUser = {
    touchLastLogin: jest.fn().mockResolvedValue(undefined),
    bumpTokenVersion: jest.fn().mockResolvedValue(1),
  } as jest.Mocked<SaveUserPort>;
  return { jwt: jwt as unknown as JwtService, loadUser, saveUser };
};

describe('FrontLoginService', () => {
  it('帳密正確 → 回 token 組與使用者摘要', async () => {
    const { jwt, loadUser, saveUser } = makeMocks();
    loadUser.loadCredentialsByEmail.mockResolvedValue(await makeCredentials());
    const service = new FrontLoginService(jwt, loadUser, saveUser);

    const result = await service.execute({
      email: 'user@test.com',
      password: PASSWORD,
    });

    expect(result.accessToken).toBe('signed');
    expect(result.user).toEqual({
      id: USER_ID,
      email: 'user@test.com',
      displayName: '小明',
      emailVerified: false,
    });
    // 對外摘要不得洩漏內部欄位
    expect(result.user).not.toHaveProperty('tokenVersion');
    expect(result.user).not.toHaveProperty('status');
  });

  it('簽發的 token 帶 side: front 與各自的 secret', async () => {
    const { jwt, loadUser, saveUser } = makeMocks();
    loadUser.loadCredentialsByEmail.mockResolvedValue(await makeCredentials());
    const service = new FrontLoginService(jwt, loadUser, saveUser);

    await service.execute({ email: 'user@test.com', password: PASSWORD });

    const calls = (jwt.sign as unknown as jest.Mock).mock.calls;
    expect(calls[0][0]).toMatchObject({ side: 'front', type: 'access' });
    expect(calls[0][1]).toMatchObject({
      secret: 'front-access-secret-at-least-32ch',
    });
    expect(calls[1][0]).toMatchObject({ side: 'front', type: 'refresh' });
    expect(calls[1][1]).toMatchObject({
      secret: 'front-refresh-secret-at-least-32c',
    });
  });

  /**
   * 帳號不存在與密碼錯誤**回完全相同的回應**——區分開來會讓這支端點
   * 變成帳號列舉工具。
   */
  it.each([
    ['帳號不存在', null],
    ['密碼錯誤', 'wrong'],
  ])('%s → 401，且兩者的訊息完全相同', async (_name, mode) => {
    const { jwt, loadUser, saveUser } = makeMocks();
    loadUser.loadCredentialsByEmail.mockResolvedValue(
      mode === null ? null : await makeCredentials(),
    );
    const service = new FrontLoginService(jwt, loadUser, saveUser);

    await expect(
      service.execute({
        email: 'user@test.com',
        password: mode === null ? PASSWORD : 'wrong-password',
      }),
    ).rejects.toThrow(UnauthorizedException);
  });

  /**
   * 少了假雜湊比對，「帳號不存在」會明顯比「密碼錯誤」快（省掉一次 bcrypt），
   * 而那個時間差本身就是帳號列舉的管道——回應一致但耗時不一致，
   * 等於把剛擋掉的資訊從側通道漏回去。
   */
  it('帳號不存在時仍然跑一次 bcrypt 比對（避免時序洩漏）', async () => {
    const { jwt, loadUser, saveUser } = makeMocks();
    loadUser.loadCredentialsByEmail.mockResolvedValue(null);
    (bcrypt.compare as unknown as jest.Mock).mockClear();
    const service = new FrontLoginService(jwt, loadUser, saveUser);

    await expect(
      service.execute({ email: 'nobody@test.com', password: PASSWORD }),
    ).rejects.toThrow(UnauthorizedException);

    expect(bcrypt.compare).toHaveBeenCalledTimes(1);
  });

  it('帳號已停用 → AccountDisabledException', async () => {
    const { jwt, loadUser, saveUser } = makeMocks();
    loadUser.loadCredentialsByEmail.mockResolvedValue(
      await makeCredentials({ status: false }),
    );
    const service = new FrontLoginService(jwt, loadUser, saveUser);

    await expect(
      service.execute({ email: 'user@test.com', password: PASSWORD }),
    ).rejects.toThrow(AccountDisabledException);
  });

  it('lastLoginAt 更新失敗不阻斷登入', async () => {
    const { jwt, loadUser, saveUser } = makeMocks();
    loadUser.loadCredentialsByEmail.mockResolvedValue(await makeCredentials());
    saveUser.touchLastLogin.mockRejectedValue(new Error('db down'));
    const service = new FrontLoginService(jwt, loadUser, saveUser);

    await expect(
      service.execute({ email: 'user@test.com', password: PASSWORD }),
    ).resolves.toMatchObject({ accessToken: 'signed' });
  });

  it('email 正規化後才查詢', async () => {
    const { jwt, loadUser, saveUser } = makeMocks();
    loadUser.loadCredentialsByEmail.mockResolvedValue(await makeCredentials());
    const service = new FrontLoginService(jwt, loadUser, saveUser);

    await service.execute({ email: '  User@Test.com  ', password: PASSWORD });

    expect(loadUser.loadCredentialsByEmail).toHaveBeenCalledWith(
      'user@test.com',
    );
  });
});

describe('FrontRefreshTokenService', () => {
  const validPayload = {
    sub: USER_ID,
    type: 'refresh',
    side: 'front',
    tokenVersion: 0,
  };

  const setup = (
    payload: unknown,
    user: UserContext | null = makeContext(),
  ) => {
    const { jwt, loadUser } = makeMocks();
    (jwt.verify as unknown as jest.Mock).mockReturnValue(payload);
    loadUser.loadUserById.mockResolvedValue(user);
    return { service: new FrontRefreshTokenService(jwt, loadUser), jwt };
  };

  it('有效的 refresh token → 回新的 token 組', async () => {
    const { service } = setup(validPayload);

    await expect(service.execute('token')).resolves.toMatchObject({
      accessToken: 'signed',
    });
  });

  it('用 access token 換發 → 401', async () => {
    const { service } = setup({ ...validPayload, type: 'access' });

    await expect(service.execute('token')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  /** 前台不套用後台的 `side ?? 'admin'` 過渡寬鬆 */
  it.each([
    ['沒有 side', { sub: USER_ID, type: 'refresh', tokenVersion: 0 }],
    ['side 為 admin', { ...validPayload, side: 'admin' }],
  ])('%s → 401', async (_name, payload) => {
    const { service } = setup(payload);

    await expect(service.execute('token')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('tokenVersion 不符（已登出）→ 401', async () => {
    const { service } = setup(validPayload, makeContext({ tokenVersion: 1 }));

    await expect(service.execute('token')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('帳號已停用 → 401', async () => {
    const { service } = setup(validPayload, makeContext({ status: false }));

    await expect(service.execute('token')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('驗簽失敗 → 401', async () => {
    const { jwt, loadUser } = makeMocks();
    (jwt.verify as unknown as jest.Mock).mockImplementation(() => {
      throw new Error('invalid');
    });
    const service = new FrontRefreshTokenService(jwt, loadUser);

    await expect(service.execute('token')).rejects.toThrow(
      UnauthorizedException,
    );
  });
});

describe('FrontLogoutService', () => {
  it('遞增 tokenVersion，使既發 token 全部失效', async () => {
    const { saveUser } = makeMocks();
    const service = new FrontLogoutService(saveUser);

    await service.execute(USER_ID);

    expect(saveUser.bumpTokenVersion).toHaveBeenCalledWith(USER_ID);
  });
});
