## ADDED Requirements

### Requirement: API 契約三段轉換必須同步

架構檢查 SHALL 守住從 controller 到前端型別的三段轉換，任一段不同步 MUST 使檢查失敗。比對以路由集合（HTTP method + path）為單位，且 MUST 正確處理 OpenAPI 的 `servers` base path 與 NestJS 的 `:param` / OpenAPI 的 `{param}` 兩種參數寫法差異。

#### Scenario: 新增 endpoint 但未撰寫 swagger

- **WHEN** controller 新增一支路由，來源 yaml 沒有對應宣告，且不在豁免清單中
- **THEN** 架構測試失敗，列出缺少文件的 method 與 path

#### Scenario: 改了來源 yaml 但未重跑 bundle

- **WHEN** 來源 yaml 的 paths 集合與 `openapi.bundle.yaml` 不一致
- **THEN** 架構測試失敗，指出需執行 `swagger:bundle`

#### Scenario: bundle 更新但未重新產生 api-client

- **WHEN** `openapi.bundle.yaml` 的 paths 集合與 `api-client/src/schema.ts` 的 `paths` key 不一致
- **THEN** 架構測試失敗，指出需執行 `api-client` 的 `generate`

#### Scenario: 刻意不納入文件的端點

- **WHEN** 某端點（如健康檢查）刻意不列入 API 文件並已登記於豁免清單
- **THEN** 檢查通過，且豁免項目同樣受過期檢查約束

### Requirement: 契約內容層級的同步驗證

專案 SHALL 提供指令，重新產生 bundle 與 api-client 型別後與現有產物比對內容，以涵蓋「路由集合未變但 schema 內容已變」的情形。該指令 MUST NOT 修改工作目錄中的任何檔案。

#### Scenario: 只改了 request body 欄位

- **WHEN** 某 endpoint 的 request schema 新增欄位、但路由集合沒有變化，且未重新產生產物
- **THEN** 該指令以非零狀態結束並指出產物已過期

#### Scenario: 執行後工作目錄不受影響

- **WHEN** 執行該指令
- **THEN** 產物一律寫入暫存目錄，`git status` 不出現任何變更
