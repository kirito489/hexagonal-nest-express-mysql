export interface MemberContextData {
  id: string;
  email: string;
  roleName: string;
  permissions: string[];
  /** 帳號啟用狀態（false = 停用，Guard 拒絕請求） */
  status: boolean;
  /** 最後一次更換密碼的時間（用於密碼定期更換檢查） */
  lastPasswordChange?: Date | null;
}

export const LOAD_MEMBER_CONTEXT_PORT = 'LOAD_MEMBER_CONTEXT_PORT';

export interface LoadMemberContextPort {
  loadMemberContext(memberId: string): Promise<MemberContextData | null>;
}
