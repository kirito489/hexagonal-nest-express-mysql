> 每一塊（`##` 標題）須能獨立通過驗證鏈：
> `pnpm --filter @app/web build`
> 綠燈後給 commit 指令，由使用者手動執行，再進下一塊。
>
> 〔檔頭補寫於 2026-08-16 的 openspec 慣例整理。驗證鏈取自本檔各塊當時實際記錄的結果，塊與任務內容維持原樣未改。〕

## 1. 前置作業

- [x] 1.1 working tree 乾淨（只剩 openspec proposal untracked）
- [x] 1.2 後端 dev / e2e 已驗證可正常打 `/api/members`
- [x] 1.3 seed admin (admin@test.com / Admin1234!) 已驗證有 VIEW + EDIT 權限

## 2. 基礎建設 / shadcn 元件與全域 Toast

- [x] 2.1 dialog 元件已加入
- [x] 2.2 alert-dialog 元件已加入
- [x] 2.3 select 元件已加入
- [x] 2.4 switch 元件已加入
- [x] 2.5 dropdown-menu 元件已加入
- [x] 2.6 table 元件已加入
- [x] 2.7 sonner 元件已加入（連 next-themes 一起裝）
- [x] 2.8 `App.tsx` 掛 `<Toaster richColors closeButton />`
- [x] 2.9 typecheck + build 全綠

## 3. 基礎建設 / Hooks 與共用元件

- [x] 3.1 `use-debounced-value.ts`：泛型 debounce hook
- [x] 3.2 `use-current-member.ts`：從 `/me` 拿 `{ member, permissions, sub }`（注意 backend 是 `permissionCodes` 不是 `permissions`）
- [x] 3.3 `use-has-permission.ts`：`useHasPermission(code: string): boolean`
- [x] 3.4 `format-relative-time.ts`：`Intl.RelativeTimeFormat` 轉相對時間
- [x] 3.5 `components/data-table/DataTable.tsx`：泛型 DataTable
- [x] 3.6 `components/data-table/DataTablePagination.tsx`：分頁列
- [x] 3.7 typecheck + spec 9 tests passed

## 4. 資料層 / Hooks 與 URL state

- [x] 4.1 `use-members-query.ts`：包 list 查詢，空字串搜尋參數自動剝掉
- [x] 4.2 `use-role-options-query.ts`：staleTime 10 分鐘
- [x] 4.3 `use-member-mutations.ts`：create/update/delete + invalidate + toast
- [x] 4.4 `use-members-url-state.ts`：page/limit/name/email/edit 全 URL 同步
- [x] 4.5 `lib/member-form-schema.ts`：create / update 兩份 zod schema（密碼差異）

## 5. 頁面 / 列表

- [x] 5.1 `routes/members/page.tsx`：orchestrator（header + search + table + pagination + dialogs）
- [x] 5.2 `components/MembersSearchBar.tsx`：name + email debounce 300ms
- [x] 5.3 `components/MembersTable.tsx`：6 欄含 Switch / DropdownMenu
- [x] 5.4 status optimistic update：先改 cache 再 PATCH，失敗 invalidate 重抓
- [x] 5.5 自己這列 Switch disabled + tooltip
- [x] 5.6 DropdownMenu 編輯 / 刪除（刪除 isDefault 時 disabled）

## 6. 頁面 / Dialog

- [x] 6.1 `components/MemberFormDialog.tsx`：create / edit 共用，react-hook-form + zod
- [x] 6.2 編輯由 URL ?edit 控制，會 GET 單筆載入 defaultValues
- [x] 6.3 編輯 GET 失敗（useEffect 防 render 階段 setState）→ toast.error + closeEdit
- [x] 6.4 `components/DeleteMemberDialog.tsx`：顯示 email + 名稱
- [x] 6.5 角色 Select 從 useRoleOptionsQuery 拿；loading 時 placeholder「載入中…」

## 7. 整合

- [x] 7.1 `App.tsx` 加 `/members` 路由（在 Layout 內）
- [x] 7.2 `routes/_nav-items.ts`：NAV_ITEMS 陣列（含 requiredPermission）
- [x] 7.3 `_layout.tsx` 用 NAV_ITEMS 動態渲染，permissions 過濾
- [x] 7.4 page.tsx 用 useHasPermission 檢查 VIEW，無權則 `<Navigate to="/" replace />`（避免 me-loading race）
- [x] 7.5 mutation hooks 集中 invalidate + toast

## 8. 驗證

- [x] 8.1 `pnpm --filter @app/web typecheck` 全綠
- [x] 8.2 `pnpm --filter @app/web lint` 全綠（剩 1 warning：TanStack Table 與 lint 相容性提示，非錯誤）
- [x] 8.3 `pnpm --filter @app/web test` 全綠（3 files / 12 tests）
- [x] 8.4 `pnpm --filter @app/web build` 全綠（dist 641KB / gzip 195KB）
- [x] 8.5 手動測試：登入 → /members → list / 搜尋 / 翻頁 URL 同步 OK
- [x] 8.6 手動測試：新增會員 → toast 成功 + 列表更新 OK
- [x] 8.7 手動測試：編輯 dialog 從 URL `?edit=<uuid>` 直接打開 OK
- [x] 8.8 手動測試：自己這列 Switch disabled + tooltip OK
- [x] 8.9 手動測試：對自己操作後端拒絕 + toast 失敗 OK
- [x] 8.10 手動測試：無 EDIT 權限帳號權限隔離 OK

## 9. 收尾

- [x] 9.1 開發過程踩到並修正的 2 個外延 bug：
  - 後端 `LoginService` 從未呼叫 `updateLastLoginAt`，導致「最後登入」欄永遠 — →
    補上 fire-and-forget 呼叫 + unit (×2) + e2e (×1) 測試
  - `MemberFormDialog` 在 edit 模式仍套用 create schema 致密碼留空被擋 →
    依 mode 切換 resolver；`updateMemberFormSchema.password` 改為
    `z.union([z.literal(''), z.string().min(8).max(30)])` 與 create 對齊型別
- [x] 9.2 `pnpm-lock.yaml` 含 sonner / next-themes / shadcn 新增依賴，會進 commit
- [x] 9.3 階段尾：commit（使用者執行）
- [x] 9.4 邀請 `openspec-archive-change` 走完整封存流程（commit 後執行）
