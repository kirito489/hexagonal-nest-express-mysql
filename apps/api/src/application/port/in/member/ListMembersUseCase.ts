import { PaginationMeta } from '../../../../infrastructure/pagination';

export interface ListMembersQuery {
  page?: number;
  limit?: number;
  name?: string;
  email?: string;
}

export interface MemberListItem {
  id: string;
  email: string;
  member: string;
  roleId: string;
  roleName: string;
  status: boolean;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt: Date | null;
}

export interface ListMembersResult {
  list: MemberListItem[];
  meta: PaginationMeta;
}

export const LIST_MEMBERS_USE_CASE = 'LIST_MEMBERS_USE_CASE';

export interface ListMembersUseCase {
  execute(query: ListMembersQuery): Promise<ListMembersResult>;
}
