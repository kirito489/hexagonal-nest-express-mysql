/** 前台註冊 / 信箱驗證 / 密碼重設的五個 use case port 與對應 token */

export const FRONT_REGISTER_USE_CASE = 'FRONT_REGISTER_USE_CASE';
export interface FrontRegisterCommand {
  email: string;
  password: string;
  displayName: string;
}
export interface FrontRegisterUseCase {
  /**
   * 建立未驗證的帳號並寄出驗證信。
   *
   * **email 已存在時不建帳號、不回報，改寄通知信給既有擁有者**——
   * 回 409「此信箱已註冊」是帳號列舉。
   */
  execute(command: FrontRegisterCommand): Promise<void>;
}

/** 驗證結果；決定 302 導回前台時帶哪一種 status */
export type VerifyEmailStatus = 'success' | 'invalid' | 'expired';

export const FRONT_VERIFY_EMAIL_USE_CASE = 'FRONT_VERIFY_EMAIL_USE_CASE';
export interface FrontVerifyEmailUseCase {
  /**
   * 消耗驗證 token 並寫入 `emailVerifiedAt`。
   *
   * **不拋例外**：呼叫端要把結果轉成 302 導向，而使用者點的是信裡的連結，
   * 一個瀏覽器錯誤頁對他沒有意義。
   * @param token - 明文 token
   * @returns 導向時要帶的 status
   */
  execute(token: string): Promise<VerifyEmailStatus>;
}

export const FRONT_RESEND_VERIFICATION_USE_CASE =
  'FRONT_RESEND_VERIFICATION_USE_CASE';
export interface FrontResendVerificationUseCase {
  /** 帳號不存在或已驗證時靜默略過（防帳號列舉） */
  execute(email: string): Promise<void>;
}

export const FRONT_FORGOT_PASSWORD_USE_CASE = 'FRONT_FORGOT_PASSWORD_USE_CASE';
export interface FrontForgotPasswordUseCase {
  /** 帳號不存在時靜默略過，且不記錄該 email（log 會累積成列舉資料） */
  execute(email: string): Promise<void>;
}

export const FRONT_RESET_PASSWORD_USE_CASE = 'FRONT_RESET_PASSWORD_USE_CASE';
export interface FrontResetPasswordCommand {
  token: string;
  newPassword: string;
}
export interface FrontResetPasswordUseCase {
  /** @throws BadRequestException - token 無效 / 已用 / 過期 / 用途不符，或密碼不符政策 */
  execute(command: FrontResetPasswordCommand): Promise<void>;
}
