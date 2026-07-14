import bcrypt from 'bcrypt';
import { PrismaService } from '../../src/infrastructure/prisma/prisma.service';

/**
 * 依外鍵順序清空所有表（e2e 每個 test 前重置，確保隔離）。
 * 子表（join / 參照）先刪，父表（Role / Permission）後刪。
 */
export const resetDb = async (prisma: PrismaService): Promise<void> => {
  await prisma.rolePermission.deleteMany();
  await prisma.memberRecord.deleteMany();
  await prisma.authLogRecord.deleteMany();
  await prisma.passwordResetTokenRecord.deleteMany();
  await prisma.systemLogRecord.deleteMany();
  await prisma.ipWhitelistRecord.deleteMany();
  await prisma.ipBlacklistRecord.deleteMany();
  await prisma.attachmentRecord.deleteMany();
  await prisma.role.deleteMany();
  await prisma.permission.deleteMany();
};

export interface SeededMember {
  memberId: string;
  roleId: string;
}

/**
 * 建立一個可登入的後台會員:一個 Permission + 一個 Role（綁該權限）+ 一個 Member（bcrypt 密碼）。
 * @returns 新建的 memberId / roleId
 */
export const seedMember = async (
  prisma: PrismaService,
  opts: {
    email: string;
    password: string;
    status?: boolean;
    roleName?: string;
    permissionCode?: string;
  },
): Promise<SeededMember> => {
  const permissionCode = opts.permissionCode ?? 'BACKEND:ACCOUNT:VIEW';
  const [platform, module, action] = permissionCode.split(':');
  const permission = await prisma.permission.create({
    data: { permissionCode, name: permissionCode, platform, module, action },
  });
  const role = await prisma.role.create({
    data: {
      name: opts.roleName ?? 'member',
      status: true,
      isDefault: false,
      permissions: { create: [{ permissionId: permission.id }] },
    },
  });
  const member = await prisma.memberRecord.create({
    data: {
      member: 'Test User',
      email: opts.email,
      password: await bcrypt.hash(opts.password, 1),
      roleId: role.id,
      status: opts.status ?? true,
      isDefault: false,
    },
  });
  return { memberId: member.id, roleId: role.id };
};
