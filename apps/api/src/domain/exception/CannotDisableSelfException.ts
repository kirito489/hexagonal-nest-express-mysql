export class CannotDisableSelfException extends Error {
  constructor() {
    super('不可停用登入中的自己帳號');
    this.name = 'CannotDisableSelfException';
  }
}
