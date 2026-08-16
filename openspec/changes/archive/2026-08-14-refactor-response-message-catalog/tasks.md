> 每一塊（`##` 標題）須能獨立通過驗證鏈：
> `pnpm typecheck && pnpm lint && pnpm test && pnpm --filter @app/api test:e2e && pnpm build`
> 綠燈後給 commit 指令，由使用者手動執行，再進下一塊。
>
> 〔檔頭補寫於 2026-08-16 的 openspec 慣例整理。驗證鏈取自本檔各塊當時實際記錄的結果，塊與任務內容維持原樣未改。〕
>
> **前置**：`add-engineering-guardrails` 需先 `/opsx:archive`，否則本 change 的 `platform-engineering-guardrails` delta 在封存時沒有 master spec 可合併。

## 1. 訊息表與基底重載（純搬移，行為零變化）

- [x] 1.1 新增 `apps/api/src/shared/constants/response-messages.ts`：`as const satisfies Record<ResponseCode, string | ((...args: never[]) => string)>`，共 **24 條**（18 靜態含 `INTERNAL_SERVER_ERROR` + 6 動態）—— 提案時估的 33 條有誤，實際錯誤碼就是 24 個
- [x] 1.2 訊息逐字複製自現有 constructor（`Email` 的英文訊息留待第 2 塊處理）
- [x] 1.3 `DomainException.ts` 加入 `StaticResponseCode` 推導型別與建構子重載
- [x] 1.4 改寫 17 個靜態訊息 exception：`super(ResponseCodes.X, 'KIND')`，確實比原本更短
- [x] 1.5 改寫 6 個動態訊息 exception：`super(ResponseCodes.X, 'KIND', ResponseMessages.X(參數))`
- [x] 1.6 `GlobalExceptionFilter` 的 500 訊息改自訊息表取（hook 即時抓到漏補的 import）
- [x] 1.7 **機器比對**訊息逐字未變：對 23 個 exception 取 `git show HEAD` 版本的訊息字面值，逐條確認仍完整出現在新訊息表中 → 0 處不一致
- [x] 1.8 驗證鏈：typecheck 0 error / lint exit 0 / 222+13 單元 / e2e 138 全綠
- [x] 1.9 **反向驗證重載確實分流**：靜態 code 傳 2 參數通過；動態 code 漏傳訊息得到 `TS2345: not assignable to 'StaticResponseCode'`；探針移除後無殘留

## 2. domain 驗證失敗修正（500 → 400）

- [x] 2.1 `response-codes.ts` 新增三個 code；**先不補訊息跑 typecheck 驗證型別保證**，如預期得到 `TS1360: is missing the following properties: INVALID_MEMBER_ID, INVALID_EMAIL_FORMAT, INVALID_MEMBER_NAME`
- [x] 2.2 `response-messages.ts` 補三條繁中訊息（用對外可讀說法，不沿用 `MemberId` 這類內部型別名稱）
- [x] 2.3 新增 `InvalidMemberIdException` / `InvalidEmailException` / `InvalidMemberNameException`，kind 皆為 `INVALID`
- [x] 2.4 呼叫端檢查：`Email.of` 用於 `CreateMemberService` / `UpdateMemberService`，`MemberId.of` + `Email.of` 用於 `Member.reconstitute`；既有 `catch` 全在 auth token / recaptcha，與此無關
- [x] 2.5 **新增 `MemberId.trusted()` / `Email.trusted()` 還原路徑**（實作中發現並經確認）：`reconstitute` 改走 trusted，避免 DB 資料損毀被誤報成 400；`of()` 走驗證並拋 `INVALID`
- [x] 2.6 補單元測試：新增 `MemberId.spec.ts`（7 支）、`Email.spec.ts` 補 exception 型別 / kind / trusted、`Member.spec.ts` 補名稱驗證 3 支 → 222 → 234
- [x] 2.7 更新 `Member.spec.ts` 既有測試「reconstitute 無效 UUID → 拋錯」為「不重複驗證，直接還原」，並註明理由（trusted 路徑的直接後果）
- [x] 2.8 移除 `allowlist.ts` 的 3 筆 `TEMPORARY_NATIVE_ERROR`（清空），架構測試在**無豁免**下仍 13 全綠 → 證明 domain 層 `throw new Error` 確實歸零
- [x] 2.9 驗證鏈：typecheck 0 error / lint exit 0 / 234+13 單元 / e2e 138 全綠

## 3. 新架構規則與文件

- [x] 3.1 新增 `apps/api/test/architecture/no-inline-message.spec.ts`：`src/domain/exception/**` 的字串字面值不得含中文字元，含掃描數自我檢查
- [x] 3.2 **反向驗證**：首版誤判 4 處 —— TSDoc 的 markdown 反引號（`` `code` `` 後接中文）被當成字串字面值；改為先跳過註解行後，現況 15 全綠、插探針精準紅 1 處、還原乾淨
- [x] 3.3 `openspec/project.md` 更新錯誤處理章節；順手修正既有錯誤描述（原文說 code 一律由 class name 轉換，實際上只有 `HttpException` 走轉換，domain exception 用 `ResponseCodes`），並補 `of()` / `trusted()` 對照表
- [x] 3.4 `tasks/lessons.md` 記四則：型別保完整性、建構子重載、`of()` / `trusted()` 雙路徑、註解反引號誤判
- [x] 3.5 `tasks/todo.md` 更新進行中項目；另記一筆既有遺留（`Member.spec.ts` 內有與 `Email.spec.ts` 重複的 Email describe）
- [x] 3.6 完整驗證鏈：typecheck ✓ / lint ✓ / 234 單元 + 15 架構 ✓ / e2e 138 ✓ / build ✓
