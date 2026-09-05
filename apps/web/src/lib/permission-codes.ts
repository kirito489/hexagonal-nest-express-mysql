/**
 * 與後端權限目錄（`apps/api/src/shared/constants/permissions.ts` 的
 * `PERMISSION_CATALOG`）對齊的權限碼。
 *
 * 前端引用常數而非 magic string：打錯一個字的後果是**靜默的**——
 * `BACKEND:ACCOUNT:VEIW` 會讓那個 sidebar 項目對所有人消失（含 SUPERADMIN），
 * 而 typecheck、lint、測試全綠，回報進來只會是「選單不見了」。
 *
 * **型別是第一道防線，守則是第二道**：`permission-codes-sync.spec.ts`
 * 比對本檔與後端目錄，擋住「常數本身寫錯」與「後端改名或移除」。
 *
 * ⚠️ **必須維持字面物件的寫法**（`KEY: '值'`）。守則用正規式讀這些值——
 * 跨 workspace 的 import 在 api 的 jest 設定下解不到 `apps/web` 的路徑別名。
 * 改成用函式或展開產生的話，守則的「掃描範圍有效」會先紅。
 *
 * 只收 `apps/web` 實際用得到的碼，不整份複製後端目錄——
 * `BACKEND:ATTACHMENT:EDIT` 前端沒有對應頁面，放這裡只會讓人以為有。
 */
export const PERMISSION_CODE = {
  ACCOUNT_VIEW: 'BACKEND:ACCOUNT:VIEW',
  ACCOUNT_EDIT: 'BACKEND:ACCOUNT:EDIT',
  ROLE_VIEW: 'BACKEND:ROLE:VIEW',
  ROLE_EDIT: 'BACKEND:ROLE:EDIT',
} as const;

export type PermissionCode =
  (typeof PERMISSION_CODE)[keyof typeof PERMISSION_CODE];
