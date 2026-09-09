export const SAVE_USER_PORT = 'SAVE_USER_PORT';

export interface CreateUserCommand {
  email: string;
  /** 已雜湊的密碼 */
  password: string;
  displayName: string;
}

export interface SaveUserPort {
  /**
   * 建立一個**未驗證**的前台帳號（`emailVerifiedAt` 為 null）
   * @param command - 帳號資料；密碼須為已雜湊的值
   * @returns 新帳號的 ID
   */
  createUser(command: CreateUserCommand): Promise<string>;

  /**
   * 標記信箱已驗證。已驗證的帳號重複呼叫不視為錯誤
   * @param userId - 使用者 ID
   */
  markEmailVerified(userId: string): Promise<void>;

  /**
   * 更新密碼，**並在同一次寫入遞增 `tokenVersion`**。
   *
   * 兩者綁在一起而不是分兩支呼叫：分開的話會有人只呼叫其中一支，
   * 而漏掉遞增的後果是**受害者改了密碼，攻擊者既有的 session 仍然有效**。
   * @param userId - 使用者 ID
   * @param passwordHash - 已雜湊的新密碼
   */
  updatePassword(userId: string, passwordHash: string): Promise<void>;

  /**
   * 更新最後登入時間。
   *
   * 呼叫端不得因本方法失敗而中斷登入——它是稽核資訊，不是認證的一部分。
   * @param id - 使用者 ID
   */
  touchLastLogin(id: string): Promise<void>;

  /**
   * 遞增 token 版本，使該帳號所有既發 token 立即失效。
   * @param id - 使用者 ID
   * @returns 遞增後的版本號
   */
  bumpTokenVersion(id: string): Promise<number>;
}
