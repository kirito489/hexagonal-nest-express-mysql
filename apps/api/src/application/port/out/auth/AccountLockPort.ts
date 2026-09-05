import type { AccountLockStatus } from '@app/domain/value-object/AccountLockPolicy';

export const ACCOUNT_LOCK_PORT = 'ACCOUNT_LOCK_PORT';

// 型別與判定規則同住在 domain 的 AccountLockPolicy；這裡轉出供既有呼叫端沿用原本的 import
export type { AccountLockStatus };

/** 鎖定列表的過濾條件；`all` 涵蓋兩者 */
export type AccountLockFilter = 'locked' | 'expired' | 'all';

export interface AccountLockListQuery {
  page: number;
  limit: number;
  /** email 模糊比對；呼叫端負責把空字串正規化為 undefined */
  search?: string;
  status: AccountLockFilter;
}

export interface LockedAccountItem {
  id: string;
  email: string;
  member: string;
  lockedAt: Date;
  /**
   * 鎖定失效的時間點。
   *
   * 一併回傳的理由是管理員要判斷的是「還要等多久」——只給 `lockedAt`
   * 等於要他自己知道並套用設定值。
   */
  unlocksAt: Date;
  failedLoginCount: number;
  status: Exclude<AccountLockFilter, 'all'>;
}

export interface AccountLockPort {
  /**
   * 記錄一次登入失敗，回傳目前累計失敗次數
   * @param email - 帳號 email
   * @returns 累計失敗次數
   */
  recordFailedLogin(email: string): Promise<number>;

  /**
   * 重置失敗計數（登入成功時呼叫）
   * @param email - 帳號 email
   */
  resetFailedLogin(email: string): Promise<void>;

  /**
   * 查詢帳號的鎖定狀態。
   *
   * 到期判定一律走 `AccountLockPolicy.resolveLockStatus`——那是唯一一份規則。
   *
   * **本方法不得有副作用。** 到期時該做的清理由呼叫端負責——
   * 一個查詢方法偷偷做寫入，是下一個人絕對不會預期的事。
   * @param email - 帳號 email
   * @returns 鎖定狀態；EXPIRED 代表呼叫端必須清除失敗計數
   */
  checkLock(email: string): Promise<AccountLockStatus>;

  /**
   * 鎖定帳號
   * @param email - 帳號 email
   */
  lockAccount(email: string): Promise<void>;

  /**
   * 解鎖帳號（重置鎖定狀態與失敗計數）
   * @param email - 帳號 email
   */
  unlockAccount(email: string): Promise<void>;

  /**
   * 分頁查詢有鎖定紀錄的帳號。
   *
   * **放在本 port 而非會員的持久層 port**：到期規則屬於鎖定，不屬於會員。
   * 放到別處就會出現第二個地方要知道「鎖多久算到期」。
   *
   * 實作 MUST NOT 逐列呼叫 {@link checkLock}（N+1）——改用
   * `AccountLockPolicy.lockedSinceCutoff` 把同一條規則換算成 SQL 的範圍條件。
   * @param query - 分頁、搜尋與狀態過濾
   * @returns 該頁的資料與符合條件的總筆數
   */
  listLocked(
    query: AccountLockListQuery,
  ): Promise<{ list: LockedAccountItem[]; total: number }>;
}
