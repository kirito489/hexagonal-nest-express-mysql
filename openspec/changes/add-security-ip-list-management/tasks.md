## 1. 前置作業

- [x] 1.1 working tree 乾淨（只剩本 change 的 openspec 檔案 untracked）
- [x] 1.2 確認 baseline e2e 全綠（4 suites / 96 tests）

## 2. 後端 / Domain exception + Filter

- [x] 2.1 新增 `apps/api/src/domain/exception/IpListNotFoundException.ts`
- [x] 2.2 `GlobalExceptionFilter.ts`：加 `IpListNotFoundException → 404 / IP_LIST_NOT_FOUND` 進 map
- [x] 2.3 補 `GlobalExceptionFilter.spec.ts` 一個 case，9/9 passed

## 3. 後端 / Port 簽章與 Repo

- [x] 3.1 `IpListPort.ts`：rename remove method (ip→id) + 加 findById / update 共 4 個新方法
- [x] 3.2 `PrismaIpListRepository.ts`：對應實作；update P2025 → `IpListNotFoundException`、remove P2025 靜默

## 4. 後端 / UseCase + Service

- [x] 4.1 `port/in/security/SecurityUseCases.ts`：加 4 個 use case + token；既有 RemoveXxx 簽章 ip→id
- [x] 4.2 `service/security/SecurityServices.ts`：加 GetIpWhitelist / UpdateIpWhitelist / GetIpBlacklist / UpdateIpBlacklist 4 個 service
- [x] 4.3 `security.module.ts`：註冊 4 個 use case provider
- [x] 4.4 `SecurityFacade.ts`：加 getWhitelist / updateWhitelist / getBlacklist / updateBlacklist，removeXxx 改吃 id

## 5. 後端 / Controller + DTO

- [x] 5.1 新增 `UpdateIpWhitelistRequest.ts`
- [x] 5.2 新增 `UpdateIpBlacklistRequest.ts`
- [x] 5.3 `SecurityController.ts`：4 個新 endpoint + 2 個 DELETE path `:ip`→`:id` + 改用 ParseUUIDPipe

## 6. 後端 / Swagger + api-client

- [x] 6.1 新增 `ip-whitelist-get.yaml`
- [x] 6.2 新增 `ip-whitelist-update.yaml`
- [x] 6.3 新增 `ip-blacklist-get.yaml`
- [x] 6.4 新增 `ip-blacklist-update.yaml`
- [x] 6.5 改 2 個 delete yaml：path param `ip` → `id`
- [x] 6.6 `openapi.yaml`：路徑 `{ip}` → `{id}`，加 get / patch ref
- [x] 6.7 bundle + api-client regen

## 7. 後端 / 測試

- [x] 7.1 既有 DELETE case 改 `:id`，mock prisma `delete({ where: { id } })` 對齊
- [x] 7.2 補 11 個 e2e case（GET 2 + PATCH 2 + DELETE 3 × 2 lists；含 P2025 模擬）
- [x] 7.3 api typecheck + lint + unit 135 + e2e 107 全綠

## 8. 前端 / 共用 hooks

- [ ] 8.1 新增 `routes/security/ip-whitelist/hooks/use-ip-whitelist-query.ts`（list paginated + search）
- [ ] 8.2 新增 `routes/security/ip-whitelist/hooks/use-ip-whitelist-mutations.ts`（create / update / remove；toast + invalidate `['GET', '/security/ip-whitelist']`）
- [ ] 8.3 新增 `routes/security/ip-whitelist/hooks/use-ip-whitelist-url-state.ts`（page / limit / search / edit / view）
- [ ] 8.4 同樣三個 hooks for blacklist（`routes/security/ip-blacklist/hooks/`）

## 9. 前端 / Dialog 元件

- [ ] 9.1 新增 `routes/security/ip-whitelist/components/IpWhitelistFormDialog.tsx`：create/edit/view 三 mode、IP（create 可編、edit/view disabled）+ description
- [ ] 9.2 新增 `routes/security/ip-whitelist/lib/ip-whitelist-form-schema.ts`：zod schema
- [ ] 9.3 同樣 dialog + schema for blacklist（field 是 reason）
- [ ] 9.4 共用 delete AlertDialog inline 在 page.tsx（與既有 members / roles 同 pattern），AlertDialogDescription 含「此操作無法復原（硬刪除）」

## 10. 前端 / Table 元件

- [ ] 10.1 新增 `routes/security/ip-whitelist/components/IpWhitelistTable.tsx`：5 欄
- [ ] 10.2 新增 `routes/security/ip-whitelist/components/IpWhitelistSearchBar.tsx`：search (debounce 300ms) + 重置
- [ ] 10.3 同樣 table + searchbar for blacklist（6 欄含 isAutoBlock badge）

## 11. 前端 / Page orchestrator

- [ ] 11.1 新增 `routes/security/ip-whitelist/page.tsx`：權限檢查（`useCurrentMember().roleCode !== 'SUPERADMIN'` → Navigate to /）+ list + dialogs
- [ ] 11.2 新增 `routes/security/ip-blacklist/page.tsx`：同上
- [ ] 11.3 兩個 page 使用 `useDetailDialog` hook 處理 edit / view 共用 GET（沿用 members / roles pattern）

## 12. 整合

- [ ] 12.1 `routes/_nav-items.ts`：加 group「安全」+ 兩條 NAV_ITEMS（ShieldCheck / ShieldBan、requiredRoleCode SUPERADMIN）
- [ ] 12.2 `App.tsx`：加 `/security/ip-whitelist` / `/security/ip-blacklist` 兩條 route
- [ ] 12.3 mutation toast 文案統一繁中（白名單已新增 / 黑名單已新增 / 已更新 / 已刪除）

## 13. 驗證

- [x] 13.1 api typecheck + lint + unit 135 + e2e 107 全綠
- [x] 13.2 web typecheck + lint + test 12 + build 全綠
- [x] 13.3 手動：SUPERADMIN 登入 → sidebar「安全」group 顯示 + 兩條
- [x] 13.4 手動：一般 admin → 「安全」group 整組不顯示
- [x] 13.5 手動：建立 / 編輯 / 檢視 / 刪除白名單一輪 OK
- [x] 13.6 手動：建立 / 編輯 / 檢視 / 刪除黑名單一輪 OK
- [x] 13.7 手動：URL `?edit=<uuid>` / `?view=<uuid>` 重整能恢復 dialog
- [x] 13.8 手動：刪除 AlertDialog 顯示「此操作為硬刪除，無法復原」

## 14. 收尾

- [x] 14.1 本次無新 lesson（按既有 hexagonal 四層 pattern 接做，無踩坑）
- [ ] 14.2 commit（使用者執行）
- [ ] 14.3 邀請 `openspec-archive-change`
