export class DefaultMemberNotDeletableException extends Error {
  constructor() {
    super('預設帳號不可刪除');
    this.name = 'DefaultMemberNotDeletableException';
  }
}
