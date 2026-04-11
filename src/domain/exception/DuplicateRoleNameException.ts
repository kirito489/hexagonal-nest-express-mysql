export class DuplicateRoleNameException extends Error {
  constructor(name: string) {
    super(`角色名稱已存在：${name}`);
  }
}
