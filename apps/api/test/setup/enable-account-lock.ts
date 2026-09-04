/**
 * 開啟帳號鎖定功能，供需要驗證鎖定行為的 e2e 使用。
 *
 * **必須是該 spec 的第一個 import。** `getEnv()` 的結果會被快取，而 `AppModule`
 * 的 `@Module` 裝飾器在**被 import 的當下**就求值——寫在 spec 檔案本體的
 * `process.env.X = ...` 會排在所有 import 之後（import 會被提升），
 * 那時 env 早就以「鎖定關閉」快取住了，於是測試看起來像是「鎖定壞掉」，
 * 而症狀（登入回 200）完全指不到真正的原因。
 *
 * 不設在 `setup-env.e2e.ts`：那會讓**所有** e2e 都開著鎖定，
 * 而多數 spec 會做數次失敗登入，超過閾值後會以 423 的形式間歇性失敗。
 */
process.env.APPLICATION_ACCOUNT_LOCK_ENABLED = 'true';
process.env.APPLICATION_ACCOUNT_LOCK_THRESHOLD = '3';
process.env.APPLICATION_ACCOUNT_LOCK_DURATION_MIN = '15';

/** 與上方設定一致，供 spec 引用而不必重寫字面值 */
export const ACCOUNT_LOCK_THRESHOLD = 3;
export const ACCOUNT_LOCK_DURATION_MIN = 15;
