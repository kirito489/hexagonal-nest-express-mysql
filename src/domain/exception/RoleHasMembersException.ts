export class RoleHasMembersException extends Error {
  constructor(count: number) {
    super(`該角色仍有 ${count} 個帳號使用，無法刪除`);
  }
}
