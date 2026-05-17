import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { SecurityFacade } from '../../../../application/facade/SecurityFacade';
import {
  IpBlacklistItem,
  IpListItem,
} from '../../../../application/port/out/security/IpListPort';
import { JwtAuthGuard } from '../guard/JwtAuthGuard';
import { RolesGuard } from '../guard/RolesGuard';
import { Roles } from '../decorator/roles.decorator';
import { RoleCode } from '../../../../domain/value-object/Role';
import {
  CurrentMember,
  MemberContext,
} from '../decorator/current-member.decorator';
import { ZodValidationPipe } from '../../../../infrastructure/zod-validation.pipe';
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
 * 安全管理 Controller（Admin only）：
 * - IP 黑白名單 CRUD
 * - 帳號解鎖
 */
@Controller('security')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleCode.SUPERADMIN)
export class SecurityController {
  constructor(private readonly securityFacade: SecurityFacade) {}

  // ── IP 白名單 ────────────────────────────────

  @Get('ip-whitelist')
  async listWhitelist(): Promise<IpListItem[]> {
    return this.securityFacade.listWhitelist();
  }

  @Post('ip-whitelist')
  @HttpCode(HttpStatus.CREATED)
  async addToWhitelist(
    @Body(new ZodValidationPipe(addIpWhitelistSchema))
    dto: AddIpWhitelistRequest,
    @CurrentMember() member: MemberContext,
  ): Promise<{ message: string }> {
    await this.securityFacade.addToWhitelist(
      dto.ip,
      dto.description,
      member.sub,
    );
    return { message: `IP ${dto.ip} 已加入白名單` };
  }

  @Delete('ip-whitelist/:ip')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeFromWhitelist(@Param('ip') ip: string): Promise<void> {
    await this.securityFacade.removeFromWhitelist(ip);
  }

  // ── IP 黑名單 ────────────────────────────────

  @Get('ip-blacklist')
  async listBlacklist(): Promise<IpBlacklistItem[]> {
    return this.securityFacade.listBlacklist();
  }

  @Post('ip-blacklist')
  @HttpCode(HttpStatus.CREATED)
  async addToBlacklist(
    @Body(new ZodValidationPipe(addIpBlacklistSchema))
    dto: AddIpBlacklistRequest,
    @CurrentMember() member: MemberContext,
  ): Promise<{ message: string }> {
    await this.securityFacade.addToBlacklist(dto.ip, dto.reason, member.sub);
    return { message: `IP ${dto.ip} 已加入黑名單` };
  }

  @Delete('ip-blacklist/:ip')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeFromBlacklist(@Param('ip') ip: string): Promise<void> {
    await this.securityFacade.removeFromBlacklist(ip);
  }

  // ── 帳號解鎖 ─────────────────────────────────

  @Post('unlock-account')
  @HttpCode(HttpStatus.OK)
  async unlockAccount(
    @Body(new ZodValidationPipe(unlockAccountSchema))
    dto: UnlockAccountRequest,
  ): Promise<{ message: string }> {
    await this.securityFacade.unlockAccount(dto.email);
    return { message: `帳號 ${dto.email} 已解鎖` };
  }
}
