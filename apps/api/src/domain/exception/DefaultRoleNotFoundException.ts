export class DefaultRoleNotFoundException extends Error {
  constructor() {
    super('系統未設定預設角色，請聯繫管理員');
    this.name = 'DefaultRoleNotFoundException';
  }
}
