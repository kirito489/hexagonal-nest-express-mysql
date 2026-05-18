import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SecurityFacade } from '../../../../application/facade/SecurityFacade';
import {
  IpBlacklistItem,
  IpListItem,
} from '../../../../application/port/out/security/IpListPort';
import { ListIpListResult } from '../../../../application/port/in/security/SecurityUseCases';
import { JwtAuthGuard } from '../guard/JwtAuthGuard';
import { RolesGuard } from '../guard/RolesGuard';
import { Roles } from '../decorator/roles.decorator';
import { RoleCode } from '../../../../domain/value-object/Role';
import {
  CurrentMember,
  MemberContext,
} from '../decorator/current-member.decorator';
import { ZodValidationPipe } from '../../../../infrastructure/zod-validation.pipe';
import { ipSchema } from './ip-schema';
import { listIpListQuerySchema, ListIpListQuery } from './ListIpListQuery';
import {
  AddIpWhitelistRequest,
  addIpWhitelistSchema,
} from './AddIpWhitelistRequest';
import {
  AddIpBlacklistRequest,
  addIpBlacklistSchema,
} from './AddIpBlacklistRequest';
import {
  UnlockAccountRequest,
  unlockAccountSchema,
} from './UnlockAccountRequest';

/**
 * 安全管理 Controller（SUPERADMIN only）：
 * - IP 黑白名單 CRUD（分頁 + IP 模糊搜尋）
 * - 帳號解鎖（成功 204、找不到 email 404、未鎖 409）
 *
 * 注意：security 模組刻意用 RolesGuard + @Roles(SUPERADMIN) 粗粒度 role gate，
 * 不走其他模組的 PermissionsGuard 細粒度權限
 */
@Controller('security')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleCode.SUPERADMIN)
export class SecurityController {
  constructor(private readonly securityFacade: SecurityFacade) {}

  // ── IP 白名單 ────────────────────────────────

  @Get('ip-whitelist')
  listWhitelist(
    @Query(new ZodValidationPipe(listIpListQuerySchema))
    query: ListIpListQuery,
  ): Promise<ListIpListResult<IpListItem>> {
    return this.securityFacade.listWhitelist(query);
  }

  @Post('ip-whitelist')
  @HttpCode(HttpStatus.CREATED)
  addToWhitelist(
    @Body(new ZodValidationPipe(addIpWhitelistSchema))
    dto: AddIpWhitelistRequest,
    @CurrentMember() member: MemberContext,
  ): Promise<{ id: string }> {
    return this.securityFacade.addToWhitelist({
      ip: dto.ip,
      description: dto.description,
      createdBy: member.sub,
    });
  }

  @Delete('ip-whitelist/:ip')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeFromWhitelist(
    @Param('ip', new ZodValidationPipe(ipSchema)) ip: string,
  ): Promise<void> {
    await this.securityFacade.removeFromWhitelist(ip);
  }

  // ── IP 黑名單 ────────────────────────────────

  @Get('ip-blacklist')
  listBlacklist(
    @Query(new ZodValidationPipe(listIpListQuerySchema))
    query: ListIpListQuery,
  ): Promise<ListIpListResult<IpBlacklistItem>> {
    return this.securityFacade.listBlacklist(query);
  }

  @Post('ip-blacklist')
  @HttpCode(HttpStatus.CREATED)
  addToBlacklist(
    @Body(new ZodValidationPipe(addIpBlacklistSchema))
    dto: AddIpBlacklistRequest,
    @CurrentMember() member: MemberContext,
  ): Promise<{ id: string }> {
    return this.securityFacade.addToBlacklist({
      ip: dto.ip,
      reason: dto.reason,
      createdBy: member.sub,
    });
  }

  @Delete('ip-blacklist/:ip')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeFromBlacklist(
    @Param('ip', new ZodValidationPipe(ipSchema)) ip: string,
  ): Promise<void> {
    await this.securityFacade.removeFromBlacklist(ip);
  }

  // ── 帳號解鎖 ─────────────────────────────────

  @Post('unlock-account')
  @HttpCode(HttpStatus.NO_CONTENT)
  async unlockAccount(
    @Body(new ZodValidationPipe(unlockAccountSchema))
    dto: UnlockAccountRequest,
  ): Promise<void> {
    await this.securityFacade.unlockAccount(dto.email);
  }
}
