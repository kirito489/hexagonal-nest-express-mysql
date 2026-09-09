/** token 的所屬側別；決定該用哪一組 secret 驗簽，以及查哪一張使用者表 */
export type TokenSide = 'admin' | 'front';

/** JWT Token 的 payload（輕量，只存 id + token 類型 + 側別 + 標準時間欄位） */
export interface JwtPayload {
  sub: string;
  type: 'access' | 'refresh';
  /**
   * 所屬側別。
   *
   * ⚠️ **選填只是為了過渡**：加這個欄位時，已經簽出去的 admin token 裡沒有它，
   * 當成必填會讓所有人在部署當下被登出。後台解析時一律 `payload.side ?? 'admin'`。
   *
   * **前台側不套用這個寬鬆**——前台是全新的，不存在舊 token，
   * 所以前台守衛嚴格要求 `side === 'front'`。
   *
   * 真正把兩側分開的是**各自的 secret**（`FRONT_ACCESS_SECRET` 與 `ACCESS_SECRET`）：
   * 忘記比對 side 時，各自 secret 讓它變成簽章驗證失敗而非跨側存取。
   * 本欄位是第二道，用途是錯誤訊息說得出「這是前台的 token」。
   */
  side?: TokenSide;
  /** 簽發時的 token 版本；與 member.tokenVersion 不符即視為已撤銷（refresh 重用連坐） */
  tokenVersion?: number;
  iat?: number;
  exp?: number;
}
