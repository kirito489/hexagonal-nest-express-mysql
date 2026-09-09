export const LOAD_USER_PORT = 'LOAD_USER_PORT';

/** 前台使用者的認證脈絡；刻意不含密碼 */
export interface UserContext {
  id: string;
  email: string;
  displayName: string;
  emailVerified: boolean;
  status: boolean;
  tokenVersion: number;
  lastLoginAt: Date | null;
}

/** 含密碼雜湊的查詢結果，只給登入流程用 */
export interface UserCredentials extends UserContext {
  password: string;
}

export interface LoadUserPort {
  /**
   * 依 email 查前台使用者（含密碼雜湊），供登入驗證使用。
   *
   * 一律排除軟刪除紀錄——軟刪後 email 不釋放，漏掉會查到已刪除的帳號。
   * @param email - 帳號 email（呼叫端負責正規化）
   * @returns 使用者資料或 null
   */
  loadCredentialsByEmail(email: string): Promise<UserCredentials | null>;

  /**
   * 依 id 查前台使用者，供守衛載入 UserContext。
   * @param id - 使用者 ID
   * @returns 使用者資料或 null
   */
  loadUserById(id: string): Promise<UserContext | null>;
}
