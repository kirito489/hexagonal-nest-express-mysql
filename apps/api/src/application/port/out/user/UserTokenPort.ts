export const USER_TOKEN_PORT = 'USER_TOKEN_PORT';

/**
 * 一次性 token 的用途。與 Prisma 的 `UserTokenPurpose` enum 對應。
 *
 * 用聯集字串而非 TS enum（專案慣例），值必須與 schema 逐字相同。
 */
export type UserTokenPurpose = 'VERIFY_EMAIL' | 'RESET_PASSWORD';

export interface UserTokenPort {
  /**
   * 產生一枚一次性 token。
   * @param userId - 前台使用者 ID
   * @param purpose - 用途
   * @param expiresInMinutes - 有效期（分鐘）
   * @returns 明文 token（DB 只存雜湊，這是唯一拿得到明文的時機）
   */
  create(
    userId: string,
    purpose: UserTokenPurpose,
    expiresInMinutes: number,
  ): Promise<string>;

  /**
   * 消耗一枚 token。
   *
   * **必須是單一原子操作**：先查再更新會讓同一枚 token 在並行請求下被用兩次。
   *
   * ⚠️ **必須一併比對 `purpose`**：少了它，拿驗證信的 token 就能重設密碼——
   * 那是「信箱收得到信」升級成「改得了密碼」的提權，而驗證信在註冊當下就寄出，
   * 取得難度遠低於重設信。
   * @param token - 明文 token
   * @param purpose - 期望的用途；不符即失敗
   * @returns 對應的 userId；token 無效 / 已用 / 過期 / 用途不符時為 null
   */
  claim(
    token: string,
    purpose: UserTokenPurpose,
  ): Promise<{ userId: string } | null>;

  /**
   * 作廢該使用者指定用途的所有未使用 token。
   *
   * 重發驗證信時用：兩枚同時有效的驗證連結沒有意義，而舊的那枚會在信箱裡留更久。
   * @param userId - 前台使用者 ID
   * @param purpose - 用途
   */
  invalidateAll(userId: string, purpose: UserTokenPurpose): Promise<void>;
}
