export const TOKEN_BLACKLIST_PORT = 'TOKEN_BLACKLIST_PORT';

/**
 * token 進黑名單的原因。
 *
 * `rotated` 與 `logout` 必須分開：refresh 輪替後的舊 token 再次被使用是**遭竊訊號**，
 * 應撤銷該使用者所有 session；使用者登出的 token 再次被使用只是併發請求撞上登出
 * （前端共用 refreshPromise 時很常見），只該拒絕本次。
 * 兩者若不分，正常登出會把使用者在其他裝置上的 session 一起踢掉。
 */
export type BlacklistReason = 'rotated' | 'logout';

export interface TokenBlacklistPort {
  /** 將 token 加入黑名單，TTL 配合 JWT 剩餘效期；reason 決定重用時的處置 */
  addToBlacklist(
    token: string,
    ttlSeconds: number,
    reason: BlacklistReason,
  ): Promise<void>;
  /** 檢查 token 是否在黑名單中（Redis 不可用時採 fail-closed，拋出 503） */
  isBlacklisted(token: string): Promise<boolean>;
  /**
   * 取出 token 進黑名單的原因。
   * 不在黑名單時為 null；舊格式的紀錄會回傳非 BlacklistReason 的值，
   * 呼叫端一律以「不是 rotated」處理，寧可少撤銷也不要誤踢。
   */
  getBlacklistReason(token: string): Promise<BlacklistReason | null>;
}
