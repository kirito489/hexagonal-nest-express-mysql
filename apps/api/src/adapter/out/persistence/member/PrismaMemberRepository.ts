import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service';
import {
  ListMembersPage,
  ListMembersParams,
  LoadMemberPort,
  MemberRecordDto,
} from '../../../../application/port/out/member/LoadMemberPort';
import { SaveMemberPort } from '../../../../application/port/out/member/SaveMemberPort';
import { UpdateMemberPasswordPort } from '../../../../application/port/out/member/UpdateMemberPasswordPort';
import {
  LoadMemberContextPort,
  MemberContextData,
} from '../../../../application/port/out/member/LoadMemberContextPort';
import { Member } from '../../../../domain/model/Member';
import { EmailAlreadyExistsException } from '../../../../domain/exception/EmailAlreadyExistsException';

@Injectable()
export class PrismaMemberRepository
  implements
    LoadMemberPort,
    SaveMemberPort,
    UpdateMemberPasswordPort,
    LoadMemberContextPort
{
  constructor(private readonly prisma: PrismaService) {}

  async loadMemberByEmail(email: string): Promise<Member | null> {
    const r = await this.prisma.memberRecord.findUnique({
      where: { email, deletedAt: null },
      include: { role: { select: { name: true } } },
    });
    if (!r) return null;
    return Member.reconstitute(
      r.id,
      r.email,
      r.member,
      r.password,
      r.roleId,
      r.status,
      r.isDefault,
      r.createdAt,
      r.role.name,
    );
  }

  async loadMemberById(id: string): Promise<MemberRecordDto | null> {
    // extended where：findUnique 用 id 為主索引同時過濾軟刪
    const r = await this.prisma.memberRecord.findUnique({
      where: { id, deletedAt: null },
      include: { role: { select: { id: true, name: true } } },
    });
    if (!r) return null;
    return {
      id: r.id,
      email: r.email,
      member: r.member,
      roleId: r.roleId,
      roleName: r.role.name,
      status: r.status,
      isDefault: r.isDefault,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      lastLoginAt: r.lastLoginAt,
    };
  }

  async loadMemberDomainById(id: string): Promise<Member | null> {
    const r = await this.prisma.memberRecord.findUnique({
      where: { id, deletedAt: null },
    });
    if (!r) return null;
    return Member.reconstitute(
      r.id,
      r.email,
      r.member,
      r.password,
      r.roleId,
      r.status,
      r.isDefault,
      r.createdAt,
    );
  }

  async listMembers(params: ListMembersParams): Promise<ListMembersPage> {
    const where: Prisma.MemberRecordWhereInput = { deletedAt: null };
    if (params.name) where.member = { contains: params.name };
    if (params.email) where.email = { contains: params.email };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.memberRecord.findMany({
        where,
        include: { role: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (params.page - 1) * params.limit,
        take: params.limit,
      }),
      this.prisma.memberRecord.count({ where }),
    ]);

    return {
      data: rows.map((r) => ({
        id: r.id,
        email: r.email,
        member: r.member,
        roleId: r.roleId,
        roleName: r.role.name,
        status: r.status,
        isDefault: r.isDefault,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        lastLoginAt: r.lastLoginAt,
      })),
      total,
    };
  }

  async existsByEmail(email: string, excludeId?: string): Promise<boolean> {
    const count = await this.prisma.memberRecord.count({
      where: excludeId
        ? { email, deletedAt: null, NOT: { id: excludeId } }
        : { email, deletedAt: null },
    });
    return count > 0;
  }

  async saveMember(member: Member): Promise<void> {
    try {
      await this.prisma.memberRecord.upsert({
        where: { id: member.id.toString() },
        create: {
          id: member.id.toString(),
          email: member.email.toString(),
          member: member.member,
          password: member.password,
          roleId: member.roleId,
          status: member.status,
          isDefault: member.isDefault,
        },
        update: {
          email: member.email.toString(),
          member: member.member,
          password: member.password,
          roleId: member.roleId,
          status: member.status,
        },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new EmailAlreadyExistsException();
      }
      throw err;
    }
  }

  async saveMemberWithPassword(
    member: Member,
    passwordHash: string,
  ): Promise<void> {
    try {
      // upsert 本身就是單一 SQL（INSERT ... ON DUPLICATE KEY UPDATE），
      // 不需要 $transaction 包；多此一舉的 begin/commit 反而增加 latency
      await this.prisma.memberRecord.upsert({
        where: { id: member.id.toString() },
        create: {
          id: member.id.toString(),
          email: member.email.toString(),
          member: member.member,
          password: passwordHash,
          roleId: member.roleId,
          status: member.status,
          isDefault: member.isDefault,
        },
        update: {
          email: member.email.toString(),
          member: member.member,
          password: passwordHash,
          roleId: member.roleId,
          status: member.status,
          lastPasswordChange: new Date(),
        },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new EmailAlreadyExistsException();
      }
      throw err;
    }
  }

  async deleteMember(id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const record = await tx.memberRecord.findUnique({
        where: { id },
        select: { email: true },
      });
      if (!record) return;
      const ts = Date.now();
      const suffix = `${ts}_${randomBytes(4).toString('hex')}`;
      await tx.memberRecord.update({
        where: { id },
        data: {
          email: `${record.email}_${suffix}`,
          deletedAt: new Date(ts),
        },
      });
    });
  }

  async updateLastLoginAt(id: string): Promise<void> {
    await this.prisma.memberRecord.update({
      where: { id },
      data: { lastLoginAt: new Date() },
    });
  }

  async updatePassword(memberId: string, passwordHash: string): Promise<void> {
    await this.prisma.memberRecord.update({
      where: { id: memberId },
      data: {
        password: passwordHash,
        lastPasswordChange: new Date(),
      },
    });
  }

  async loadMemberContext(memberId: string): Promise<MemberContextData | null> {
    const member = await this.prisma.memberRecord.findFirst({
      where: { id: memberId, deletedAt: null },
      include: {
        role: {
          include: {
            permissions: {
              where: { permission: { status: true } },
              include: { permission: true },
            },
          },
        },
      },
    });
    if (!member) return null;
    return {
      id: member.id,
      email: member.email,
      roleName: member.role.name,
      roleCode: member.role.roleCode ?? '',
      permissions: member.role.permissions.map(
        (rp) => rp.permission.permissionCode,
      ),
      status: member.status,
      lastPasswordChange: member.lastPasswordChange,
    };
  }
}
