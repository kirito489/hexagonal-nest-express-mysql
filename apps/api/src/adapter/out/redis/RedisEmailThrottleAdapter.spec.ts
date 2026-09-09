import { RedisEmailThrottleAdapter } from './RedisEmailThrottleAdapter';
import { RedisService } from '@app/infrastructure/redis/redis.service';

const makeAdapter = () => {
  const redis = {
    keyPrefix: 'app:',
    increment: jest.fn(),
  } as unknown as RedisService;
  return { redis, adapter: new RedisEmailThrottleAdapter(redis) };
};

const incrementMock = (redis: RedisService): jest.Mock =>
  (redis as unknown as { increment: jest.Mock }).increment;

describe('RedisEmailThrottleAdapter', () => {
  it('未達上限 → 放行', async () => {
    const { redis, adapter } = makeAdapter();
    incrementMock(redis).mockResolvedValue(3);

    await expect(adapter.isExceeded('a@test.com', 'register')).resolves.toBe(
      false,
    );
  });

  it('超過上限 → 拒絕', async () => {
    const { redis, adapter } = makeAdapter();
    incrementMock(redis).mockResolvedValue(4);

    await expect(adapter.isExceeded('a@test.com', 'register')).resolves.toBe(
      true,
    );
  });

  /**
   * 不正規化的話，交替大小寫就能讓每種寫法各自累積一份計數
   * ——與帳號鎖定曾經被繞過的是同一個形狀。
   */
  it('大小寫與前後空白歸一到同一把 key', async () => {
    const { redis, adapter } = makeAdapter();
    incrementMock(redis).mockResolvedValue(1);

    await adapter.isExceeded('  User@Test.com  ', 'register');
    await adapter.isExceeded('user@test.com', 'register');

    const keys = incrementMock(redis).mock.calls.map((c) => c[0] as string);
    expect(keys[0]).toBe(keys[1]);
    expect(keys[0]).toContain('user@test.com');
  });

  it('不同 scope 各自計數，忘記密碼不會吃掉註冊的額度', async () => {
    const { redis, adapter } = makeAdapter();
    incrementMock(redis).mockResolvedValue(1);

    await adapter.isExceeded('a@test.com', 'register');
    await adapter.isExceeded('a@test.com', 'forgot');

    const keys = incrementMock(redis).mock.calls.map((c) => c[0] as string);
    expect(keys[0]).not.toBe(keys[1]);
  });

  /**
   * **fail-open 是刻意的**：`increment` 在 Redis 不可用時回 0。
   * 與登入節流的 fail-closed 相反——寄信節流失效只是可能多寄幾封信，
   * 而 fail-closed 會讓註冊完全不可用。
   */
  it('Redis 不可用（increment 回 0）→ 放行', async () => {
    const { redis, adapter } = makeAdapter();
    incrementMock(redis).mockResolvedValue(0);

    await expect(adapter.isExceeded('a@test.com', 'register')).resolves.toBe(
      false,
    );
  });
});
