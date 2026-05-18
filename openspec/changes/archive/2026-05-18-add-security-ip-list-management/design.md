## Context

Security 模組剛重構完（refactor-security-module），現況：

- 後端 7 個 use case（list / add / remove × whitelist + blacklist + unlock）已落地
- 回應 shape 對齊 member / role（`{ list, meta }` / `201 + { id }` / `204`）
- 沒有 GET /:id、沒有 PATCH /:id
- DELETE path param 是 `:ip`（與 RESTful 慣例「by uuid」對不齊，且 IPv6 含冒號要 URL encode）
- 前端沒有對應頁面

本 change 補齊 by-id endpoint + 前端兩個列表頁面。

## Goals / Non-Goals

**Goals：**

- IP whitelist / blacklist 補上 GET /:id + PATCH /:id；DELETE path 改用 uuid 與其他模組一致
- 前端兩個列表頁面（whitelist / blacklist）走完整 CRUD UX（DataTable + Dialog + AlertDialog + URL state）
- 沿用既有 frontend pattern（不重造輪子）

**Non-Goals：**

- 不做帳號鎖定（留下一個 change）
- 不做 IP 黑名單「軟刪 + 還原」（維持硬刪）
- 不做 CIDR / IP range（sigle IP 為主）
- 不做 createdBy → 顯示「使用者名稱」對映（顯示 uuid 即可）
- 不改 SUPERADMIN role gate
- 不導入 IP 黑白名單「狀態」欄位（IP 直接存在 = 啟用，沒有「停用」概念）

## Decisions

### D1：DELETE path 改 `:ip` → `:id`

- **選擇**：改 path 用 uuid。
- **理由**：
  - IPv6 含冒號（`fe80::1`），URL encode 麻煩
  - 與其他模組 `/members/:id` / `/roles/:id` 一致
  - 前端列表 row 拿到 id 後 `DELETE /:id` 更直接
- **Trade-off**：要新增 `IpListNotFoundException`（之前用 ip 找不到就靜默通過，現在用 id 找不到要明確 404）。

### D2：硬刪維持

- IP 黑白名單沒有「歷史紀錄」需求，硬刪語意清楚；schema 不導入 deletedAt。
- 「誤刪」風險靠前端 AlertDialog 二次確認解決。

### D3：PATCH 只允許改 description / reason，不允許改 IP

- **理由**：IP 是 unique key，要改 IP 等於「刪舊建新」；直接讓使用者刪除重建語意更清楚，少一個邊界 case（改 IP 後黑白名單的「建立時間」是否要重置）。
- DTO schema：`{ description?: string }` / `{ reason?: string }`，省略 = 不變。

### D4：Port 簽章修改 — rename + 加新方法

- 既有 `removeFromWhitelist(ip)` / `removeFromBlacklist(ip)` rename 為 `removeWhitelist(id)` / `removeBlacklist(id)`（同時改參數 ip→id）。
- 新增 4 方法：`findWhitelistById(id)` / `findBlacklistById(id)` / `updateWhitelist(id, partial)` / `updateBlacklist(id, partial)`。
- **替代方案**：保留舊 remove method、新加 `removeWhitelistById`；deprecate 舊。
- **理由**：呼叫端只有 SecurityFacade，直接改 rename 沒額外成本；舊方法留下會造成「兩個能做同樣事的 method」混淆。

### D5：IpListNotFoundException 設計

- `class IpListNotFoundException extends Error`，沒有額外欄位（不需要區分 whitelist / blacklist，因為 endpoint 路徑已經有區分）。
- GlobalExceptionFilter map 加 `{ status: HttpStatus.NOT_FOUND, code: 'IP_LIST_NOT_FOUND' }`。
- 使用情境：
  - GET /:id 找不到 → 拋
  - PATCH /:id 找不到 → 拋
  - DELETE /:id 找不到 → **不拋**，靜默通過（與 member / role delete 行為一致；UI 不必處理 404）

### D6：前端兩個獨立 dialog vs 共用

