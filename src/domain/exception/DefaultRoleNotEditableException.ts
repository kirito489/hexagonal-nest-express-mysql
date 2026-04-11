export class DefaultRoleNotEditableException extends Error {
  constructor() {
    super('預設角色不可編輯');
  }
}
