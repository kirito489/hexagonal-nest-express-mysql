import { Injectable } from '@nestjs/common';
import { PrismaService } from '@app/infrastructure/prisma/prisma.service';
import {
  UserTokenPort,
  UserTokenPurpose,
} from '@app/application/port/out/user/UserTokenPort';
import {
  generateOneTimeToken,
  hashOneTimeToken,
} from '@app/shared/utils/one-time-token';

/**
 * 前台一次性 token 的持久層。
 *
 * 與後台的 `PrismaPasswordResetTokenRepository` 共用 token 的產生與雜湊
 * （`shared/utils/one-time-token`），但**不共用查詢**——兩者操作不同的 model，
 * 硬要共用會生出一個帶 model 名稱參數的抽象，比重複更糟。
 */
@Injectable()
export class PrismaUserTokenRepository implements UserTokenPort {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    userId: string,
    purpose: UserTokenPurpose,
    expiresInMinutes: number,
  ): Promise<string> {
    const token = generateOneTimeToken();
    await this.prisma.userTokenRecord.create({
      data: {
        userId,
        purpose,
        token: hashOneTimeToken(token),
        expiresAt: new Date(Date.now() + expiresInMinutes * 60 * 1000),
      },
    });
    return token;
  }

  async claim(
    token: string,
    purpose: UserTokenPurpose,
  ): Promise<{ userId: string } | null> {
    try {
      // extended where 一次比對 token + 用途 + 未使用 + 未過期：
      // 任一不滿足 → P2025 → claim 失敗。**沒有 check-then-act 的競態**
      const result = await this.prisma.userTokenRecord.update({
        where: {
          token: hashOneTimeToken(token),
          purpose,
          usedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { usedAt: new Date() },
        select: { userId: true },
      });
      return { userId: result.userId };
    } catch (err) {
      if (this.isRecordNotFound(err)) return null;
      throw err;
    }
  }

  async invalidateAll(
    userId: string,
    purpose: UserTokenPurpose,
  ): Promise<void> {
    await this.prisma.userTokenRecord.updateMany({
      where: { userId, purpose, usedAt: null },
      data: { usedAt: new Date() },
    });
  }

  private isRecordNotFound(err: unknown): boolean {
    return (
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      (err as { code: string }).code === 'P2025'
    );
  }
}
