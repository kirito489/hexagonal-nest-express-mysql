import { Injectable } from '@nestjs/common';
import { PrismaService } from '@app/infrastructure/prisma/prisma.service';
import {
  LoadUserPort,
  UserContext,
  UserCredentials,
} from '@app/application/port/out/user/LoadUserPort';
import { SaveUserPort } from '@app/application/port/out/user/SaveUserPort';
import { normalizeEmail } from '@app/shared/utils/normalize-email';

/** Prisma 查詢要取的欄位；集中一份避免兩支方法各挑各的 */
const USER_FIELDS = {
  id: true,
  email: true,
  displayName: true,
  emailVerifiedAt: true,
  status: true,
  tokenVersion: true,
  lastLoginAt: true,
} as const;

type UserRow = {
  id: string;
  email: string;
  displayName: string;
  emailVerifiedAt: Date | null;
  status: boolean;
  tokenVersion: number;
  lastLoginAt: Date | null;
};

const toContext = (row: UserRow): UserContext => ({
  id: row.id,
  email: row.email,
  displayName: row.displayName,
  // 對外只說「驗了沒」——時間點是內部資訊，前台不需要
  emailVerified: row.emailVerifiedAt !== null,
  status: row.status,
  tokenVersion: row.tokenVersion,
  lastLoginAt: row.lastLoginAt,
});

/**
 * 前台使用者的持久層。
 *
 * **每一支 read path 都帶 `deletedAt: null`**：軟刪後 email 不釋放，
 * 漏掉會查到已刪除的帳號並讓它登得進來。
 */
@Injectable()
export class PrismaUserRepository implements LoadUserPort, SaveUserPort {
  constructor(private readonly prisma: PrismaService) {}

  async loadCredentialsByEmail(email: string): Promise<UserCredentials | null> {
    const row = await this.prisma.userRecord.findFirst({
      where: { email: normalizeEmail(email), deletedAt: null },
      select: { ...USER_FIELDS, password: true },
    });
    return row ? { ...toContext(row), password: row.password } : null;
  }

  async loadUserById(id: string): Promise<UserContext | null> {
    const row = await this.prisma.userRecord.findFirst({
      where: { id, deletedAt: null },
      select: USER_FIELDS,
    });
    return row ? toContext(row) : null;
  }

  async touchLastLogin(id: string): Promise<void> {
    await this.prisma.userRecord.updateMany({
      where: { id, deletedAt: null },
      data: { lastLoginAt: new Date() },
    });
  }

  async bumpTokenVersion(id: string): Promise<number> {
    const updated = await this.prisma.userRecord.update({
      where: { id },
      data: { tokenVersion: { increment: 1 } },
      select: { tokenVersion: true },
    });
    return updated.tokenVersion;
  }
}
