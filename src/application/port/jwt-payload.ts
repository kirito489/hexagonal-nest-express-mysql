/** JWT Token 的 payload（輕量，只存 memberId + 標準時間欄位） */
export interface JwtPayload {
  sub: string;
  type?: string;
  iat?: number;
  exp?: number;
}
