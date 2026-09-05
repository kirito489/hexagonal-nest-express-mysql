> 每一塊（`##` 標題）須能獨立通過驗證鏈：`pnpm typecheck && pnpm lint && pnpm test`。
> 純前端重構，**不動後端也不動 API 契約**，因此不需要 `test:e2e` 與 `swagger:bundle`。
> 全部完成後給**一個** commit 指令，由使用者手動執行。
>
> **塊的依賴**：
> - 塊 1（元件 + 測試）必須先於塊 2（四頁改用它）。
> - **塊 2 的驗收判準是「DOM 與 class 不變」**——這是純重構，任何輸出差異都是缺陷。

## 1. 元件與測試

- [x] 1.1 新增 `apps/web/src/components/PageHeader.tsx`：`title: string`、`description?: ReactNode`、`children?: ReactNode`
- [x] 1.2 **有無動作區的排版差異由元件自己決定**：沒有 `children` 時 `<header>` 不套 flex，有才套 `justify-between`
- [x] 1.3 `description` 用 `ReactNode` 而非 `string`（未來可能放行內連結）；`title` 維持 `string`（標題放 JSX 幾乎一定是設計問題）
- [x] 1.4 TSDoc 寫明存在理由（照抄前一頁在第 N 頁會抄歪，衍生專案第八頁三處全偏而測試全綠）與**為何刻意不加守則**（例外會讓規則失效，而會誤報的守則會被繞過）
- [x] 1.5 新增 `PageHeader.test.tsx`：渲染標題與副標、沒有副標時不渲染空 `<p>`、動作區會渲染、**有動作區才套 `justify-between`**
- [x] 1.6 最後那條是元件存在理由的一半，不能只靠 `className` 恰好寫對——它要能在「一律套 flex」的寫法下變紅

## 2. 四支列表頁改用元件

- [x] 2.1 `members/page.tsx` 改用 `PageHeader`
- [x] 2.2 `roles/page.tsx` 改用 `PageHeader`
- [x] 2.3 `security/ip-blacklist/page.tsx` 改用 `PageHeader`
- [x] 2.4 `security/ip-whitelist/page.tsx` 改用 `PageHeader`
- [x] 2.5 **驗收：DOM 與 class 完全不變**。`git diff` 顯示每頁只有 `-11 / +12` 行——
      移除的是 `<header>` / `<div>` / `<h1>` / `<p>` 的手寫結構，新增的是一行 `PageHeader` 與 import，
      `<Button>` 區塊原封不動、零 class 增減
- [x] 2.6 跑前端測試，確認既有的頁面測試（若有）仍綠

## 3. 文件

- [x] 3.1 `openspec/project/frontend.md` 補「列表頁頁首用 `PageHeader`」的慣例，並寫明「能用結構消除的偏差不寫成守則」這個判準

## 4. 收尾

- [x] 4.1 完整驗證鏈實際輸出：

      ```
      typecheck   api / web / api-client 皆 Done
      lint        api / web 皆 Done
      web test:cov  10 files / 42 tests（本 change 前 9 / 37）
                    All files 94.23 | 96.66 | 88.23 | 93.18（門檻 75/75/60/75）
      架構守則      24 suites / 110 tests（未受影響）
      ```
- [x] 4.2 **反向驗證**：把 `className` 改成無條件的 `"flex flex-wrap items-center justify-between gap-3"`
      → 「有動作區才套 justify-between」那條紅、其餘 4 條仍綠；還原後 5 條全綠。
      **證明那條不是靠 `className` 恰好寫對**
- [x] 4.3 更新 `tasks/todo.md`：勾掉 PageHeader 那條，並在 C6a 的條目補一句「新頁面用 `PageHeader`，不要照抄既有頁面的頁首」
- [x] 4.4 ~~新踩到的坑寫進 `tasks/lessons.md`~~ —— **沒有新的坑**。本 change 是純重構，過程沒有意外；「能用結構消除的偏差不要寫成守則」這個判準屬設計決策而非踩坑，已寫進 `frontend.md` 與 spec