- **選擇**：兩個獨立 dialog 元件（`IpWhitelistFormDialog` / `IpBlacklistFormDialog`）。
- **替代方案**：共用 `IpListFormDialog`，吃 mode 決定渲染 description / reason 欄位。
- **理由**：欄位差異雖只有 1 個，但 form schema、mutation hook、toast 文案都各自一份；共用元件內部要 prop drill + conditional render 反而難讀。兩個獨立檔每個 60 行內。

### D7：前端 URL state hook 使用通用化抽象

- 既有 `useMembersUrlState` / `useRolesUrlState` 都用一樣的 page/limit/search + edit/view/delete pattern。可以抽 `createListUrlState<TFields>` 工廠 hook，但本次先複製貼上兩份（whitelist / blacklist 各一），後續若 listing 頁繼續增多再抽。
- **理由**：抽工廠要設計 generic 介面、考慮 search 欄位名差異（whitelist 用 search 比對 ip / 但 blacklist 同；可能不同模組要搜不同欄位），複雜度太早。

### D8：Sidebar「安全」group 條目

```ts
{ label: 'IP 白名單', path: '/security/ip-whitelist', icon: ShieldCheck,
  group: '安全', requiredRoleCode: 'SUPERADMIN' },
{ label: 'IP 黑名單', path: '/security/ip-blacklist', icon: ShieldBan,
  group: '安全', requiredRoleCode: 'SUPERADMIN' },
```

- 圖示用 lucide `ShieldCheck` / `ShieldBan`，與 `Shield`（角色管理）有區分但風格一致。
- 不加帳號解鎖頁面（留下一個 change）。

### D9：security-ui 新 capability

- 為什麼不放 `frontend-admin`：`frontend-admin` 是「跨模組共通的前端 convention」（toast / sidebar / URL state pattern），不適合放具體模組的頁面 spec。
- `security-ui` 與 `role-management-ui` / `member-management-ui` 並列：個別模組的前端規格。

### D10：security e2e 既有 case 對齊

- 既有 DELETE 用 `:ip`，全部改 `:id` 並補 404 case。
- 既有 list 200 + add 201 + unlock case 不動。
- 加 GET / PATCH 各兩個 case（200 / 404）。

## Risks / Trade-offs

- **[Risk] Port rename 影響 SecurityFacade**：rename + 改參數型別兩個事一次做，但只 1 個呼叫端（facade），mechanical。
- **[Risk] 既有 e2e 改 DELETE path 時要同時改 mock**：mockPrisma 既有 `delete` 用 `where: { ipAddress: ip }`，改 `where: { id }` 後 mock 與實作對齊；e2e 既有 case 用 `.delete('/api/security/ip-whitelist/10.0.0.1')` 改成 `.delete('/api/security/ip-whitelist/<uuid>')`。
- **[Trade-off] 不抽前端 list state 工廠** → 第 3 / 第 4 個列表頁也照本宣科複製；等真的有 5 + 個列表再抽。
- **[Trade-off] Dialog 拆兩個** → 多一個檔，但 form schema / mutation 分清楚，每個元件單一職責。

## Migration Plan

階段化執行（後端 → swagger → 測試 → 前端）：

1. 後端 Port 簽章升級 + repo 實作 + 新增 4 use case + service + facade + module 註冊
2. Controller 加 4 endpoint + DELETE param 改名
3. Swagger 4 個新 yaml + 2 個 path 改名 + 重打 client
4. 新增 `IpListNotFoundException` + filter map + filter spec
5. e2e 對齊 + 補新 case
6. 前端 hooks + dialogs + pages（whitelist 一套 → blacklist 一套）
7. App.tsx + NAV_ITEMS
8. 驗證 + 手動測試

回退策略：每 phase 獨立 commit，回退單一 phase 不影響前面。

## Open Questions

- **createdBy 是否要 join 出 member name 顯示**：第一版只顯示 uuid（不 join），未來真的有「誰加的」需求再補（join LoadMember 或前端 lazy fetch）。
- **search 是否要支援 description / reason 模糊**：第一版 search 只比對 ipAddress（保持與後端既有行為一致）。
- **黑名單頁的「自動封鎖」filter**：第一版不做（沒分頁需求那麼急）。
