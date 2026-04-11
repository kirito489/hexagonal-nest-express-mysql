import { Member } from '../../../../domain/model/Member';

export const SAVE_MEMBER_PORT = 'SAVE_MEMBER_PORT';

export interface SaveMemberPort {
  saveMember(member: Member): Promise<void>;
  /**
   * 在同一 transaction 中更新 profile 和密碼，避免部分更新的不一致狀態
   * @param member - 更新後的 Member 實體
   * @param passwordHash - 已雜湊的新密碼
   */
  saveMemberWithPassword(member: Member, passwordHash: string): Promise<void>;
  deleteMember(id: string): Promise<void>;
  /** 更新最後登入時間（fire-and-forget） */
  updateLastLoginAt(id: string): Promise<void>;
}
