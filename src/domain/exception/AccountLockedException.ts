/**
 * 帳號已被鎖定時拋出
 */
export class AccountLockedException extends Error {
  constructor() {
    super('帳號已被鎖定，請聯繫管理員解鎖');
    this.name = 'AccountLockedException';
  }
}
