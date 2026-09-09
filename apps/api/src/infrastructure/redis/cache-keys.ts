/**
 * 集中管理 Redis Key 格式。
 * 所有需要組合 key 的地方都引用此函式，確保格式一致。
 * 若格式需要調整（如加入 namespace），只需修改此處。
 */
export const buildMemberContextKey = (
  prefix: string,
  memberId: string,
): string => `${prefix}member:${memberId}`;

export const buildFailedLoginKey = (prefix: string, email: string): string =>
  `${prefix}failed-login:${email}`;

export const buildFailedIpKey = (prefix: string, ip: string): string =>
  `${prefix}failed-ip:${ip}`;

export const buildSessionActivityKey = (
  prefix: string,
  memberId: string,
): string => `${prefix}session:activity:${memberId}`;

export const buildPasswordResetKey = (prefix: string, token: string): string =>
  `${prefix}password-reset:${token}`;

/**
 * 前台寄信端點的信箱節流計數。
 *
 * key 用**正規化後的 email**：不正規化的話，交替大小寫就能讓每種寫法各自
 * 累積一份計數——與帳號鎖定曾經被繞過的是同一個形狀。
 * @param prefix - Redis key 前綴
 * @param email - **已正規化**的 email（呼叫端負責）
 * @param purpose - 區分不同端點的配額（register / resend / forgot）
 */
export const buildEmailThrottleKey = (
  prefix: string,
  email: string,
  purpose: string,
): string => `${prefix}email-throttle:${purpose}:${email}`;
