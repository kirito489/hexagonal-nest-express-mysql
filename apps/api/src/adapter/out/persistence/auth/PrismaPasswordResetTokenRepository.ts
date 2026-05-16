import { Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service';
import { PasswordResetTokenPort } from '../../../../application/port/out/auth/PasswordResetTokenPort';

/**
 * 密碼重設 Token 持久化 Adapter。
 * 使用 crypto.randomBytes 產生安全的隨機 token。
 */
@Injectable()
export class PrismaPasswordResetTokenRepository implements PasswordResetTokenPort {
  constructor(private readonly prisma: PrismaService) {}

  async createToken(
    memberId: string,
    expiresInMinutes: number,
  ): Promise<string> {
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);

    await this.prisma.passwordResetTokenRecord.create({
      data: { memberId, token, expiresAt },
    });

    return token;
  }

  async validateToken(token: string): Promise<{ memberId: string } | null> {
    const record = await this.prisma.passwordResetTokenRecord.findUnique({
      where: { token },
      select: { memberId: true, expiresAt: true, usedAt: true },
    });

    if (!record) return null;
    if (record.usedAt) return null; // 已使用
    if (record.expiresAt < new Date()) return null; // 已過期

    return { memberId: record.memberId };
  }

  async markUsed(token: string): Promise<void> {
    await this.prisma.passwordResetTokenRecord.update({
      where: { token },
      data: { usedAt: new Date() },
    });
  }
}
