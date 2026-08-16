## ADDED Requirements

### Requirement: 授權裝飾器覆蓋檢查

系統 SHALL 確保接受任意資源識別碼的端點都明確表態授權。任何 controller handler
若含 `@Param(` 且其 class 與 method 皆無 `@Permissions(` / `@Roles(` / `@Public(`，
檢查 MUST 失敗。

此規則的方向與其他授權檢查**相反**：其他規則驗證「有標註的標對了」，本規則驗證
「該標的標了沒」。全域 guard 對未標註路由一律放行，因此漏標的後果是**沉默的授權繞過**
——裝飾器退化成註解、端點對任何已登入者開放、沒有錯誤訊息、測試照樣綠。

#### Scenario: 收資源識別碼但未表態

- **WHEN** 某 handler 有 `@Param('id')` 卻無任何授權裝飾器
- **THEN** 檢查失敗，訊息列出 `檔案:行號` 與 handler 名稱

#### Scenario: 自我範圍端點不受限

- **WHEN** handler 只用 `@CurrentMember()` 取得呼叫者、不收 `@Param`
- **THEN** 檢查通過——它操作的本來就是呼叫者自己的資料

#### Scenario: 明示公開亦為表態

- **WHEN** handler 標了 `@Public()`
- **THEN** 檢查通過——公開是刻意的決定，不是遺漏

### Requirement: 全域 guard 註冊與順序檢查

系統 SHALL 確保 `JwtAuthGuard`、`RolesGuard`、`PermissionsGuard` 皆以 `APP_GUARD`
全域註冊，且兩個授權 guard MUST 排在 `JwtAuthGuard` 之後。

授權 guard 全域化消滅了「漏掛 `@UseGuards`」整類 bug，但代價是全域註冊本身成為單點：
被移除時所有權限裝飾器會同時失效而無任何徵兆。順序亦為隱性依賴——兩者都讀
`JwtAuthGuard` 填入的 `request.member`，排前面會拿到 undefined 而靜默放行。

#### Scenario: 授權 guard 被移出全域註冊

- **WHEN** `PermissionsGuard` 自 `APP_GUARD` providers 移除
- **THEN** 檢查失敗，訊息說明「權限裝飾器將退化成註解」

#### Scenario: 授權 guard 排在認證之前

- **WHEN** `RolesGuard` 宣告於 `JwtAuthGuard` 之前
- **THEN** 檢查失敗，訊息說明 `APP_GUARD` 的宣告順序即執行順序

### Requirement: 敏感欄位脫敏覆蓋檢查

系統 SHALL 掃描所有 request DTO 的欄位名，將看起來敏感者（含 `password` / `token` /
`secret` / `credential` / `apikey` / `privatekey` / `authorization` 字根）實際餵進
`sanitize()`，斷言其值被替換為 `[REDACTED]`。

檢查 MUST 呼叫真正的 `sanitize()` 而非重新實作判斷邏輯，否則兩邊會各自漂移。

#### Scenario: 新增的敏感 DTO 欄位未被遮蔽

- **WHEN** 某 request DTO 新增一個 `sanitize()` 的字根清單涵蓋不到的敏感欄位
- **THEN** 檢查失敗，訊息指出該欄位會明文寫進 `system_logs`

### Requirement: 繁體中文一致性檢查

系統 SHALL 掃描 `apps` / `packages` / `openspec` / `tasks` / `.agents` 與根目錄文件，
拒絕日文假名與日文新字體／簡體字。規則檔自身與 `pr/`（review 報告會逐字引用問題碼）
MUST 排除。

單字級的字形混入（日文新字體與其繁體對應字往往只差一兩筆）在人工 review 中幾乎不可能穩定攔截。

#### Scenario: 註解混入日文新字體

- **WHEN** 某程式碼註解混入日文新字體
- **THEN** 檢查失敗，訊息列出 `檔案:行號` 與命中的字元

### Requirement: openspec 自訂 schema 的執行路徑檢查

系統 SHALL 確保專案的 openspec 格式規範真的會生效：自訂 schema 與四份模板存在、
`schema.yaml` 可解析且四個 artifact 齊全、建立 change 的指令一律帶
`--schema spec-driven-custom`、進行中的 change 皆使用該 schema、
且 `.claude/commands/opsx/*` 維持轉呼叫 skill 的薄殼。

`openspec config` 只支援 global scope，專案預設 schema 進不了版控——少帶旗標就會
靜默落回內建 schema，所有格式規範一條都不生效。

#### Scenario: 建立指令漏帶旗標

