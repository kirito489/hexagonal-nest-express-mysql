/** JWT Token 的 payload（輕量，只存 memberId + token 類型 + 標準時間欄位） */
export interface JwtPayload {
  sub: string;
  type: 'access' | 'refresh';
  iat?: number;
  exp?: number;
}
