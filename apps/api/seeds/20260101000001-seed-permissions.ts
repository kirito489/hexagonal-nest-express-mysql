import { PrismaClient } from '@prisma/client';
import pino from 'pino';

const log = pino({
  name: 'seed-permissions',
  transport: {
    target: 'pino-pretty',
    options: { colorize: true, translateTime: 'HH:MM:ss' },
  },
});

type PermissionSeed = {
  permissionCode: string;
  name: string;
  platform: string;
  module: string;
  subModule?: string | null;
  action: string;
};

const PERMISSIONS: PermissionSeed[] = [
  // 後台 - 帳號管理
  {
    permissionCode: 'BACKEND:ACCOUNT:VIEW',
    name: '後台-帳號管理-檢視',
    platform: 'BACKEND',
    module: 'ACCOUNT',
    action: 'VIEW',
  },
  {
    permissionCode: 'BACKEND:ACCOUNT:EDIT',
    name: '後台-帳號管理-編輯',
    platform: 'BACKEND',
    module: 'ACCOUNT',
    action: 'EDIT',
  },

  // 後台 - 角色與權限管理
  {
    permissionCode: 'BACKEND:ROLE:VIEW',
    name: '後台-角色與權限管理-檢視',
    platform: 'BACKEND',
    module: 'ROLE',
    action: 'VIEW',
  },
  {
    permissionCode: 'BACKEND:ROLE:EDIT',
    name: '後台-角色與權限管理-編輯',
    platform: 'BACKEND',
    module: 'ROLE',
    action: 'EDIT',
  },
];

export default async function seed(prisma: PrismaClient): Promise<void> {
  log.info('插入權限資料...');

  for (const p of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { permissionCode: p.permissionCode },
      update: {
        name: p.name,
        platform: p.platform,
        module: p.module,
        subModule: p.subModule ?? null,
        action: p.action,
      },
      create: {
        permissionCode: p.permissionCode,
        name: p.name,
        platform: p.platform,
        module: p.module,
        subModule: p.subModule ?? null,
        action: p.action,
      },
    });
  }

  log.info(`完成：${PERMISSIONS.length} 個 permissions`);
}