- **WHEN** `.claude/` 底下任一份文件的 `openspec new change` 未帶 `--schema`
- **THEN** 檢查失敗並指出該檔案

#### Scenario: opsx 指令重新抄回完整流程

- **WHEN** 某支 opsx 指令檔超過 40 行或不再轉呼叫 skill
- **THEN** 檢查失敗——流程只能有一份真相

### Requirement: master spec 的命名與格式檢查

系統 SHALL 確保 `openspec/specs/` 的能力名稱帶 `api-` / `ui-` / `platform-` 前綴、
spec.md 的標題行與目錄名一致、`api-*` 中宣告 endpoint 的需求皆寫出 Request 與
Success / Failure Response、且 `ui-*` 與 `platform-*` MUST NOT 寫 API 回應區塊。

格式規範由 `openspec instructions` 在產生 artifact 時餵給 AI，但**產生之後就沒有東西
再檢查**——spec 被手改或 AI 沒照做都不會有徵兆。

#### Scenario: 能力名稱缺少分類前綴

- **WHEN** `openspec/specs/` 出現不帶前綴的目錄
- **THEN** 檢查失敗並說明三類前綴各自的寫法

#### Scenario: api 端點需求缺少回應形狀

- **WHEN** `api-*` 中某需求以 `` `METHOD /path` `` 開頭但無 Success Response
- **THEN** 檢查失敗並指出該需求名稱

### Requirement: 專案文件索引的連結完整性檢查

系統 SHALL 確保 `openspec/project.md` 連到的子檔皆存在、`openspec/project/` 底下無
未被索引連到的孤兒檔、且全 repo 對子檔的引用皆有效。

拆分文件的典型失效不是拆錯，而是**連結爛掉沒人發現**。

#### Scenario: 子檔改名後索引未更新

- **WHEN** `openspec/project/` 的某支檔案改名
- **THEN** 檢查失敗，同時報出索引失效與全 repo 的無效引用

#### Scenario: 新增子檔未掛進索引

- **WHEN** `openspec/project/` 出現未被 `project.md` 連到的檔案
- **THEN** 檢查失敗——讀的人找不到它

### Requirement: 契約的成功狀態碼同步檢查

系統 SHALL 比對每條路由在 controller 的 `@HttpCode`（未指定時 POST 為 201、
其餘為 200）與 OpenAPI 記載的 2xx，不一致即失敗。檢查 MUST 讀 bundle 而非來源 yaml
——來源的每條路由都是 `$ref`，`responses` 不在檔內。

原本的路由層級檢查只比對「路由存不存在於兩邊」，因此曾有 endpoint 的 yaml 寫
`200` + `data.message`、實作卻是 `204` 無 body，兩邊路由都在、檢查全綠，
錯的型別一路流進 `@app/api-client`。

#### Scenario: 狀態碼在兩邊不一致

- **WHEN** 某 endpoint 的 `@HttpCode(NO_CONTENT)` 但 yaml 記載 `200`
- **THEN** 檢查失敗，訊息同時列出 controller 與 yaml 各自的值

### Requirement: e2e spec 的位置檢查

系統 SHALL 確保所有 `*.e2e-spec.ts` 位於 `test/e2e/`。

jest 的 `testRegex` 是 `test/.*\.e2e-spec\.ts$`，放回平鋪一樣跑得到，
沒有守則的話目錄結構會靜默侵蝕回原狀。

#### Scenario: e2e spec 放在 test/ 根層

- **WHEN** 新增的 e2e spec 直接放在 `test/`
- **THEN** 檢查失敗並說明 `test/` 四個目錄的分工

### Requirement: compose 檔的執行路徑與文件同步檢查

系統 SHALL 確保每份 `compose*.yml` 都有 script 或腳本會啟動它、`compose.yml` 的對外埠
皆寫進 README、且 docker 相關檔案（compose / Dockerfile / `docker/`）提及的
`pnpm <script>` 確實存在於 `package.json`。

script 名稱檢查 MUST 只比對含冒號的名稱——散文中的「`.pnpm store`」「pnpm 11 需要」
不含冒號，藉此避免誤判；代價是漏掉 `pnpm dev` 這類單字名，但那些是慣例名稱、幾乎不改。

#### Scenario: compose 檔沒有任何指令會啟動

- **WHEN** 新增一份 compose 檔但未加對應 script
- **THEN** 檢查失敗——它是死檔

#### Scenario: script 改名後 docker 註解未更新

- **WHEN** `docker/` 底下的註解仍寫著已不存在的 `pnpm <script>`
- **THEN** 檢查失敗並指出該檔案與指令
