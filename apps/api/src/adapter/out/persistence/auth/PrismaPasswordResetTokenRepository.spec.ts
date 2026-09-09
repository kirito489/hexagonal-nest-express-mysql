import { createHash } from 'crypto';
import { PrismaPasswordResetTokenRepository } from './PrismaPasswordResetTokenRepository';
import { PrismaService } from '@app/infrastructure/prisma/prisma.service';

const MEMBER_ID = '3f6c1b2a-8d4e-4a9f-b1c7-2e5d9a0f7b31';

const sha256 = (value: string): string =>
  createHash('sha256').update(value).digest('hex');

const makeMocks = () => {
  const prisma = {
    passwordResetTokenRecord: {
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({ memberId: MEMBER_ID }),
    },
  } as unknown as PrismaService;
  return { prisma, repo: new PrismaPasswordResetTokenRepository(prisma) };
};

const createArgs = (prisma: PrismaService) =>
  (
    prisma as unknown as {
      passwordResetTokenRecord: { create: jest.Mock };
    }
  ).passwordResetTokenRecord.create.mock.calls[0][0] as {
    data: { token: string; memberId: string; expiresAt: Date };
  };

const updateArgs = (prisma: PrismaService) =>
  (
    prisma as unknown as {
      passwordResetTokenRecord: { update: jest.Mock };
    }
  ).passwordResetTokenRecord.update.mock.calls[0][0] as {
    where: { token: string; usedAt: null; expiresAt: { gt: Date } };
    data: { usedAt: Date };
  };

/**
 * 密碼重設 token 的持久層。
 *
 * **這支測試是補上去的**：重構共用的 token 機制前才發現它完全沒有覆蓋
 * ——repository 沒有單元測試，而 e2e 只測 `reset-password` 的失敗路徑
 * （無效 token、缺參數），**沒有任何測試走完「產生 token → 用它成功重設」**。
 *
 * 也就是說在補這支之前，把 `hashToken` 整個拿掉、token 直接存明文，
 * 全部測試照樣綠。
 */
describe('PrismaPasswordResetTokenRepository', () => {
  describe('createToken', () => {
    it('DB 只存 sha256 雜湊，不存明文', async () => {
      const { prisma, repo } = makeMocks();

      const token = await repo.createToken(MEMBER_ID, 30);

      const stored = createArgs(prisma).data.token;
      expect(stored).toBe(sha256(token));
      // 明文外洩的話 DB 一被讀走就等於拿到可用的重設連結
      expect(stored).not.toBe(token);
    });

    it('回傳的明文 token 有足夠長度（randomBytes(32) 的 hex）', async () => {
      const { repo } = makeMocks();

      const token = await repo.createToken(MEMBER_ID, 30);

      expect(token).toMatch(/^[0-9a-f]{64}$/);
    });

    it('每次產生的 token 都不同', async () => {
      const { repo } = makeMocks();

      const first = await repo.createToken(MEMBER_ID, 30);
      const second = await repo.createToken(MEMBER_ID, 30);

      expect(first).not.toBe(second);
    });

    it('依分鐘數算出到期時間', async () => {
      const { prisma, repo } = makeMocks();
      const before = Date.now();

      await repo.createToken(MEMBER_ID, 30);

      const { expiresAt } = createArgs(prisma).data;
      const elapsed = expiresAt.getTime() - before;
      expect(elapsed).toBeGreaterThan(29 * 60 * 1000);
      expect(elapsed).toBeLessThanOrEqual(31 * 60 * 1000);
    });
  });

  describe('claim', () => {
    /**
     * 消耗 token 必須是**單一原子操作**：先查再更新會讓同一枚 token
     * 在並行請求下被用兩次。
     */
    it('用 extended where 一次比對 token / 未使用 / 未過期', async () => {
      const { prisma, repo } = makeMocks();

      await repo.claim('plain-token');

      const args = updateArgs(prisma);
      expect(args.where.token).toBe(sha256('plain-token'));
      expect(args.where.usedAt).toBeNull();
      expect(args.where.expiresAt.gt).toBeInstanceOf(Date);
      expect(args.data.usedAt).toBeInstanceOf(Date);
    });

    it('成功時回傳 memberId', async () => {
      const { repo } = makeMocks();

      await expect(repo.claim('plain-token')).resolves.toEqual({
        memberId: MEMBER_ID,
      });
    });

    /** 任一條件不滿足 → Prisma 丟 P2025 → 視為 claim 失敗而非例外 */
    it('P2025（找不到符合條件的紀錄）→ 回 null', async () => {
      const { prisma, repo } = makeMocks();
      (
        prisma as unknown as {
          passwordResetTokenRecord: { update: jest.Mock };
        }
      ).passwordResetTokenRecord.update.mockRejectedValue({ code: 'P2025' });

      await expect(repo.claim('whatever')).resolves.toBeNull();
    });

    it('其他錯誤照常拋出，不得被當成 claim 失敗吞掉', async () => {
      const { prisma, repo } = makeMocks();
      (
        prisma as unknown as {
          passwordResetTokenRecord: { update: jest.Mock };
        }
      ).passwordResetTokenRecord.update.mockRejectedValue({ code: 'P1001' });

      await expect(repo.claim('whatever')).rejects.toMatchObject({
        code: 'P1001',
      });
    });
  });
});
