import type { UserContext } from '../../../out/user/LoadUserPort';

/** 前台認證的三個 use case port 與對應 token；每個介面都極窄，聚合在單一檔內 */

/** 對外的使用者摘要；刻意不含 tokenVersion 與 status 等內部欄位 */
export interface FrontUserSummary {
  id: string;
  email: string;
  displayName: string;
  emailVerified: boolean;
}

export interface FrontTokenPair {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresIn: number;
  refreshTokenExpiresIn: number;
  user: FrontUserSummary;
}

export const FRONT_LOGIN_USE_CASE = 'FRONT_LOGIN_USE_CASE';
export interface FrontLoginCommand {
  email: string;
  password: string;
}
export interface FrontLoginUseCase {
  /**
   * @throws UnauthorizedException - 帳號不存在或密碼錯誤（**兩者回應完全相同**）
   * @throws AccountDisabledException - 帳號已停用
   */
  execute(command: FrontLoginCommand): Promise<FrontTokenPair>;
}

export const FRONT_REFRESH_USE_CASE = 'FRONT_REFRESH_USE_CASE';
export interface FrontRefreshUseCase {
  /** @throws UnauthorizedException - token 無效、類型不符、側別不符或已被撤銷 */
  execute(refreshToken: string): Promise<FrontTokenPair>;
}

export const FRONT_LOGOUT_USE_CASE = 'FRONT_LOGOUT_USE_CASE';
export interface FrontLogoutUseCase {
  /** 遞增 tokenVersion，使該帳號所有既發 token 立即失效 */
  execute(userId: string): Promise<void>;
}

/** `/front/me` 直接用守衛掛上的 UserContext，不需要再查一次 DB */
export const toSummary = (user: UserContext): FrontUserSummary => ({
  id: user.id,
  email: user.email,
  displayName: user.displayName,
  emailVerified: user.emailVerified,
});
