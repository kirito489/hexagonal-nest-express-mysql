export const SAVE_USER_PORT = 'SAVE_USER_PORT';

export interface SaveUserPort {
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
