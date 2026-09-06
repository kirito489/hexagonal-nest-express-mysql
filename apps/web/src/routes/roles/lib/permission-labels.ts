/**
 * 權限碼片段（platform / module）的中文對照。
 *
 * 權限樹的群組標題是從 `BACKEND:ACCOUNT:VIEW` 拆出來的碼片段，直接顯示會是英文。
 * 對照表放前端而不是讓 API 多回欄位，是為了不動回應契約——那個標籤只有這一個畫面在用，
 * 為它改 swagger + 重跑 api-client 不划算，而 `platform` / `module` 是**碼的結構**、
 * 中文名是**顯示層的事**。
 *
 * 代價是同一份分類法存在前後兩處，由 `permission-codes-sync.spec.ts` 的
 * 「每個 platform 與 module 都要有中文對照」（api 側守則）**雙向**比對
 * `PERMISSION_CATALOG` 擋住漂移：缺對照要紅，多餘的死條目也要紅。
 *
 * ⚠️ **必須維持字面物件的寫法**——守則以正規式讀這些鍵。
 * 改寫成動態組裝（map / 迴圈 / 展開）會讓守則讀不到，
 * 「掃描範圍有效」那條會先紅。
 *
 * 用語一律與側邊欄（`_nav-items.ts`）一致——指派權限的人與使用後台的人
 * 是同一批，兩處不同的用語等於要他們自己做一次翻譯。
 */
export const PLATFORM_LABELS: Readonly<Record<string, string>> = {
  BACKEND: '後台',
};

export const MODULE_LABELS: Readonly<Record<string, string>> = {
  ACCOUNT: '帳號管理',
  ROLE: '角色管理',
  // 目前沒有任何後台頁面在用 BACKEND:ATTACHMENT:EDIT（端點在 AttachmentController，
  // apps/web 還沒有附件頁），所以勾了看不出差別。**不從權限樹移除**：它確實在保護
  // 那些端點。這裡也不寫「（尚無對應頁面）」之類的 UI 文字——那會隨功能上線而過期，
  // 卻沒有任何東西會提醒你回來改它
  ATTACHMENT: '附件',
};

/**
 * 取 platform 的中文名，查不到時退回原始碼片段
 * @param platform - 權限碼的第一段，如 `BACKEND`
 * @returns 中文名；無對照時為原字串
 */
export const platformLabel = (platform: string): string =>
  PLATFORM_LABELS[platform] ?? platform;

/**
 * 取 module 的中文名，查不到時退回原始碼片段。
 *
 * 退回英文而不是空字串：標題空白的卡片看起來像壞掉，
 * 英文標題至少還讀得出是哪一組。
 * @param module - 權限碼的第二段，如 `ACCOUNT`
 * @returns 中文名；無對照時為原字串
 */
export const moduleLabel = (module: string): string =>
  MODULE_LABELS[module] ?? module;
