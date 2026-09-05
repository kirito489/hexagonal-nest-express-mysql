> 每一塊（`##` 標題）須能獨立通過驗證鏈：`pnpm typecheck && pnpm lint && pnpm test`。
> 動到 guard 與 service 的對外訊息，**必須加 `pnpm --filter @app/api test:e2e`**
> ——有數條 e2e 斷言訊息內容，那是「有沒有搬錯字」的唯一機器檢查。
> 全部完成後給**一個** commit 指令，由使用者手動執行。
>
> **塊的依賴**：
> - 塊 1（建表）先做，塊 2、3 都引用它。
> - 塊 2（框架層 19 處）與塊 3（上傳 5 處）互相獨立。
> - **塊 4（守則）必須排在 2、3 之後**——提前寫會是紅的，而那不是「抓到缺陷」只是順序錯了。
>
> ⚠️ **本 change 的驗收標準是「對外行為完全不變」**：所有訊息文字逐字保留，
> 狀態碼與錯誤碼完全不動。任何 e2e 變紅都代表搬錯字，不是「測試要跟著改」。

## 1. 建立 `HttpMessages`

- [x] 1.1 `response-messages.ts` 新增 `HttpMessages`，鍵為語意名，涵蓋 19 處框架層訊息
- [x] 1.2 依來源分組加註解（認證 / 授權 / IP 控制 / 登入 / 密碼重設 / 服務可用性）
- [x] 1.3 檔頭補說明：兩張表為何分開（`ResponseMessages` 的完整性由 `satisfies Record<ResponseCode, …>` 保證，混入非 `ResponseCode` 的鍵會破壞它），以及**新增訊息時該進哪張表**的判準
- [x] 1.4 寫明 `HttpMessages` **沒有型別層完整性保證是事實而非疏漏**——框架層的碼由 class 名推導，同一個 `UNAUTHORIZED` 對應多種失敗，不存在一對一關係

## 2. 框架層 19 處改引用

- [x] 2.1 六支 guard（`JwtAuthGuard` ×6、`IpBlacklistGuard` ×2、`IpWhitelistGuard`、`PermissionsGuard`、`RolesGuard`、`SessionIdleGuard`）共 12 處
- [x] 2.2 `LoginService` ×4（reCAPTCHA 兩條、帳號或密碼錯誤 ×2）
- [x] 2.3 `ResetPasswordService` ×1
- [x] 2.4 `redis.service.ts` ×2（兩處同文案，改引用同一個鍵）
- [x] 2.5 **逐條用 `git diff` 比對文字**——搬家就是搬家，一個字都不能改

## 3. `InvalidUploadException` 的恆等函式

- [x] 3.1 `ResponseMessages.INVALID_UPLOAD` **維持** `(reason) => reason`，措辭改由 `UploadRejectReasons` 承載——原訂要改掉它的形狀，但 4.4 推翻後那沒有意義：呼叫端被守則守住，它就只是型別管道
- [x] 3.2 新增 `UploadRejectReasons`：三種帶變數的用模板函式（資料夾 / MIME / 大小上限），兩種靜態的用字串
- [x] 3.3 五個呼叫端改傳表裡的值（`AttachmentController` ×1、`UploadAttachmentService` ×4）
- [x] 3.4 `InvalidUploadException` 的建構子**維持收 `reason: string`**——不改成聯集型別，否則新增一種要同時改型別與表；由守則盯著別再寫字面值
- [x] 3.5 確認上傳相關的 e2e 仍綠（訊息內容有被斷言）

## 4. 守則（必須排在 2、3 之後）

- [x] 4.1 `no-inline-message.spec.ts` 掃描範圍擴到 `src/adapter/in/web/`、`src/application/service/`、`src/infrastructure/`
- [x] 4.2 **不掃 `domain/model` 與 `domain/value-object`**：它們有中文 TSDoc 與常數但不產生對外訊息，掃進來只會製造豁免清單
- [x] 4.3 判定涵蓋單引號、雙引號、**反引號**三種——第一次盤點的正規式只吃單引號，漏掉三處樣板字串
- [x] 4.4 ~~新增「訊息表不得出現恆等函式」的檢查~~ → **實作後推翻**（design D3）。恆等函式只在呼叫端能傳字面值時才是問題；4.1 守住呼叫端後它只是型別管道，措辭已在 `UploadRejectReasons`。硬要滿足這條得扭曲 `INVALID_UPLOAD` 的形狀，方向就反了。規格改記真正的性質：「措辭 MUST 在訊息表檔案內」
- [x] 4.5 **判定改為精準比對例外建構子的引數**——原訂沿用「任何中文字串」的寬判準，實測掃出 **79 處**，其中五十幾處是內部字串（logger / System Log action / auth log detail / 信件主旨 / Zod 驗證訊息 / health indicator）。寬判準只在 `domain/exception/` 成立，因為那裡只有例外建構。兩個範圍改用兩個判準（design D4）
- [x] 4.6 加合成輸入的自我測試，**兩側都要**：三種引號的例外建構應命中；四種內部字串不應命中
- [x] 4.7 **反向驗證**：(a) guard 塞單引號字面值 → 紅並指出 `RolesGuard.ts:49`；(b) 改成樣板字串 → 同樣紅（證明 4.3 有效）；(c) domain exception 塞字面值 → `domain` 那條紅並指出 `AccountDisabledException.ts:9`。逐一 `command cp -f` 還原並以 `git diff --stat` 確認無殘渣

## 5. 文件

- [x] 5.1 `openspec/project/backend-utilities.md` 補兩張表的分工與「新增訊息該進哪張表」的判準
- [x] 5.2 `CLAUDE.md` 的 Hard Rule 更新措辭——原文只講 `DomainException` 的 `super(code, kind)` 簽章，範圍要涵蓋框架層
- [x] 5.3 `openspec/project/testing.md` 的規則表更新 `no-inline-message.spec.ts` 那一列

## 6. 收尾

- [x] 6.1 跑 `pnpm typecheck && pnpm lint && pnpm test:cov` 與 `pnpm --filter @app/api test:e2e`，貼出實際輸出
- [x] 6.2 用盤點時的那支 python 腳本重跑，確認 `src/` 已無內嵌中文的 throw
- [x] 6.3 更新 `tasks/todo.md`：勾掉這條，並修正它原本寫的「5 處」——實際 24 處
- [x] 6.4 新踩到的坑寫進 `tasks/lessons.md`
