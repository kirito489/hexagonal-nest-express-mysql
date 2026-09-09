import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import pino from 'pino';

const log = pino({
  name: 'seed-test-front-users',
  transport: {
    target: 'pino-pretty',
    options: { colorize: true, translateTime: 'HH:MM:ss' },
  },
});

const BCRYPT_ROUNDS = 10;

/**
 * 前台測試帳號。
 *
 * 兩個帳號刻意涵蓋**已驗證與未驗證**兩種狀態：註冊流程（下一支 change）
 * 會依 `emailVerifiedAt` 分歧，先有資料才驗得到。
 */
const TEST_USERS = [
  {
    email: process.env.FRONT_DEFAULT_EMAIL || 'user@test.com',
    displayName: '前台測試使用者',
    password: process.env.FRONT_DEFAULT_PASSWORD || 'User1234!',
    emailVerified: true,
  },
  {
    email: 'unverified@test.com',
    displayName: '未驗證使用者',
    password: 'User1234!',
    emailVerified: false,
  },
];

export default async function seed(prisma: PrismaClient): Promise<void> {
  log.info('插入前台測試使用者...');

  for (const user of TEST_USERS) {
    const passwordHash = await bcrypt.hash(user.password, BCRYPT_ROUNDS);
    const emailVerifiedAt = user.emailVerified ? new Date() : null;

    await prisma.userRecord.upsert({
      where: { email: user.email },
      // 不覆寫既有的 tokenVersion 與 lastLoginAt——重跑 seed 不該把人登出
      update: {
        displayName: user.displayName,
        password: passwordHash,
        emailVerifiedAt,
        status: true,
        deletedAt: null,
      },
      create: {
        email: user.email,
        displayName: user.displayName,
        password: passwordHash,
        emailVerifiedAt,
      },
    });
    log.info(`  ${user.email}（${user.emailVerified ? '已驗證' : '未驗證'}）`);
  }

  log.info('前台測試使用者完成');
}
