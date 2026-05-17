import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service';
import {
  LoadRolePort,
  RoleOptionItem,
} from '../../../../application/port/out/role/LoadRolePort';
import {
  ListRolesPage,
  ListRolesParams,
  RoleRecord,
  RoleRepositoryPort,
} from '../../../../application/port/out/role/RoleRepositoryPort';
import { DuplicateRoleNameException } from '../../../../domain/exception/DuplicateRoleNameException';

@Injectable()
export class PrismaRoleRepository implements LoadRolePort, RoleRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  // ── LoadRolePort ──────────────────────────────

  async findDefaultRoleId(): Promise<string> {
    const role = await this.prisma.role.findFirstOrThrow({
      where: { isDefault: true, status: true, deletedAt: null },
    });
    return role.id;
  }

  async findRoleById(
    id: string,
  ): Promise<{ id: string; name: string; roleCode: string | null } | null> {
    const role = await this.prisma.role.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, name: true, roleCode: true },
    });
    return role ?? null;
  }

  async listActiveRoles(): Promise<RoleOptionItem[]> {
    const roles = await this.prisma.role.findMany({
      where: { status: true, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { createdAt: 'asc' },
    });
    return roles;
  }

  // ── RoleRepositoryPort ────────────────────────

  async listRoles(params: ListRolesParams): Promise<ListRolesPage> {
    const where = {
      deletedAt: null,
      ...(params.name ? { name: { contains: params.name } } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.role.findMany({
        where,
        include: { _count: { select: { members: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (params.page - 1) * params.limit,
        take: params.limit,
      }),
      this.prisma.role.count({ where }),
    ]);
    return { data: rows.map((r) => this.toRecord(r)), total };
  }

  async findById(id: string): Promise<RoleRecord | null> {
    const role = await this.prisma.role.findFirst({
      where: { id, deletedAt: null },
      include: { _count: { select: { members: true } } },
    });
    return role ? this.toRecord(role) : null;
  }

  async findByName(name: string): Promise<RoleRecord | null> {
    const role = await this.prisma.role.findFirst({
      where: { name, deletedAt: null },
      include: { _count: { select: { members: true } } },
    });
    return role ? this.toRecord(role) : null;
  }

  async create(data: { name: string }): Promise<RoleRecord> {
    try {
      const role = await this.prisma.role.create({
        data: { name: data.name },
        include: { _count: { select: { members: true } } },
      });
      return this.toRecord(role);
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new DuplicateRoleNameException(data.name);
      }
      throw err;
    }
  }

  async createWithPermissions(
    name: string,
    permissionCodes: string[],
  ): Promise<RoleRecord> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const role = await tx.role.create({
          data: { name },
          include: { _count: { select: { members: true } } },
        });
        if (permissionCodes.length > 0) {
          const permissions = await tx.permission.findMany({
            where: { permissionCode: { in: permissionCodes } },
            select: { id: true },
          });
          await tx.rolePermission.createMany({
            data: permissions.map((p) => ({
              roleId: role.id,
              permissionId: p.id,
            })),
          });
        }
        return this.toRecord(role);
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new DuplicateRoleNameException(name);
      }
      throw err;
    }
  }

  async updateWithPermissions(
    id: string,
    name: string | undefined,
    permissionCodes: string[] | undefined,
  ): Promise<void> {
    if (name === undefined && permissionCodes === undefined) return;
    try {
      await this.prisma.$transaction(async (tx) => {
        if (name !== undefined) {
          await tx.role.update({ where: { id }, data: { name } });
        }
        if (permissionCodes !== undefined) {
          const permissions = await tx.permission.findMany({
            where: { permissionCode: { in: permissionCodes } },
            select: { id: true },
          });
          await tx.rolePermission.deleteMany({ where: { roleId: id } });
          await tx.rolePermission.createMany({
            data: permissions.map((p) => ({ roleId: id, permissionId: p.id })),
          });
        }
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new DuplicateRoleNameException(name ?? '(unknown)');
      }
      throw err;
    }
  }

  async softDelete(id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const record = await tx.role.findUnique({
        where: { id },
        select: { name: true },
      });
      if (!record) return;
      const ts = Date.now();
      const suffix = `${ts}_${randomBytes(4).toString('hex')}`;
      await tx.role.update({
        where: { id },
        data: { name: `${record.name}_${suffix}`, deletedAt: new Date(ts) },
      });
    });
  }

  async countMembers(id: string): Promise<number> {
    // 排除軟刪會員：DeleteRoleService 用此判斷「角色是否仍有成員」
    return this.prisma.memberRecord.count({
      where: { roleId: id, deletedAt: null },
    });
  }

  // ── Private helpers ───────────────────────────

  private toRecord(role: {
    id: string;
    name: string;
    status: boolean;
    isDefault: boolean;
    createdAt: Date;
    updatedAt: Date;
    _count?: { members: number };
  }): RoleRecord {
    return {
      id: role.id,
      name: role.name,
      status: role.status,
      isDefault: role.isDefault,
      memberCount: role._count?.members ?? 0,
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
    };
  }
}
