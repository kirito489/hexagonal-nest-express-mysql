export class DefaultRoleNotDeletableException extends Error {
  constructor() {
    super('預設角色不可刪除');
  }
}
