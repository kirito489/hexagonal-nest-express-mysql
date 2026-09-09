import { Injectable } from '@nestjs/common';
import {
  generateOneTimeToken,
  hashOneTimeToken,
} from '@app/shared/utils/one-time-token';
import { PrismaService } from '@app/infrastructure/prisma/prisma.service';
import { PasswordResetTokenPort } from '@app/application/port/out/auth/PasswordResetTokenPort';

/**
 * 密碼重設 Token 持久化 Adapter。
 * 使用 crypto.randomBytes 產生安全的隨機 token，DB 只存單向雜湊。
 */
@Injectable()
export class PrismaPasswordResetTokenRepository implements PasswordResetTokenPort {
  constructor(private readonly prisma: PrismaService) {}

  async createToken(
    memberId: string,
    expiresInMinutes: number,
  ): Promise<string> {
    const token = generateOneTimeToken();
    const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);

    // 只存雜湊：原文僅回傳給呼叫端寄信，DB 外洩也無法反推出可用的重設 token
    await this.prisma.passwordResetTokenRecord.create({
      data: { memberId, token: hashOneTimeToken(token), expiresAt },
    });

    return token;
  }

  async claim(token: string): Promise<{ memberId: string } | null> {
    try {
      // 用 extended where 一次 UPDATE 同時檢查 token + 未使用 + 未過期：
      // 任一條件不滿足 → Prisma 丟 P2025（記錄找不到）→ 視為 claim 失敗
      const result = await this.prisma.passwordResetTokenRecord.update({
        where: {
          token: hashOneTimeToken(token),
          usedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { usedAt: new Date() },
        select: { memberId: true },
      });
      return { memberId: result.memberId };
    } catch (err) {
      if (this.isRecordNotFound(err)) return null;
      throw err;
    }
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
