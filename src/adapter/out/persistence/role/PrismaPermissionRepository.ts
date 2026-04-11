import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service';
import {
  PermissionRecord,
  PermissionRepositoryPort,
} from '../../../../application/port/out/role/PermissionRepositoryPort';

@Injectable()
export class PrismaPermissionRepository implements PermissionRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<PermissionRecord[]> {
    const perms = await this.prisma.permission.findMany({
      where: { status: true },
      orderBy: [{ module: 'asc' }, { action: 'asc' }],
    });
    return perms.map((p) => this.toRecord(p));
  }

  async findByCodes(codes: string[]): Promise<PermissionRecord[]> {
    const perms = await this.prisma.permission.findMany({
      where: { permissionCode: { in: codes }, status: true },
    });
    return perms.map((p) => this.toRecord(p));
  }

  async getPermissionsByRoleId(roleId: string): Promise<string[]> {
    const rolePerms = await this.prisma.rolePermission.findMany({
      where: { roleId },
      include: { permission: true },
    });
    return rolePerms.map((rp) => rp.permission.permissionCode);
  }

  async replacePermissions(roleId: string, codes: string[]): Promise<void> {
    const permissions = await this.prisma.permission.findMany({
      where: { permissionCode: { in: codes } },
      select: { id: true },
    });
    await this.prisma.$transaction([
      this.prisma.rolePermission.deleteMany({ where: { roleId } }),
      this.prisma.rolePermission.createMany({
        data: permissions.map((p) => ({ roleId, permissionId: p.id })),
      }),
    ]);
  }

  private toRecord(p: {
    permissionCode: string;
    name: string;
    platform: string;
    module: string;
    action: string;
  }): PermissionRecord {
    return {
      permissionCode: p.permissionCode,
      name: p.name,
      platform: p.platform,
      module: p.module,
      action: p.action,
    };
  }
}
