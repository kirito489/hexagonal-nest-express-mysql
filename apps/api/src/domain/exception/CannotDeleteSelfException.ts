export class CannotDeleteSelfException extends Error {
  constructor() {
    super('不可刪除登入中的自己帳號');
    this.name = 'CannotDeleteSelfException';
  }
}
