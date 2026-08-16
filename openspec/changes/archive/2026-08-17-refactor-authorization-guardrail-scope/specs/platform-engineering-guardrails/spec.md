## MODIFIED Requirements

### Requirement: 授權裝飾器覆蓋檢查

系統 SHALL 確保接受外部輸入的端點都明確表態授權。任何 controller handler
若含 `@Param(` / `@Body(` / `@Query(` 之一，且其 class 與 method 皆無
`@Permissions(` / `@Roles(` / `@Public(`，檢查 MUST 失敗。

觸發條件不限於路徑參數——「接受任意資源識別碼」不等於「用 `@Param`」，
`POST /xxx { ids: [] }` 這類 body 帶識別碼的端點同樣需要表態。

此規則的方向與其他授權檢查**相反**：其他規則驗證「有標註的標對了」，本規則驗證
「該標的標了沒」。全域 guard 對未標註路由一律放行，因此漏標的後果是**沉默的授權繞過**
——裝飾器退化成註解、端點對任何已登入者開放、沒有錯誤訊息、測試照樣綠。

**實作 MUST 滿足三條約束**，否則規則會產生偽陰性而毫無徵兆：

1. **比對前 MUST 去除註解。** 說明某個裝飾器的註解，最常出現在「有那個裝飾器」的檔案裡。
   實測過：檔頭寫著「刻意用 RolesGuard + `@Roles(SUPERADMIN)` 粗粒度 role gate」時，
   拿掉真裝飾器只留註解，規則照樣全綠。
2. **class 層級 MUST 只取 `@Controller(` 至 `export class` 之間**，不得取 `export class`
   之前的全部內容——後者包含檔頭 TSDoc。
3. **handler 切塊 MUST 往前納入連續的裝飾器行。** `@Public()` 常寫在 HTTP method
   裝飾器上方，只從後者起算會把它歸給前一個 handler，造成前一支漏報、本支誤報。

自我範圍端點（含 `@CurrentMember()` 且不含 `@Param(`）MUST 豁免——它們操作的是呼叫者
自己的資料。**已知缺口**：`@CurrentMember()` 搭配 `@Body({ targetId })` 會被誤豁免；
堵它需解析 DTO 欄位語意，成本高於收益，指向他人資源 SHOULD 用 `@Param`。

本規則的判定邏輯 MUST 可用合成輸入測試，且 MUST 涵蓋上述三條約束各自的失效情境——
守則出錯是靜默的，給出偽陰性的守則比沒有守則更危險，它會讓人停止人工檢查。

#### Scenario: 收資源識別碼但未表態

- **WHEN** 某 handler 有 `@Param('id')` 卻無任何授權裝飾器
- **THEN** 檢查失敗，訊息列出 `檔案:行號` 與 handler 名稱

#### Scenario: 識別碼走 body 而非路徑參數

- **WHEN** 某 handler 以 `@Body()` 接收識別碼且無任何授權裝飾器
- **THEN** 檢查失敗——觸發條件不限於 `@Param`

#### Scenario: 註解提及裝飾器不算表態

- **WHEN** class 的檔頭註解出現 `@Roles(` 字樣，但無真正的授權裝飾器
- **THEN** 檢查失敗——比對對象是去註解後的裝飾器區段

#### Scenario: 授權裝飾器寫在 HTTP method 裝飾器上方

- **WHEN** `@Public()` 宣告於 `@Post()` 之上
- **THEN** 該 handler 視為已表態，且**不得**被歸給前一個 handler

#### Scenario: 自我範圍端點不受限

- **WHEN** handler 用 `@CurrentMember()` 取得呼叫者、不收 `@Param`
- **THEN** 檢查通過——它操作的本來就是呼叫者自己的資料

#### Scenario: 自我範圍豁免不適用於收路徑參數者

- **WHEN** handler 同時有 `@CurrentMember()` 與 `@Param('id')`
- **THEN** 仍須表態授權——`@Param` 是「指向任意資源」的訊號

#### Scenario: 明示公開亦為表態

- **WHEN** handler 標了 `@Public()`
- **THEN** 檢查通過——公開是刻意的決定，不是遺漏
