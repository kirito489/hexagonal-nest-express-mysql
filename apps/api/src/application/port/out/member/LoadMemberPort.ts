import { Member } from '@app/domain/model/Member';

export const LOAD_MEMBER_PORT = 'LOAD_MEMBER_PORT';

export interface MemberRecordDto {
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

export interface ListMembersParams {
  page: number;
  limit: number;
  name?: string;
  email?: string;
  /** 啟用狀態過濾；undefined 表示不過濾 */
  status?: boolean;
}

export interface ListMembersPage {
  data: MemberRecordDto[];
  total: number;
}

export interface LoadMemberPort {
  loadMemberByEmail(email: string): Promise<Member | null>;
  /** 顯示用（含 roleName，不含 password） */
  loadMemberById(id: string): Promise<MemberRecordDto | null>;
  /** 更新 domain 操作用（含 password hash） */
  loadMemberDomainById(id: string): Promise<Member | null>;
  listMembers(params: ListMembersParams): Promise<ListMembersPage>;
  existsByEmail(email: string, excludeId?: string): Promise<boolean>;
  /**
   * 取得指定角色底下所有未軟刪除成員的 ID。
   *
   * 供「角色授權變了要清這些人的 MemberContext 快取」使用。
   * 只回 ID 不回整筆：呼叫端唯一需要的就是快取鍵，
   * 多帶欄位會讓一個純粹的查詢看起來像可以拿來做別的事。
   * @param roleId - 角色 ID
   * @returns 成員 ID 陣列；該角色沒有成員時為空陣列
   */
  findMemberIdsByRoleId(roleId: string): Promise<string[]>;
}
