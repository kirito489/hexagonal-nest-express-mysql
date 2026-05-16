export class DefaultMemberNotEditableException extends Error {
  constructor() {
    super('預設帳號不可編輯');
    this.name = 'DefaultMemberNotEditableException';
  }
}
