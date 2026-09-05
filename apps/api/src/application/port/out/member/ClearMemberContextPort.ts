export const CLEAR_MEMBER_CONTEXT_PORT = 'CLEAR_MEMBER_CONTEXT_PORT';

export interface ClearMemberContextPort {
  /** 登出後清除該會員的 MemberContext 快取，強制下次請求重新查詢 */
  clearMemberContext(memberId: string): Promise<void>;

  /**
   * 批次清除多個會員的 MemberContext 快取。
   *
   * 用於「角色的授權變了」這種一次影響多人的情況——`MemberContext` 帶
   * `roleName` / `roleCode` / `permissions` 三者且有快取效期
   * （`PERMISSION_CACHE_TTL`，預設 300 秒），不清的話**撤銷一個權限最多要等一個
   * 效期才生效**，而資料庫與畫面都顯示已經撤銷了。
   *
   * **失敗不得被吞掉。** 語意是「權限改了但沒有生效」——回報成功會讓呼叫端
   * 處於一個他不知道的狀態。這與 `updateLastLoginAt` 那種 fire-and-forget 不同：
   * 後者失敗只損失一個時間戳。
   *
   * @param memberIds - 要清除的會員 ID；空陣列為合法輸入（直接返回）
   */
  clearMany(memberIds: string[]): Promise<void>;
}
