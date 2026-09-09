/**
 * 前台信件的主旨與內容。
 *
 * 集中在這裡而不是散在各 service：這些是**對外的用詞**，
 * 與 `response-messages.ts` 的錯誤訊息同一類。差別只在它們不經
 * `GlobalExceptionFilter`，所以不受那條守則涵蓋——但一眼審視全部對外用詞的
 * 需求是一樣的。
 */
export const FrontMailTexts = {
  VERIFY_SUBJECT: '請驗證您的電子信箱',
  RESET_SUBJECT: '密碼重設通知',
  DUPLICATE_SUBJECT: '您的信箱已有帳號',

  /** 寄信失敗的 log 訊息（內部用，不會送到客戶端） */
  SEND_FAILED: '前台信件寄送失敗',
  /** 查無帳號時的 debug log；**刻意不含 email 本身** */
  FORGOT_SKIPPED: '前台忘記密碼：查無此帳號，靜默略過',

  verifyBody: (url: string, expiresInMinutes: number): string => `
    <p>您好，</p>
    <p>感謝您註冊。請點擊以下連結完成信箱驗證：</p>
    <p><a href="${url}">${url}</a></p>
    <p>此連結將在 ${expiresInMinutes} 分鐘後失效。</p>
    <p>如果您沒有註冊過本服務，請忽略此信件。</p>
  `,

  resetBody: (url: string, expiresInMinutes: number): string => `
    <p>您好，</p>
    <p>我們收到您的密碼重設請求。請點擊以下連結重設密碼：</p>
    <p><a href="${url}">${url}</a></p>
    <p>此連結將在 ${expiresInMinutes} 分鐘後失效。</p>
    <p>如果您沒有提出此請求，請忽略此信件。</p>
  `,

  /**
   * 重複註冊時寄給**既有擁有者**的通知。
   *
   * 這封信是「註冊端點不回報信箱已存在」那個決定的另一半：
   * 回應對攻擊者一視同仁，而真正的擁有者從信裡知道有人試圖用他的信箱註冊。
   * 內容刻意不提「有人嘗試註冊」的細節（如來源 IP），避免變成騷擾管道。
   */
  duplicateBody: (loginUrl: string): string => `
    <p>您好，</p>
    <p>我們收到一則使用此信箱的註冊請求，但您的信箱已經有帳號了。</p>
    <p>如果這是您本人，請直接<a href="${loginUrl}">登入</a>；忘記密碼可使用「忘記密碼」功能。</p>
    <p>如果這不是您，請忽略此信件——您的帳號沒有任何變動。</p>
  `,
} as const;
