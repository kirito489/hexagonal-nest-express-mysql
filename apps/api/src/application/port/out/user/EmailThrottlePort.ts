export const EMAIL_THROTTLE_PORT = 'EMAIL_THROTTLE_PORT';

/** 用哪一個配額；不同端點各自計數，避免忘記密碼把註冊的額度吃掉 */
export type EmailThrottleScope = 'register' | 'resend' | 'forgot';

export interface EmailThrottlePort {
  /**
   * 對某個信箱計次並判斷是否已超額。
   *
   * **與 IP 節流是兩層，缺一不可**：IP 節流擋「同一個 IP 對很多信箱各發一封」，
   * 本層擋「對同一個信箱轟炸」——後者換 IP 就能繞過 IP 節流，
   * 而受害者是那個信箱的擁有者，他甚至可能沒有註冊過。
   *
   * ⚠️ **Redis 不可用時必須 fail-open**（回 false）。這與登入節流的 fail-closed
   * 相反，理由是後果不對稱：登入節流失效等於暴力破解防護消失；
   * 寄信節流失效只是可能多寄幾封信，而 fail-closed 會讓註冊完全不可用。
   * @param email - 帳號 email（實作負責正規化）
   * @param scope - 配額範圍
   * @returns 是否已超過上限（true = 應拒絕）
   */
  isExceeded(email: string, scope: EmailThrottleScope): Promise<boolean>;
}
