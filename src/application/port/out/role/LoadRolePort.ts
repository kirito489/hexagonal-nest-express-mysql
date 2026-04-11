export const LOAD_ROLE_PORT = 'LOAD_ROLE_PORT';

export interface RoleOptionItem {
  id: string;
  name: string;
}

export interface LoadRolePort {
  findDefaultRoleId(): Promise<string>;
  findRoleById(
    id: string,
  ): Promise<{ id: string; name: string; roleCode: string | null } | null>;
  listActiveRoles(): Promise<RoleOptionItem[]>;
}
