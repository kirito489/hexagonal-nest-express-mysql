import request from 'supertest';
import { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaService } from '@app/infrastructure/prisma/prisma.service';
import { createE2EApp, createMockRedis } from '../setup/test-app';
import { resetDb, seedMember } from '../helpers/db';

const ADMIN_EMAIL = 'cache-admin@example.com';
const PASSWORD = 'TestPass123!';
const ROLE_PERMS = ['BACKEND:ROLE:VIEW', 'BACKEND:ROLE:EDIT'];

/**
 * 會真的存讀的 Redis mock。
 *
 * **不能用 `createMockRedis()` 的預設值**——它的 `get` 永遠回 `null`，
 * MemberContext 快取因此永遠不命中，每個請求都重新查資料庫。
 * 「快取有沒有被清掉」在那個 mock 之下**沒有任何可觀察的差別**，
 * 於是測試會綠得毫無資訊——把清快取整段拿掉它照樣綠。
 */
const makeStatefulRedis = () => {
  const store = new Map<string, string>();
  const redis = createMockRedis();

  redis.get.mockImplementation((key: string) =>
    Promise.resolve(store.get(key) ?? null),
  );
  redis.set.mockImplementation((key: string, value: string) => {
    store.set(key, value);
    return Promise.resolve(undefined);
  });
  redis.del.mockImplementation((key: string) => {
    store.delete(key);
    return Promise.resolve(undefined);
  });

  return { redis, store };
};

describe('角色授權變更的快取一致性 E2E', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let store: Map<string, string>;
  let mockRedis: ReturnType<typeof createMockRedis>;
  let token: string;
  let roleId: string;

  beforeAll(async () => {
    const stateful = makeStatefulRedis();
    mockRedis = stateful.redis;
    store = stateful.store;
    ({ app } = await createE2EApp({ redis: mockRedis }));
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    store.clear();
    mockRedis.isTokenBlacklisted.mockResolvedValue(false);
    mockRedis.getBlacklistReason.mockResolvedValue(null);
    mockRedis.throttleIncrement.mockResolvedValue(1);
    await resetDb(prisma);

    const seeded = await seedMember(prisma, {
      email: ADMIN_EMAIL,
      password: PASSWORD,
      roleName: 'cache-admin',
      permissionCodes: ROLE_PERMS,
    });
    roleId = seeded.roleId;

    const res = await request(app.getHttpServer())
      .post('/api/admin/auth/login')
      .send({ email: ADMIN_EMAIL, password: PASSWORD });
    token = (res.body as { data: { accessToken: string } }).data.accessToken;
  });

  const listRoles = () =>
    request(app.getHttpServer())
      .get('/api/admin/roles')
      .set('Authorization', `Bearer ${token}`);

  it('快取確實會被填入（否則後面兩條驗不到東西）', async () => {
    await listRoles();

    const memberKeys = [...store.keys()].filter((k) => k.includes('member:'));
    expect(memberKeys.length).toBeGreaterThan(0);
  });

  // 撤銷一個權限後，該角色成員的下一個請求就該被擋下。
  // 沒有清快取的話，舊的 permissions 會在 PERMISSION_CACHE_TTL（預設 300 秒）內
  // 持續有效——而資料庫與畫面都顯示已經撤銷了。
  it('撤銷權限後，下一個請求即被拒絕', async () => {
    await listRoles();
    expect((await listRoles()).status).toBe(200);

    // 清空該角色的權限。**不能只留 EDIT**——那違反「EDIT 必須搭配 VIEW」
    // 而被 400 擋在驗證階段，根本走不到要驗的快取那一步
    const patch = await request(app.getHttpServer())
      .patch(`/api/admin/roles/${roleId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ permissionCodes: [] });
    expect(patch.status).toBe(204);

    expect((await listRoles()).status).toBe(403);
  });

  it('更新角色會清掉該成員的 MemberContext 快取鍵', async () => {
    await listRoles();
    const before = [...store.keys()].filter((k) => k.includes('member:'));
    expect(before.length).toBeGreaterThan(0);

    await request(app.getHttpServer())
      .patch(`/api/admin/roles/${roleId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: '改個名字' });

    const after = [...store.keys()].filter((k) => k.includes('member:'));
    expect(after).toEqual([]);
  });
});
