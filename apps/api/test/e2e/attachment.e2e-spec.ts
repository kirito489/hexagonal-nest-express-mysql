import { existsSync } from 'fs';
import { join } from 'path';
import request from 'supertest';
import { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaService } from '../../src/infrastructure/prisma/prisma.service';
import { createE2EApp, createMockRedis } from '../setup/test-app';
import { resetDb, seedMember } from '../helpers/db';
import {
  expectUnauthorized,
  expectApiError,
  describeUnauthorized,
} from '../helpers/assertions';
import { ResponseCodes } from '../../src/shared/constants/response-codes';

// 走真 test DB + local storage driver（LOCAL_MEDIA_ROOT 指向 tmp，見 setup-env.e2e）。
const ADMIN_EMAIL = 'admin@test.com';
const PASSWORD = 'TestPass123!';
// 最小 PNG 檔頭當測試檔（內容不重要，MIME 由 contentType 決定）
const PNG = Buffer.from('89504e470d0a1a0a', 'hex');
const MISSING_ID = '00000000-0000-4000-8000-0000000000ff';

describe('Attachment E2E', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let token: string;
  const mockRedis = createMockRedis();

  const upload = () =>
    request(app.getHttpServer())
      .post('/api/admin/attachments')
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
    await seedMember(prisma, { email: ADMIN_EMAIL, password: PASSWORD });
    const res = await request(app.getHttpServer())
      .post('/api/admin/auth/login')
      .send({ email: ADMIN_EMAIL, password: PASSWORD });
    token = (res.body as { data: { accessToken: string } }).data.accessToken;
  });

  // 未授權存取:guard 在查資料前就擋下,故 :id 用固定 uuid 即可
  describe('未授權存取', () => {
    describeUnauthorized(() => app, 'post', '/api/admin/attachments');
    describeUnauthorized(
      () => app,
      'delete',
      `/api/admin/attachments/${MISSING_ID}`,
    );
  });

  it('上傳合法 PNG → 201 + { id, url }，落庫 + 本機寫檔 + 檔名 latin1→utf8', async () => {
    const res = await upload()
      .field('folder', 'avatars')
      .field('relatedTable', 'members')
      .field('relatedId', 'm-1')
      .attach('file', PNG, { filename: '頭貼.png', contentType: 'image/png' });

    expect(res.status).toBe(201);
    const { id, url } = (res.body as { data: { id: string; url: string } })
      .data;
    expect(url).toMatch(/^\/media\/avatars\/.+\.png$/);

    const row = await prisma.attachmentRecord.findUnique({ where: { id } });
    expect(row?.fileType).toBe('image/png');
    expect(row?.fileName).toBe('頭貼.png');
    expect(row?.relatedTable).toBe('members');

    // 本機檔案已寫入（key = url 尾兩段）
    const key = url.split('/').slice(-2).join('/');
    const mediaRoot = process.env.LOCAL_MEDIA_ROOT ?? '';
    expect(existsSync(join(mediaRoot, key))).toBe(true);
  });

  it('不允許的 MIME（text/html）→ 400', async () => {
    const res = await upload()
      .field('folder', 'avatars')
      .field('relatedTable', 'members')
      .field('relatedId', 'm-1')
      .attach('file', Buffer.from('<script>'), {
        filename: 'x.html',
        contentType: 'text/html',
      });

    expect(res.status).toBe(400);
  });

  it('不允許的 folder → 400', async () => {
    const res = await upload()
      .field('folder', 'evil')
      .field('relatedTable', 'members')
      .field('relatedId', 'm-1')
      .attach('file', PNG, { filename: 'a.png', contentType: 'image/png' });

    expect(res.status).toBe(400);
  });

  it('無 JWT → 401', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/admin/attachments')
      .field('folder', 'avatars')
      .field('relatedTable', 'members')
      .field('relatedId', 'm-1')
      .attach('file', PNG, { filename: 'a.png', contentType: 'image/png' });

    expectUnauthorized(res);
  });

  it('DELETE 存在 → 204 且紀錄刪除', async () => {
    const up = await upload()
      .field('folder', 'avatars')
      .field('relatedTable', 'members')
      .field('relatedId', 'm-1')
      .attach('file', PNG, { filename: 'a.png', contentType: 'image/png' });
    const id = (up.body as { data: { id: string } }).data.id;

    const del = await request(app.getHttpServer())
      .delete(`/api/admin/attachments/${id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(del.status).toBe(204);
    const row = await prisma.attachmentRecord.findUnique({ where: { id } });
    expect(row).toBeNull();
  });

  it('DELETE 不存在 → 404', async () => {
    const res = await request(app.getHttpServer())
      .delete(`/api/admin/attachments/${MISSING_ID}`)
      .set('Authorization', `Bearer ${token}`);

    expectApiError(res, 404, ResponseCodes.ATTACHMENT_NOT_FOUND);
  });
});
