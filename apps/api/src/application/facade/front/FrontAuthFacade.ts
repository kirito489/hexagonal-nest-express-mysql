import { Inject, Injectable } from '@nestjs/common';
import {
  FRONT_LOGIN_USE_CASE,
  FRONT_LOGOUT_USE_CASE,
  FRONT_REFRESH_USE_CASE,
  FrontLoginCommand,
  FrontLoginUseCase,
  FrontLogoutUseCase,
  FrontRefreshUseCase,
  FrontTokenPair,
} from '../../port/in/front/auth/FrontAuthUseCases';

/** 前台認證的 Facade：controller 只認識它，不直接碰 use case */
@Injectable()
export class FrontAuthFacade {
  constructor(
    @Inject(FRONT_LOGIN_USE_CASE)
    private readonly loginUseCase: FrontLoginUseCase,
    @Inject(FRONT_REFRESH_USE_CASE)
    private readonly refreshUseCase: FrontRefreshUseCase,
    @Inject(FRONT_LOGOUT_USE_CASE)
    private readonly logoutUseCase: FrontLogoutUseCase,
  ) {}

  login(command: FrontLoginCommand): Promise<FrontTokenPair> {
    return this.loginUseCase.execute(command);
  }

  refresh(refreshToken: string): Promise<FrontTokenPair> {
    return this.refreshUseCase.execute(refreshToken);
  }

  logout(userId: string): Promise<void> {
    return this.logoutUseCase.execute(userId);
  }
}
