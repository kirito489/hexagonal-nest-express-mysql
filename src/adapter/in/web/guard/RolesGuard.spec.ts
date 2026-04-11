import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './RolesGuard';
import { RoleName } from '../../../../domain/value-object/Role';
import { FeatureFlagService } from '../../../../application/service/FeatureFlagService';

const makeContext = (roleName: string): ExecutionContext => {
  const request = { member: { roleName } };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: jest.fn(),
    getClass: jest.fn(),
  } as unknown as ExecutionContext;
};

const mockFeatureFlags = {
  isEnabled: jest.fn().mockReturnValue(true),
  onModuleInit: jest.fn(),
};

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: jest.Mocked<Reflector>;

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn(),
    } as unknown as jest.Mocked<Reflector>;
    mockFeatureFlags.isEnabled.mockReturnValue(true);
    guard = new RolesGuard(
      reflector,
      mockFeatureFlags as unknown as FeatureFlagService,
    );
  });

  it('無 @Roles 裝飾（undefined）→ 放行', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    expect(guard.canActivate(makeContext('member'))).toBe(true);
  });

  it('空 roles 陣列 → 放行', () => {
    reflector.getAllAndOverride.mockReturnValue([]);
    expect(guard.canActivate(makeContext('member'))).toBe(true);
  });

  it('使用者角色符合要求 → 放行', () => {
    reflector.getAllAndOverride.mockReturnValue([RoleName.ADMIN]);
    expect(guard.canActivate(makeContext(RoleName.ADMIN))).toBe(true);
  });

  it('使用者角色不符合要求 → ForbiddenException', () => {
    reflector.getAllAndOverride.mockReturnValue([RoleName.ADMIN]);
    expect(() => guard.canActivate(makeContext('member'))).toThrow(
      ForbiddenException,
    );
  });

  it('member 為 undefined → ForbiddenException', () => {
    reflector.getAllAndOverride.mockReturnValue([RoleName.ADMIN]);
    const ctx = {
      switchToHttp: () => ({ getRequest: () => ({ member: undefined }) }),
      getHandler: jest.fn(),
      getClass: jest.fn(),
    } as unknown as ExecutionContext;
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });
});
