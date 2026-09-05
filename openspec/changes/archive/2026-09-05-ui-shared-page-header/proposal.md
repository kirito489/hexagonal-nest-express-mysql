## Why

四支列表頁（會員 / 角色 / IP 黑名單 / IP 白名單）的頁首結構**目前逐字相同**，各自手寫一份。現在沒有問題，而這正是要現在抽出來的理由——**下一頁就是分歧發生的地方**。

衍生專案的實例：同樣的結構寫到第八頁時，新加的那頁三處都偏了（多了 `p-6`、頁首用 `<div>` 而非 `<header>`、標題 `font-bold` 而非 `font-semibold`）。**typecheck / lint / 測試全綠**，是用眼睛看出來的。

模板即將加入第五頁（`api-account-lock-management`，C6a），而那正是衍生專案抄歪的那一頁。**在寫第五頁之前抽出共用元件，比之後回頭修四處加一處便宜。**

## What Changes

- 新增 `apps/web/src/components/PageHeader.tsx`：標題 + 副標 + 動作區
- 有無動作區的排版差異收進元件——原本靠各頁自己決定要不要加 flex，那正是下一個分歧的來源
- 四支列表頁改用它
- 新增 `PageHeader.test.tsx`（含「有動作區才套 `justify-between`」的排版斷言）

不做的事：**不加架構守則擋「頁首必須用 PageHeader」**。明細頁與登入頁本來就沒有這層結構，規則放寬到能容納它們之後就抓不到偏差了——**而會誤報的守則會被繞過**。用元件取代規則：沒有可以寫歪的地方，就不需要有人記得寫對。

## Capabilities

### Modified Capabilities

- `platform-frontend-conventions`：新增「列表頁的頁首一律用共用元件」的慣例，並寫明為何用元件而非守則。

## Impact

- **修改檔案**：`apps/web/src/routes/{members,roles,security/ip-blacklist,security/ip-whitelist}/page.tsx`
- **新增檔案**：`apps/web/src/components/PageHeader.tsx`、`PageHeader.test.tsx`
- **純前端重構，無行為變更**——四支頁面的 DOM 結構與 class 維持不變
- **無 migration、無 API 變更、無新增相依套件**
