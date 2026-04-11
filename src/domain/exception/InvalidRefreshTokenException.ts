/**
 * 無效的 Refresh Token
 *
 * 過期、簽名不符、type 不符、在黑名單一律以此例外表達。
 */
export class InvalidRefreshTokenException extends Error {
  constructor() {
    super('無效的 Refresh Token，請重新登入');
    this.name = 'InvalidRefreshTokenException';
  }
}
