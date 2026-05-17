export interface RoleOptionItem {
  id: string;
  name: string;
  /** true 表示系統角色（如管理者），前端 select 顯示但 disabled */
  isDefault: boolean;
}

export const LIST_ROLE_OPTIONS_USE_CASE = 'LIST_ROLE_OPTIONS_USE_CASE';

export interface ListRoleOptionsUseCase {
  execute(): Promise<RoleOptionItem[]>;
}
