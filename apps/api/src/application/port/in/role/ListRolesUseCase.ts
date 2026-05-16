import { PaginationMeta } from '../../../../infrastructure/pagination';

export const LIST_ROLES_USE_CASE = 'LIST_ROLES_USE_CASE';

export interface ListRolesQuery {
  page?: number;
  limit?: number;
  name?: string;
}

export interface RoleListItem {
  id: string;
  name: string;
  status: boolean;
  isDefault: boolean;
  memberCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ListRolesResult {
  list: RoleListItem[];
  meta: PaginationMeta;
}

export interface ListRolesUseCase {
  execute(query: ListRolesQuery): Promise<ListRolesResult>;
}
