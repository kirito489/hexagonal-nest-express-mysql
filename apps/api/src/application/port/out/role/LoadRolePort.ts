export const LOAD_ROLE_PORT = 'LOAD_ROLE_PORT';

export interface RoleOptionItem {
  id: string;
  name: string;
  /** true 表示系統角色（如管理者），前端 select 仍顯示但 disabled，不可被一般帳號指派 */
  isDefault: boolean;
}

export interface LoadRolePort {
  findDefaultRoleId(): Promise<string>;
  findRoleById(
    id: string,
  ): Promise<{ id: string; name: string; roleCode: string | null } | null>;
  listActiveRoles(): Promise<RoleOptionItem[]>;
}
