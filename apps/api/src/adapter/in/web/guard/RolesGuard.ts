import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { RoleCode } from '../../../../domain/value-object/Role';
import { FeatureFlagService } from '../../../../application/service/shared/FeatureFlagService';
import { ROLES_KEY } from '../decorator/roles.decorator';
import { MemberContext } from '../decorator/current-member.decorator';

/**
 * 角色守衛：必須搭配 JwtAuthGuard 一起使用（JwtAuthGuard 先跑）。
 *
 * 當 APPLICATION_ADMIN_ROLE_ENABLED 關閉時，一律放行（跳過角色檢查）。
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly featureFlags: FeatureFlagService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    if (!this.featureFlags.isEnabled('adminRoleEnabled')) return true;

    const requiredRoles = this.reflector.getAllAndOverride<RoleCode[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<Request & { member: MemberContext }>();

    // 用 roleCode（如 SUPERADMIN）比對，不要用 roleName（顯示名「管理者」）
    if (!requiredRoles.includes(request.member?.roleCode as RoleCode)) {
      throw new ForbiddenException('權限不足');
    }

    return true;
  }
}
