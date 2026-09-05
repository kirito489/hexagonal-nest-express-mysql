import request from 'supertest';
import { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaService } from '@app/infrastructure/prisma/prisma.service';
import { createE2EApp, createMockRedis } from '../setup/test-app';
import { resetDb, seedMember } from '../helpers/db';
import {
  expectApiError,
  expectUnauthorized,
  describeUnauthorized,
} from '../helpers/assertions';
import { ResponseCodes } from '@app/shared/constants/response-codes';

// 走真 test DB:beforeEach seed 一個 roleCode=SUPERADMIN 的 admin 並登入取 token
//（security 走 RolesGuard + @Roles(SUPERADMIN)，flag 預設開啟,roleCode 由 JwtAuthGuard 每次查 DB 補上）。
// IP 名單直接落庫 / 查庫斷言;unlock 以真鎖定紀錄驗證;forgot/reset-password 為 @Public 免 token。
const ADMIN_EMAIL = 'admin@test.com';
const PASSWORD = 'TestPass123!';
const MISSING_ID = '00000000-0000-4000-8000-0000000000ff';

describe('Security E2E', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let token: string;
  let adminRoleId: string;
  const mockRedis = createMockRedis();

  const get = (url: string) =>
    request(app.getHttpServer())
      .get(url)
      .set('Authorization', `Bearer ${token}`);
  const post = (url: string, body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .post(url)
      .set('Authorization', `Bearer ${token}`)
      .send(body);
  const patch = (url: string, body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .patch(url)
      .set('Authorization', `Bearer ${token}`)
      .send(body);
  const del = (url: string) =>
    request(app.getHttpServer())
      .delete(url)
      .set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    ({ app } = await createE2EApp({ redis: mockRedis }));
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    mockRedis.get.mockResolvedValue(null);
    mockRedis.isTokenBlacklisted.mockResolvedValue(false);
    mockRedis.throttleIncrement.mockResolvedValue(1);
    await resetDb(prisma);
    ({ roleId: adminRoleId } = await seedMember(prisma, {
      email: ADMIN_EMAIL,
      password: PASSWORD,
      roleName: '管理者',
      roleCode: 'SUPERADMIN',
    }));
    const res = await request(app.getHttpServer())
      .post('/api/admin/auth/login')
      .send({ email: ADMIN_EMAIL, password: PASSWORD });
    token = (res.body as { data: { accessToken: string } }).data.accessToken;
  });

  // ── IP 白名單 ──────────────────────────────

  // 未授權存取:guard 在查資料前就擋下,故 :id 用固定 uuid 即可
  describe('未授權存取', () => {
    describeUnauthorized(() => app, 'post', '/api/admin/security/ip-whitelist');
    describeUnauthorized(
      () => app,
      'get',
      `/api/admin/security/ip-whitelist/${MISSING_ID}`,
    );
    describeUnauthorized(
      () => app,
      'patch',
      `/api/admin/security/ip-whitelist/${MISSING_ID}`,
    );
    describeUnauthorized(
      () => app,
      'delete',
      `/api/admin/security/ip-whitelist/${MISSING_ID}`,
    );
    describeUnauthorized(() => app, 'get', '/api/admin/security/ip-blacklist');
    describeUnauthorized(() => app, 'post', '/api/admin/security/ip-blacklist');
    describeUnauthorized(
      () => app,
      'get',
      `/api/admin/security/ip-blacklist/${MISSING_ID}`,
    );
    describeUnauthorized(
      () => app,
      'patch',
      `/api/admin/security/ip-blacklist/${MISSING_ID}`,
    );
    describeUnauthorized(
      () => app,
      'delete',
      `/api/admin/security/ip-blacklist/${MISSING_ID}`,
    );
    describeUnauthorized(
      () => app,
      'post',
      '/api/admin/security/unlock-account',
    );
    describeUnauthorized(() => app, 'get', '/api/admin/security/locks');
  });

  describe('GET /api/admin/security/ip-whitelist', () => {
    it('Admin JWT → 200 + { list, meta }', async () => {
      await prisma.ipWhitelistRecord.create({
        data: { ipAddress: '1.2.3.4', description: 'test' },
      });

      const res = await get('/api/admin/security/ip-whitelist');

      expect(res.status).toBe(200);
      const body = res.body as {
        data: {
          list: Array<{ id: string; ipAddress: string }>;
          meta: { page: number; total: number };
        };
      };
      expect(body.data.list).toHaveLength(1);
      expect(body.data.list[0].ipAddress).toBe('1.2.3.4');
      expect(body.data.meta.page).toBe(1);
      expect(body.data.meta.total).toBe(1);
    });

    it('search → 依 ipAddress 模糊過濾', async () => {
      await prisma.ipWhitelistRecord.createMany({
        data: [{ ipAddress: '192.168.1.1' }, { ipAddress: '10.0.0.1' }],
      });

      const res = await get('/api/admin/security/ip-whitelist?search=192.168');

      expect(res.status).toBe(200);
      const body = res.body as {
        data: { list: Array<{ ipAddress: string }> };
      };
      expect(body.data.list).toHaveLength(1);
      expect(body.data.list[0].ipAddress).toBe('192.168.1.1');
    });

    it('無 JWT → 401', async () => {
      const res = await request(app.getHttpServer()).get(
        '/api/admin/security/ip-whitelist',
      );

      expectUnauthorized(res);
    });
  });

  describe('POST /api/admin/security/ip-whitelist', () => {
    it('Admin 新增白名單 → 201 + { id } 且落庫', async () => {
      const res = await post('/api/admin/security/ip-whitelist', {
        ip: '10.0.0.1',
        description: '辦公室',
      });

      expect(res.status).toBe(201);
      const id = (res.body as { data: { id: string } }).data.id;
      expect(typeof id).toBe('string');
      const row = await prisma.ipWhitelistRecord.findUnique({
        where: { ipAddress: '10.0.0.1' },
      });
      expect(row?.description).toBe('辦公室');
    });

    it('缺少 ip → 400', async () => {
      const res = await post('/api/admin/security/ip-whitelist', {});

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/admin/security/ip-whitelist/:id', () => {
    it('Admin 取單筆 → 200', async () => {
      const { id } = await prisma.ipWhitelistRecord.create({
        data: { ipAddress: '10.0.0.1', description: 'office' },
      });

      const res = await get(`/api/admin/security/ip-whitelist/${id}`);

      expect(res.status).toBe(200);
      const body = res.body as { data: { id: string; ipAddress: string } };
      expect(body.data.id).toBe(id);
      expect(body.data.ipAddress).toBe('10.0.0.1');
    });

    it('找不到紀錄 → 404 IP_LIST_NOT_FOUND', async () => {
      const res = await get(`/api/admin/security/ip-whitelist/${MISSING_ID}`);

      expectApiError(res, 404, ResponseCodes.IP_LIST_NOT_FOUND);
    });
  });

  describe('PATCH /api/admin/security/ip-whitelist/:id', () => {
    it('Admin 更新成功 → 204 且落庫', async () => {
      const { id } = await prisma.ipWhitelistRecord.create({
        data: { ipAddress: '10.0.0.1', description: '舊備註' },
      });

      const res = await patch(`/api/admin/security/ip-whitelist/${id}`, {
        description: '新備註',
      });

      expect(res.status).toBe(204);
      const row = await prisma.ipWhitelistRecord.findUnique({ where: { id } });
      expect(row?.description).toBe('新備註');
    });

    it('紀錄不存在 → 404 IP_LIST_NOT_FOUND', async () => {
      const res = await patch(
        `/api/admin/security/ip-whitelist/${MISSING_ID}`,
        {
          description: 'x',
        },
      );

      expectApiError(res, 404, ResponseCodes.IP_LIST_NOT_FOUND);
    });
  });

  describe('DELETE /api/admin/security/ip-whitelist/:id', () => {
    it('Admin 移除 → 204 且落庫刪除', async () => {
      const { id } = await prisma.ipWhitelistRecord.create({
        data: { ipAddress: '10.0.0.1' },
      });

      const res = await del(`/api/admin/security/ip-whitelist/${id}`);

      expect(res.status).toBe(204);
      const row = await prisma.ipWhitelistRecord.findUnique({ where: { id } });
      expect(row).toBeNull();
    });

    it('紀錄不存在仍 → 204（靜默通過，硬刪）', async () => {
      const res = await del(`/api/admin/security/ip-whitelist/${MISSING_ID}`);

      expect(res.status).toBe(204);
    });

    it('非 uuid path param → 400', async () => {
      const res = await del('/api/admin/security/ip-whitelist/not-a-uuid');

      expect(res.status).toBe(400);
    });
  });

  // ── IP 黑名單 ──────────────────────────────

  describe('GET /api/admin/security/ip-blacklist', () => {
    it('Admin JWT → 200', async () => {
      const res = await get('/api/admin/security/ip-blacklist');

      expect(res.status).toBe(200);
    });
  });

  describe('POST /api/admin/security/ip-blacklist', () => {
    it('Admin 新增黑名單 → 201 + { id }，isAutoBlock 預設 false', async () => {
      const res = await post('/api/admin/security/ip-blacklist', {
        ip: '192.168.1.100',
        reason: '惡意攻擊',
      });

      expect(res.status).toBe(201);
      const id = (res.body as { data: { id: string } }).data.id;
      expect(typeof id).toBe('string');
      const row = await prisma.ipBlacklistRecord.findUnique({
        where: { ipAddress: '192.168.1.100' },
      });
      expect(row?.reason).toBe('惡意攻擊');
      expect(row?.isAutoBlock).toBe(false);
    });
  });

  describe('GET /api/admin/security/ip-blacklist/:id', () => {
    it('Admin 取單筆 → 200', async () => {
      const { id } = await prisma.ipBlacklistRecord.create({
        data: { ipAddress: '1.2.3.4', reason: 'brute force' },
      });

      const res = await get(`/api/admin/security/ip-blacklist/${id}`);

      expect(res.status).toBe(200);
      const body = res.body as {
        data: { id: string; ipAddress: string; isAutoBlock: boolean };
      };
      expect(body.data.id).toBe(id);
      expect(body.data.isAutoBlock).toBe(false);
    });

    it('找不到紀錄 → 404 IP_LIST_NOT_FOUND', async () => {
      const res = await get(`/api/admin/security/ip-blacklist/${MISSING_ID}`);

      expectApiError(res, 404, ResponseCodes.IP_LIST_NOT_FOUND);
    });
  });

  describe('PATCH /api/admin/security/ip-blacklist/:id', () => {
    it('Admin 更新成功 → 204 且落庫', async () => {
      const { id } = await prisma.ipBlacklistRecord.create({
        data: { ipAddress: '1.2.3.4', reason: '舊理由' },
      });

      const res = await patch(`/api/admin/security/ip-blacklist/${id}`, {
        reason: '新理由',
      });

      expect(res.status).toBe(204);
      const row = await prisma.ipBlacklistRecord.findUnique({ where: { id } });
      expect(row?.reason).toBe('新理由');
    });

    it('紀錄不存在 → 404 IP_LIST_NOT_FOUND', async () => {
      const res = await patch(
        `/api/admin/security/ip-blacklist/${MISSING_ID}`,
        {
          reason: 'x',
        },
      );

      expectApiError(res, 404, ResponseCodes.IP_LIST_NOT_FOUND);
    });
  });

  describe('DELETE /api/admin/security/ip-blacklist/:id', () => {
    it('Admin 移除 → 204 且落庫刪除', async () => {
      const { id } = await prisma.ipBlacklistRecord.create({
        data: { ipAddress: '1.2.3.4' },
      });

      const res = await del(`/api/admin/security/ip-blacklist/${id}`);

      expect(res.status).toBe(204);
      const row = await prisma.ipBlacklistRecord.findUnique({ where: { id } });
      expect(row).toBeNull();
    });

    it('紀錄不存在仍 → 204', async () => {
      const res = await del(`/api/admin/security/ip-blacklist/${MISSING_ID}`);

      expect(res.status).toBe(204);
    });
  });

  // ── 帳號鎖定列表 ───────────────────────────

  describe('GET /api/admin/security/locks', () => {
    /** 建一筆有 lockedAt 的帳號 */
    const seedLocked = async (
      email: string,
      lockedAt: Date,
      extra: Record<string, unknown> = {},
    ) =>
      prisma.memberRecord.create({
        data: {
          member: email,
          email,
          password: 'x',
          roleId: adminRoleId,
          status: true,
          isDefault: false,
          failedLoginCount: 3,
          lockedAt,
          ...extra,
        },
      });

    const minutesAgo = (n: number) => new Date(Date.now() - n * 60 * 1000);

    // 預設 DURATION_MIN 為 15；此 spec 未載入 enable-account-lock，故 flag 為關閉
    const STILL_LOCKED = 1;
    const ALREADY_EXPIRED = 60;

    it('預設只回鎖定中的帳號', async () => {
      await seedLocked('locked@test.com', minutesAgo(STILL_LOCKED));
      await seedLocked('expired@test.com', minutesAgo(ALREADY_EXPIRED));

      const res = await get('/api/admin/security/locks');

      expect(res.status).toBe(200);
      const { list } = (
        res.body as { data: { list: Array<{ email: string; status: string }> } }
      ).data;
      expect(list).toHaveLength(1);
      expect(list[0].email).toBe('locked@test.com');
      expect(list[0].status).toBe('locked');
    });

    it('status=expired 回已到期但尚未清除的紀錄', async () => {
      await seedLocked('locked@test.com', minutesAgo(STILL_LOCKED));
      await seedLocked('expired@test.com', minutesAgo(ALREADY_EXPIRED));

      const res = await get('/api/admin/security/locks?status=expired');

      const { list } = (
        res.body as { data: { list: Array<{ email: string; status: string }> } }
      ).data;
      expect(list).toHaveLength(1);
      expect(list[0].email).toBe('expired@test.com');
      expect(list[0].status).toBe('expired');
    });

    it('status=all 兩者都回，並帶 unlocksAt', async () => {
      await seedLocked('locked@test.com', minutesAgo(STILL_LOCKED));
      await seedLocked('expired@test.com', minutesAgo(ALREADY_EXPIRED));

      const res = await get('/api/admin/security/locks?status=all');

      const { list, meta } = (
        res.body as {
          data: {
            list: Array<{ unlocksAt: string; lockedAt: string }>;
            meta: { total: number };
          };
        }
      ).data;
      expect(meta.total).toBe(2);
      // unlocksAt 一併回傳:管理員要判斷的是「還要等多久」
      list.forEach((row) => {
        expect(new Date(row.unlocksAt).getTime()).toBeGreaterThan(
          new Date(row.lockedAt).getTime(),
        );
      });
    });

    it('search 依 email 模糊過濾', async () => {
      await seedLocked('alpha@test.com', minutesAgo(STILL_LOCKED));
      await seedLocked('beta@test.com', minutesAgo(STILL_LOCKED));

      const res = await get('/api/admin/security/locks?search=alph');

      const { list } = (
        res.body as { data: { list: Array<{ email: string }> } }
      ).data;
      expect(list).toHaveLength(1);
      expect(list[0].email).toBe('alpha@test.com');
    });

    it('軟刪除的帳號不出現', async () => {
      await seedLocked('deleted@test.com', minutesAgo(STILL_LOCKED), {
        deletedAt: new Date(),
      });

      const res = await get('/api/admin/security/locks?status=all');

      expect(
        (res.body as { data: { list: unknown[] } }).data.list,
      ).toHaveLength(0);
    });

    it('沒有任何鎖定紀錄 → 空 list 與 total 0,不是錯誤', async () => {
      const res = await get('/api/admin/security/locks');

      expect(res.status).toBe(200);
      const { list, meta } = (
        res.body as { data: { list: unknown[]; meta: { total: number } } }
      ).data;
      expect(list).toEqual([]);
      expect(meta.total).toBe(0);
    });

    it('status 值不合法 → 400', async () => {
      const res = await get('/api/admin/security/locks?status=unknown');

      expect(res.status).toBe(400);
    });

    /**
     * flag 關閉時登入路徑不寫入 lockedAt,清單必然是空的。
     *
     * 少了這個旗標,呼叫端分不出「沒有人被鎖」與「根本不會鎖」
     * ——而那兩件事的意義相反。
     */
    it('本 spec 未開啟鎖定功能 → lockEnabled 為 false', async () => {
      const res = await get('/api/admin/security/locks');

      expect(
        (res.body as { data: { lockEnabled: boolean } }).data.lockEnabled,
      ).toBe(false);
    });
    /**
     * role gate 是**粗粒度**的:持有全部 BACKEND:* 權限碼也進不來。
     * 只驗 401 的話,這條界線可以被整個拿掉而沒有東西變紅。
     */
    it('非 SUPERADMIN 即使持有全部權限碼 → 403', async () => {
      await seedMember(prisma, {
        email: 'plain@test.com',
        password: PASSWORD,
        roleName: '一般管理者',
        permissionCodes: [
          'BACKEND:ACCOUNT:VIEW',
          'BACKEND:ACCOUNT:EDIT',
          'BACKEND:ROLE:VIEW',
          'BACKEND:ROLE:EDIT',
        ],
      });
      const login = await request(app.getHttpServer())
        .post('/api/admin/auth/login')
        .send({ email: 'plain@test.com', password: PASSWORD });
      const plainToken = (login.body as { data: { accessToken: string } }).data
        .accessToken;

      const res = await request(app.getHttpServer())
        .get('/api/admin/security/locks')
        .set('Authorization', `Bearer ${plainToken}`);

      expect(res.status).toBe(403);
    });
  });

  // ── 帳號解鎖 ───────────────────────────────

  describe('POST /api/admin/security/unlock-account', () => {
    it('Admin 解鎖鎖定帳號 → 204 且落庫清鎖', async () => {
      await prisma.memberRecord.create({
        data: {
          member: 'Locked',
          email: 'locked@test.com',
          password: 'x',
          roleId: adminRoleId,
          status: true,
          isDefault: false,
          lockedAt: new Date(),
          failedLoginCount: 5,
        },
      });

      const res = await post('/api/admin/security/unlock-account', {
        email: 'locked@test.com',
      });

      expect(res.status).toBe(204);
      const row = await prisma.memberRecord.findUnique({
        where: { email: 'locked@test.com' },
      });
      expect(row?.lockedAt).toBeNull();
      expect(row?.failedLoginCount).toBe(0);
    });

    it('email 不存在 → 404 EMAIL_NOT_FOUND', async () => {
      const res = await post('/api/admin/security/unlock-account', {
        email: 'unknown@test.com',
      });

      expectApiError(res, 404, ResponseCodes.EMAIL_NOT_FOUND);
    });

    it('帳號未鎖 → 409 ACCOUNT_NOT_LOCKED', async () => {
      // admin 帳號本身未鎖定
      const res = await post('/api/admin/security/unlock-account', {
        email: ADMIN_EMAIL,
      });

      expectApiError(res, 409, ResponseCodes.ACCOUNT_NOT_LOCKED);
    });

    it('缺少 email → 400', async () => {
      const res = await post('/api/admin/security/unlock-account', {});

      expect(res.status).toBe(400);
    });

    it('無效 email 格式 → 400', async () => {
      const res = await post('/api/admin/security/unlock-account', {
        email: 'not-email',
      });

      expect(res.status).toBe(400);
    });
  });

  // ── Auth: forgot-password / reset-password ─

  describe('POST /api/admin/auth/forgot-password', () => {
    it('已註冊 email → 204 且落庫產生 reset token', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/admin/auth/forgot-password')
        .send({ email: ADMIN_EMAIL });

      expect(res.status).toBe(204);
      const count = await prisma.passwordResetTokenRecord.count();
      expect(count).toBeGreaterThanOrEqual(1);
    });

    it('不存在 email → 204（同樣回傳成功，防列舉）', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/admin/auth/forgot-password')
        .send({ email: 'nobody@test.com' });

      expect(res.status).toBe(204);
    });

    it('缺少 email → 400', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/admin/auth/forgot-password')
        .send({});

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/admin/auth/reset-password', () => {
    it('無效 token → 400', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/admin/auth/reset-password')
        .send({ token: 'invalid-token', newPassword: 'NewPass123!' });

      expect(res.status).toBe(400);
    });

    it('缺少參數 → 400', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/admin/auth/reset-password')
        .send({});

      expect(res.status).toBe(400);
    });
  });
});
