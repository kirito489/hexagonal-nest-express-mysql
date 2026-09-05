import type { ResponseCode } from './response-codes';

/**
 * 對外錯誤訊息（單一真相）。
 *
 * 所有 domain exception 的訊息都取自此處，exception 本身不得內嵌文案字面值 ——
 * 集中後才能一眼審視全部對外用詞，未來要換語系也只需替換本表。
 *
 * 值為字串者為「靜態訊息」，`DomainException` 只需 `(code, kind)` 即可自動取用；
 * 值為函式者為「動態訊息」，型別會強制建立 exception 時傳入算好的訊息。
 *
 * `satisfies Record<ResponseCode, ...>` 確保每個已註冊的錯誤碼都有對應訊息 ——
 * 少一條就是 typecheck 失敗，不需要另外寫測試檢查完整性。
 */
export const ResponseMessages = {
  // 帳號
  MEMBER_NOT_FOUND: (id?: string) => (id ? `找不到帳號: ${id}` : '找不到帳號'),
  EMAIL_ALREADY_EXISTS: 'Email 已被使用',
  EMAIL_NOT_FOUND: '找不到該 email 對應的帳號',
  ACCOUNT_DISABLED: '帳號已停用',
  ACCOUNT_LOCKED: '帳號已被鎖定，請稍後再試或聯繫管理員解鎖',
  ACCOUNT_NOT_LOCKED: '帳號未處於鎖定狀態，無需解鎖',
  CANNOT_DELETE_SELF: '不可刪除登入中的自己帳號',
  CANNOT_DISABLE_SELF: '不可停用登入中的自己帳號',
  DEFAULT_MEMBER_NOT_DELETABLE: '預設帳號不可刪除',
  DEFAULT_MEMBER_NOT_EDITABLE: '預設帳號不可編輯',

  // 帳號輸入驗證（domain value object / model 拋出，對應 400）
  // 用對外可讀的說法，不使用 MemberId 這類內部型別名稱
  INVALID_MEMBER_ID: '無效的帳號 ID 格式',
  INVALID_EMAIL_FORMAT: 'Email 格式不正確',
  INVALID_MEMBER_NAME: '名稱不可為空',

  // 認證
  PASSWORD_CHANGE_REQUIRED: '密碼已過期，請更換密碼後再繼續操作',
  INVALID_REFRESH_TOKEN: '無效的 Refresh Token，請重新登入',

  // 角色與權限
  ROLE_NOT_FOUND: '角色不存在',
  DUPLICATE_ROLE_NAME: (name: string) => `角色名稱已存在：${name}`,
  DEFAULT_ROLE_NOT_DELETABLE: '預設角色不可刪除',
  DEFAULT_ROLE_NOT_EDITABLE: '預設角色不可編輯',
  DEFAULT_ROLE_NOT_FOUND: '系統未設定預設角色，請聯繫管理員',
  ROLE_HAS_MEMBERS: (count: number) =>
    `該角色仍有 ${count} 個帳號使用，無法刪除`,
  INVALID_PERMISSION_CODE: (codes: string[]) =>
    `Permission code 不存在：${codes.join(', ')}`,
  INVALID_PERMISSION_COMBINATION: (domain: string) =>
    `設定 ${domain}:EDIT 時必須同時設定 ${domain}:VIEW`,

  // 安全
  IP_LIST_NOT_FOUND: '找不到該 IP 名單紀錄',

  // 附件
  // 上傳失敗的原因由呼叫端決定（副檔名、大小上限等），故為恆等函式；
  // 若日後要讓前端針對不同原因分支，應拆成多個錯誤碼而非放寬此處
  // 措辭住在 UploadRejectReasons（見本檔下方）——呼叫端傳的是那裡的值而非字面值。
  // 這裡維持接受字串是為了讓 exception 的介面不變；由 no-inline-message 守則
  // 盯著呼叫端不得再寫字面值
  INVALID_UPLOAD: (reason: string) => reason,
  ATTACHMENT_NOT_FOUND: '找不到附件',
  ATTACHMENT_FORBIDDEN: '沒有權限刪除此附件',

  // 系統：刻意維持通用英文訊息，不洩漏內部實作細節
  INTERNAL_SERVER_ERROR: 'Internal server error',
} as const satisfies Record<
  ResponseCode,
  string | ((...args: never[]) => string)
>;

/**
 * 訊息不需參數的錯誤碼。
 *
 * 由訊息表推導而非手工維護第二份清單 —— 把某條訊息從字串改成函式時，
 * 對應的 exception 會立刻因為「少傳 message」而編譯失敗。
 */
export type StaticResponseCode = {
  [K in ResponseCode]: (typeof ResponseMessages)[K] extends string ? K : never;
}[ResponseCode];

