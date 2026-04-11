export interface RoleOptionItem {
  id: string;
  name: string;
}

export const LIST_ROLE_OPTIONS_USE_CASE = 'LIST_ROLE_OPTIONS_USE_CASE';

export interface ListRoleOptionsUseCase {
  execute(): Promise<RoleOptionItem[]>;
}
