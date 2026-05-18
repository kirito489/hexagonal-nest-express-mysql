export class AccountNotLockedException extends Error {
  constructor() {
    super('帳號未處於鎖定狀態，無需解鎖');
    this.name = 'AccountNotLockedException';
  }
}
