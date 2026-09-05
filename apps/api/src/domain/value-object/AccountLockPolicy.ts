/**
 * 帳號鎖定的三種狀態。
 *
 * **刻意不用布林。** 布林分不出「從未鎖定」與「鎖過但已到期」，
 * 而後者必須**一併清除失敗計數**——計數存在 Redis 且 TTL（30 分鐘）
 * 比鎖定時效長（預設 15 分鐘），不清的話使用者在到期後第一次打錯就會因為
 * 「計數還在閾值上」立刻重新被鎖，實際鎖定時間變成計數的 TTL 而非設定的時效，
 * 而設定的那個數字看起來完全正常。
 *
 * 用三態讓呼叫端**必須**面對 EXPIRED 這個情況，而不是靠記得。
 */
export type AccountLockStatus = 'NONE' | 'LOCKED' | 'EXPIRED';

const minutesToMs = (minutes: number): number => minutes * 60 * 1000;

/**
 * 鎖定的到期時間。
 *
 * 即時算出而非另存欄位——存到期時間的話，調整設定不會影響既有紀錄，
 * 會出現「設定顯示 15 分鐘、實際 60 分鐘」的不一致，直到那批紀錄自然消失。
 * @param lockedAt - 鎖定時間戳
 * @param durationMin - 鎖定時效（分鐘），來自 `APPLICATION_ACCOUNT_LOCK_DURATION_MIN`
 * @returns 到達此時間點後鎖定即失效
 */
export const lockExpiresAt = (lockedAt: Date, durationMin: number): Date =>
  new Date(lockedAt.getTime() + minutesToMs(durationMin));

/**
 * 「仍在鎖定中」的 `lockedAt` 分界點，供資料庫查詢用。
 *
 * 存在的理由是列表查詢**不能逐列呼叫 `checkLock`**（N+1）。
 * 把同一條規則換算成一個時間戳，就能交給 SQL 一次篩完。
 *
 * ⚠️ **判定是嚴格大於**：`lockedAt > cutoff` 才是鎖定中。
 * 這與 {@link resolveLockStatus} 的「剛好滿時效即 EXPIRED」是同一件事的兩種寫法，
 * 用 `>=` 會讓邊界上的那一列在列表與登入路徑得到相反的答案。
 * @param durationMin - 鎖定時效（分鐘）
 * @param now - 判定基準時間
 * @returns 分界時間戳
 */
export const lockedSinceCutoff = (durationMin: number, now: Date): Date =>
  new Date(now.getTime() - minutesToMs(durationMin));

/**
 * 由 `lockedAt` 判定鎖定狀態。
 *
 * **這是「還鎖著嗎」的唯一一份規則。** 登入路徑與管理端的鎖定列表都必須用它
 * ——兩份計算會漂移，而漂移的症狀是「列表說鎖著、但那個人登得進去」，
 * 看起來像資料不同步，實際是兩份規則。
 * @param lockedAt - 鎖定時間戳；`null` 代表從未鎖定
 * @param durationMin - 鎖定時效（分鐘）
 * @param now - 判定基準時間
 * @returns 三態鎖定狀態；EXPIRED 代表呼叫端必須清除失敗計數
 */
export const resolveLockStatus = (
  lockedAt: Date | null | undefined,
  durationMin: number,
  now: Date,
): AccountLockStatus => {
  if (!lockedAt) return 'NONE';
  return now.getTime() >= lockExpiresAt(lockedAt, durationMin).getTime()
    ? 'EXPIRED'
    : 'LOCKED';
};
