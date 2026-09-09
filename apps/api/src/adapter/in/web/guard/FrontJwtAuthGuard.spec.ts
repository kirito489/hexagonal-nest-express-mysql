import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { FrontJwtAuthGuard } from './FrontJwtAuthGuard';
import type {
  LoadUserPort,
  UserContext,
} from '@app/application/port/out/user/LoadUserPort';

jest.mock('@app/infrastructure/validate-env', () => ({
  getEnv: () => ({ FRONT_ACCESS_SECRET: 'front-secret-at-least-32-chars!!!' }),
}));

const USER_ID = '9c2a4f10-7b3e-4d81-9f6a-1e0c5b8d3a72';

const makeUser = (overrides: Partial<UserContext> = {}): UserContext => ({
  id: USER_ID,
  email: 'user@test.com',
  displayName: '小明',
  emailVerified: false,
  status: true,
  tokenVersion: 0,
  lastLoginAt: null,
  ...overrides,
});

const makeContext = (authorization?: string): ExecutionContext => {
  const request: Record<string, unknown> = {
    headers: authorization ? { authorization } : {},
  };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
};

const makeGuard = () => {
  const jwt = { verify: jest.fn() } as unknown as JwtService;
  const loadUser = {
    loadCredentialsByEmail: jest.fn(),
    loadUserById: jest.fn().mockResolvedValue(makeUser()),
  } as jest.Mocked<LoadUserPort>;
  return { jwt, loadUser, guard: new FrontJwtAuthGuard(jwt, loadUser) };
};

/** 讓 verify 回傳指定 payload */
const givenPayload = (jwt: JwtService, payload: Record<string, unknown>) =>
  (jwt.verify as jest.Mock).mockReturnValue(payload);

const validPayload = {
  sub: USER_ID,
  type: 'access',
  side: 'front',
  tokenVersion: 0,
};

describe('FrontJwtAuthGuard', () => {
  it('有效的前台 token → 通過，並把 UserContext 掛上 request', async () => {
    const { jwt, guard } = makeGuard();
    givenPayload(jwt, validPayload);
    const context = makeContext('Bearer front-token');

    await expect(guard.canActivate(context)).resolves.toBe(true);

    const request = context
      .switchToHttp()
      .getRequest<Record<string, unknown>>();
    expect(request.frontUser).toMatchObject({ id: USER_ID });
  });

  it('沒有 Authorization header → 401', async () => {
    const { guard } = makeGuard();

    await expect(guard.canActivate(makeContext())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  /**
   * 後台 token 用的是另一組 secret，所以這裡走的是**簽章驗證失敗**——
   * 而不是「驗過了但 side 不對」。那正是各自 secret 的用意：
   * 忘記比對 side 時它仍然是 fail-closed 的。
   */
  it('後台 token → 驗簽失敗 → 401', async () => {
    const { jwt, guard } = makeGuard();
    (jwt.verify as jest.Mock).mockImplementation(() => {
      throw new Error('invalid signature');
    });

    await expect(
      guard.canActivate(makeContext('Bearer admin-token')),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  /**
   * 前台**不套用**後台的 `side ?? 'admin'` 過渡寬鬆：
   * 前台是全新的，不存在沒有 side 的舊 token。
   */
  it('payload 沒有 side → 401（前台不套用過渡寬鬆）', async () => {
    const { jwt, guard } = makeGuard();
    givenPayload(jwt, { sub: USER_ID, type: 'access', tokenVersion: 0 });

    await expect(
      guard.canActivate(makeContext('Bearer legacy-token')),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('side 為 admin → 401', async () => {
    const { jwt, guard } = makeGuard();
    givenPayload(jwt, { ...validPayload, side: 'admin' });

    await expect(
      guard.canActivate(makeContext('Bearer x')),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('用 refresh token 存取 → 401', async () => {
    const { jwt, guard } = makeGuard();
    givenPayload(jwt, { ...validPayload, type: 'refresh' });

    await expect(
      guard.canActivate(makeContext('Bearer x')),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('帳號不存在（含軟刪除）→ 401', async () => {
    const { jwt, loadUser, guard } = makeGuard();
    givenPayload(jwt, validPayload);
    loadUser.loadUserById.mockResolvedValue(null);

    await expect(
      guard.canActivate(makeContext('Bearer x')),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('帳號已停用 → 401', async () => {
    const { jwt, loadUser, guard } = makeGuard();
    givenPayload(jwt, validPayload);
    loadUser.loadUserById.mockResolvedValue(makeUser({ status: false }));

    await expect(
      guard.canActivate(makeContext('Bearer x')),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  /** 登出會遞增 tokenVersion，既發的 token 隨即對不上 */
  it('tokenVersion 不符（已登出）→ 401', async () => {
    const { jwt, loadUser, guard } = makeGuard();
    givenPayload(jwt, validPayload);
    loadUser.loadUserById.mockResolvedValue(makeUser({ tokenVersion: 1 }));

    await expect(
      guard.canActivate(makeContext('Bearer x')),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
