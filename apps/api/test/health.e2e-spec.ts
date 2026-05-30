import request from 'supertest';
import { NestExpressApplication } from '@nestjs/platform-express';
import { createE2EApp, createMockRedis } from './test-app';

// ──────────────────────────────────────────────
// Mock：health 只依賴 PrismaService.$queryRaw 與 RedisService.ping
// ──────────────────────────────────────────────
const createMockPrisma = () => ({
  $connect: jest.fn(),
  $disconnect: jest.fn(),
  $queryRaw: jest.fn().mockResolvedValue([{ '1': 1 }]),
});

describe('Health (e2e)', () => {
  describe('GET /api/health（liveness）', () => {
    let app: NestExpressApplication;

    beforeAll(async () => {
      ({ app } = await createE2EApp({
        prisma: createMockPrisma(),
        redis: createMockRedis(),
      }));
    });

    afterAll(async () => {
      await app.close();
    });

    it('永遠回 200 且不查外部依賴', async () => {
      const res = await request(app.getHttpServer()).get('/api/health');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('ok');
      expect(typeof res.body.data.timestamp).toBe('string');
    });
  });

  describe('GET /api/health/ready（readiness）', () => {
    it('DB 與 Redis 皆正常時回 200，details 標記 up', async () => {
      const { app } = await createE2EApp({
        prisma: createMockPrisma(),
        redis: createMockRedis(),
      });

      const res = await request(app.getHttpServer()).get('/api/health/ready');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('ok');
      expect(res.body.data.details.database.status).toBe('up');
      expect(res.body.data.details.redis.status).toBe('up');

      await app.close();
    });

    it('Redis 無回應時回 503', async () => {
      const redis = createMockRedis();
      redis.ping.mockResolvedValue(false);

      const { app } = await createE2EApp({
        prisma: createMockPrisma(),
        redis,
      });

      const res = await request(app.getHttpServer()).get('/api/health/ready');

      expect(res.status).toBe(503);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('SERVICE_UNAVAILABLE');

      await app.close();
    });

    it('DB 查詢失敗時回 503', async () => {
      const prisma = createMockPrisma();
      prisma.$queryRaw.mockRejectedValue(new Error('DB down'));

      const { app } = await createE2EApp({
        prisma,
        redis: createMockRedis(),
      });

      const res = await request(app.getHttpServer()).get('/api/health/ready');

      expect(res.status).toBe(503);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('SERVICE_UNAVAILABLE');

      await app.close();
    });
  });
});