/**
 * 框架層 `HttpException` 的對外訊息（單一真相的第二張表）。
 *
 * **為什麼不併進 `ResponseMessages`**：那張表是
 * `satisfies Record<ResponseCode, …>`，完整性由型別保證（少一條當場 `TS1360`），
 * 而 `ResponseCodes` 刻意不含 `UNAUTHORIZED` / `FORBIDDEN` 這類框架碼
 * ——它們由 class 名推導（見 `platform-api-error-response` 的「錯誤碼兩個來源」）。
 * 混入非 `ResponseCode` 的鍵會直接破壞那個保證，而那正是它最有價值的地方。
 *
 * **為什麼放同一個檔案**：Hard Rule 的目的是「集中後才能一眼審視全部對外用詞」。
 * 分成兩個檔案就要開兩個檔案才看得完，那正是它想避免的。
 *
 * ⚠️ **本表沒有型別層的完整性保證，這是事實而非疏漏**：框架層的錯誤碼由 class 名
 * 推導，同一個 `UNAUTHORIZED` 對應六種不同的失敗原因，不存在「每個碼一條訊息」
 * 的對應關係。本表的價值只在集中，不在完整性。
 *
 * **新增訊息時該進哪張表**：拋 `DomainException` 子類 → `ResponseMessages`；
 * 拋 NestJS 的 `HttpException`（`UnauthorizedException` 等）→ 本表。
 *
 * 這些訊息**會原樣送到客戶端**——`GlobalExceptionFilter` 對 `HttpException`
 * 的處理是 `message: exception.message`。
 */
export const HttpMessages = {
  // ─── 認證（JwtAuthGuard / SessionIdleGuard）───
  MISSING_CREDENTIALS: '缺少授權憑證，請先登入',
  TOKEN_REVOKED: 'Token 已登出或失效',
  TOKEN_VERIFY_FAILED: 'Token 驗證失敗',
  TOKEN_WRONG_TYPE: 'Token 類型不正確',
  TOKEN_MEMBER_NOT_FOUND: '會員不存在',
  TOKEN_SUPERSEDED: 'Token 已失效，請重新登入',
  SESSION_IDLE_EXPIRED: 'Session 已因閒置過久而過期，請重新登入',

  // ─── 授權（RolesGuard / PermissionsGuard）───
  // 兩支 guard 共用同一句：對客戶端而言「角色不足」與「權限不足」都是權限不足，
  // 區分它們等於告訴呼叫端授權模型的細節
  INSUFFICIENT_PERMISSION: '權限不足',

  // ─── IP 存取控制 ───
  IP_UNDETERMINED: '無法判定來源 IP，請求遭拒',
  IP_BLOCKED: 'IP 位址已被封鎖',
  IP_NOT_WHITELISTED: 'IP 位址不在白名單中',

  // ─── 登入（LoginService）───
  RECAPTCHA_REQUIRED: '請完成 reCAPTCHA 驗證',
  RECAPTCHA_FAILED: 'reCAPTCHA 驗證失敗',
  // 「帳號不存在」與「密碼錯誤」共用同一句是刻意的防帳號列舉措施，
  // 兩處呼叫端必須引用同一個鍵——分成兩條就有人會不小心改掉其中一句
  INVALID_CREDENTIALS: '帳號或密碼錯誤',

  // ─── 密碼重設 ───
  RESET_TOKEN_INVALID: '重設密碼連結無效或已過期',

  // ─── 服務可用性（Redis fail-closed）───
  // 刻意不提 Redis：對外訊息不洩漏內部相依
  AUTH_SERVICE_UNAVAILABLE: '認證服務暫時不可用，請稍後再試',
} as const;

/**
 * 上傳被拒的原因文案。
 *
 * `InvalidUploadException` 的訊息原本是 `INVALID_UPLOAD: (reason) => reason`
 * ——**恆等函式**。那讓 exception 表面上合規（訊息「取自訊息表」），
 * 實際上五個呼叫端各自寫自己的文案，而表裡什麼都沒記錄。
 *
 * 帶變數的三種用模板函式：**措辭在表裡，只有資料來自呼叫端**。
 */
export const UploadRejectReasons = {
  NO_FILE: '未提供檔案（欄位名須為 file）',
  CONTENT_MISMATCH: '檔案內容與宣告的類型不符',
  FOLDER_NOT_ALLOWED: (folder: string) => `不允許的上傳資料夾：${folder}`,
  MIME_NOT_ALLOWED: (mimeType: string) => `不允許的檔案類型：${mimeType}`,
  TOO_LARGE: (maxBytes: number) => `檔案過大（上限 ${maxBytes} bytes）`,
} as const;
