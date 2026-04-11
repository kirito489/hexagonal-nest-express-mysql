/**
 * 密碼已過期需要更換時拋出。
 * GlobalExceptionFilter 會將此 exception 映射為 403 + PASSWORD_CHANGE_REQUIRED code。
 */
export class PasswordChangeRequiredException extends Error {
  constructor() {
    super('密碼已過期，請更換密碼後再繼續操作');
    this.name = 'PasswordChangeRequiredException';
  }
}
