export interface UpdateMemberCommand {
  id: string;
  /** 操作者 ID（當前登入者），用於自停檢查 */
  actorId: string;
  email: string;
  member: string;
  /** 選填：提供時改密碼，空字串表示不改 */
  password?: string;
  roleId: string;
  status: boolean;
}

export const UPDATE_MEMBER_USE_CASE = 'UPDATE_MEMBER_USE_CASE';

export interface UpdateMemberUseCase {
  execute(command: UpdateMemberCommand): Promise<void>;
}
