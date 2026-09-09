import { createHash, randomBytes } from 'crypto';

/**
 * 一次性 token 的產生與雜湊。
 *
 * **後台的密碼重設與前台的驗證信 / 密碼重設共用這一份。**
 * 這是安全關鍵的程式碼——複製兩份的後果是其中一份修了 bug
 * （例如換更長的隨機源、改雜湊演算法）另一份不會跟上，
 * 而不會有任何東西提醒你。
 *
 * **只共用純函式，不共用 Prisma 查詢**：兩邊操作不同的 model，
 * 硬要共用會生出一個帶 model 名稱參數的抽象，比重複更糟。
 */

/**
 * 產生高熵的一次性 token（明文，只回傳給呼叫端寄信用）
 * @returns 64 字元的 hex 字串
 */
export const generateOneTimeToken = (): string =>
  randomBytes(32).toString('hex');

/**
 * 計算 token 的儲存用雜湊。
 *
 * token 本身是高熵隨機值，單向 sha256 即足以防 DB 外洩反推——**不需要 bcrypt**：
 * bcrypt 的慢是為了擋低熵密碼的暴力猜測，對 256 bit 的隨機值沒有意義，
 * 只會讓每次驗證多花數十毫秒。
 * @param token - 明文 token
 * @returns sha256 的 hex 摘要
 */
export const hashOneTimeToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');
