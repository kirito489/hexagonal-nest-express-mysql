export class RoleNotFoundException extends Error {
  constructor() {
    super('角色不存在');
    this.name = 'RoleNotFoundException';
  }
}
