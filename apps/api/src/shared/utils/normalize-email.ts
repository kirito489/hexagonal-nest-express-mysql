/**
 * 信箱正規化：去頭尾空白 + 轉小寫。
 *
 * **限流計數的鍵與資料庫查詢一律用正規化後的值。** 少了它，
 * `Foo@x.com` 與 `foo@x.com` 在 Redis 是兩個獨立的計數器，
 * 而 MySQL 的 `utf8mb4_unicode_ci` 定序不分大小寫、兩者命中同一個帳號——
 * 攻擊者交替變換大小寫就能讓每一份計數都停在閾值之下，**鎖定形同不存在**。
 *
 * 只做這兩件事，**不做 Gmail 的 dot / plus 正規化**：那會讓
 * `a.b@gmail.com` 與 `ab@gmail.com` 變成同一個帳號，而那是 Gmail 的規則
 * 不是信箱的規則，套在其他網域上是錯的。
 *
 * @param email - 原始信箱字串
 * @returns 去頭尾空白並轉小寫後的信箱
 */
export const normalizeEmail = (email: string): string =>
  email.trim().toLowerCase();
