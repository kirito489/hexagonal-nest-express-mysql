export const PASSWORD_RESET_TOKEN_PORT = 'PASSWORD_RESET_TOKEN_PORT';

export interface PasswordResetTokenPort {
  /**
   * 建立密碼重設 token
   * @param memberId - 使用者 ID
   * @param expiresInMinutes - token 有效期（分鐘）
   * @returns 產生的 token 字串
   */
  createToken(memberId: string, expiresInMinutes: number): Promise<string>;

  /**
   * 驗證 token 是否有效（未過期、未使用）
   * @param token - token 字串
   * @returns memberId 若有效，null 若無效
   */
  validateToken(token: string): Promise<{ memberId: string } | null>;

  /**
   * 標記 token 已使用
   * @param token - token 字串
   */
  markUsed(token: string): Promise<void>;
}
