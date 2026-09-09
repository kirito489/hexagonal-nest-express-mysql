import { createHash } from 'crypto';
import { PrismaUserTokenRepository } from './PrismaUserTokenRepository';
import { PrismaService } from '@app/infrastructure/prisma/prisma.service';

const USER_ID = '9c2a4f10-7b3e-4d81-9f6a-1e0c5b8d3a72';

const sha256 = (value: string): string =>
  createHash('sha256').update(value).digest('hex');

const makeMocks = () => {
  const prisma = {
    userTokenRecord: {
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({ userId: USER_ID }),
      updateMany: jest.fn().mockResolvedValue({ count: 2 }),
    },
  } as unknown as PrismaService;
  return { prisma, repo: new PrismaUserTokenRepository(prisma) };
};

const mockOf = (prisma: PrismaService, method: string): jest.Mock =>
  (prisma as unknown as { userTokenRecord: Record<string, jest.Mock> })
    .userTokenRecord[method];

describe('PrismaUserTokenRepository', () => {
  describe('create', () => {
    it('DB 只存 sha256 雜湊，不存明文', async () => {
      const { prisma, repo } = makeMocks();

      const token = await repo.create(USER_ID, 'VERIFY_EMAIL', 1440);

      const { data } = mockOf(prisma, 'create').mock.calls[0][0] as {
        data: { token: string; purpose: string };
      };
      expect(data.token).toBe(sha256(token));
      expect(data.token).not.toBe(token);
      expect(data.purpose).toBe('VERIFY_EMAIL');
    });

    it('依分鐘數算出到期時間', async () => {
      const { prisma, repo } = makeMocks();
      const before = Date.now();

      await repo.create(USER_ID, 'RESET_PASSWORD', 30);

      const { data } = mockOf(prisma, 'create').mock.calls[0][0] as {
        data: { expiresAt: Date };
      };
      const elapsed = data.expiresAt.getTime() - before;
      expect(elapsed).toBeGreaterThan(29 * 60 * 1000);
      expect(elapsed).toBeLessThanOrEqual(31 * 60 * 1000);
    });
  });

  describe('claim', () => {
    /**
     * **必須一併比對 `purpose`。**
     *
     * 少了它，拿驗證信的 token 就能重設密碼——那是「信箱收得到信」升級成
     * 「改得了密碼」的提權，而驗證信在註冊當下就寄出，
     * 取得難度遠低於重設信。
     */
    it('查詢條件含 purpose、未使用、未過期，且 token 已雜湊', async () => {
      const { prisma, repo } = makeMocks();

      await repo.claim('plain-token', 'RESET_PASSWORD');

      const args = mockOf(prisma, 'update').mock.calls[0][0] as {
        where: {
          token: string;
          purpose: string;
          usedAt: null;
          expiresAt: { gt: Date };
        };
        data: { usedAt: Date };
      };
      expect(args.where.token).toBe(sha256('plain-token'));
      expect(args.where.purpose).toBe('RESET_PASSWORD');
      expect(args.where.usedAt).toBeNull();
      expect(args.where.expiresAt.gt).toBeInstanceOf(Date);
      expect(args.data.usedAt).toBeInstanceOf(Date);
    });

    it('成功時回傳 userId', async () => {
      const { repo } = makeMocks();

      await expect(repo.claim('t', 'VERIFY_EMAIL')).resolves.toEqual({
        userId: USER_ID,
      });
    });

    /** 消耗是單一原子操作：先查再更新會讓同一枚 token 在並行下被用兩次 */
    it('只發一次 update，不先查再更新', async () => {
      const { prisma, repo } = makeMocks();

      await repo.claim('t', 'VERIFY_EMAIL');

      expect(mockOf(prisma, 'update')).toHaveBeenCalledTimes(1);
      expect(
        (prisma as unknown as { userTokenRecord: Record<string, unknown> })
          .userTokenRecord.findFirst,
      ).toBeUndefined();
    });

    it('P2025（條件不符）→ 回 null', async () => {
      const { prisma, repo } = makeMocks();
      mockOf(prisma, 'update').mockRejectedValue({ code: 'P2025' });

      await expect(repo.claim('t', 'VERIFY_EMAIL')).resolves.toBeNull();
    });

    it('其他錯誤照常拋出，不得被當成 claim 失敗吞掉', async () => {
      const { prisma, repo } = makeMocks();
      mockOf(prisma, 'update').mockRejectedValue({ code: 'P1001' });

      await expect(repo.claim('t', 'VERIFY_EMAIL')).rejects.toMatchObject({
        code: 'P1001',
      });
    });
  });

  describe('invalidateAll', () => {
    it('只作廢該使用者該用途的未使用 token', async () => {
      const { prisma, repo } = makeMocks();

      await repo.invalidateAll(USER_ID, 'VERIFY_EMAIL');

      const args = mockOf(prisma, 'updateMany').mock.calls[0][0] as {
        where: { userId: string; purpose: string; usedAt: null };
        data: { usedAt: Date };
      };
      expect(args.where).toEqual({
        userId: USER_ID,
        purpose: 'VERIFY_EMAIL',
        usedAt: null,
      });
      expect(args.data.usedAt).toBeInstanceOf(Date);
    });
  });
});
