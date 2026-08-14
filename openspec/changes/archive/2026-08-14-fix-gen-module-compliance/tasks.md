## 1. exception 與錯誤碼注入

- [x] 1.1 exception 模板改為 `import { ResponseCodes }` + `super(ResponseCodes.%NAME%_NOT_FOUND, 'NOT_FOUND')`（兩參數，靜態訊息）
- [x] 1.2 新增 `patchResponseCodes(n)`：把 `%NAME%_NOT_FOUND` 注入 `shared/constants/response-codes.ts`（冪等）
- [x] 1.3 新增 `patchResponseMessages(n)`：把對應訊息注入 `shared/constants/response-messages.ts`（冪等）——與 1.2 必須成對，否則 `satisfies Record<ResponseCode, …>` 會使 typecheck 失敗
- [x] 1.4 兩個注入皆比照 `patchAppModule`：找不到錨點時 `console.warn` 降級，不中斷

## 2. swagger 骨架與產後同步

- [x] 2.1 新增 swagger yaml 模板（list / get / create / update / delete 各一檔），沿用「成功回應 inline 寫」慣例
- [x] 2.2 新增 `patchOpenApiPaths(n, side)`：把 5 支路由註冊進 `docs/swagger/<side>/openapi.yaml` 的 `paths`（冪等）
- [x] 2.3 產生後執行 `swagger:bundle`；admin 側再執行 api-client `generate`，失敗則警告降級並提示手動指令
- [x] 2.4 更新結尾的「後續手動步驟」文字，移除已自動化的項目

## 3. 格式與驗證

- [x] 3.1 模板格式對齊 prettier（多行 import 展開等，實測有 9 處）
- [x] 3.2 **實測 admin 側**：typecheck 僅剩 `widgetRecord` 未建的預期錯誤、lint ✓、架構守則 20 條全綠（改造前為 typecheck 失敗 + 3 條紅 + 9 個 lint 錯誤）
- [x] 3.3 **實測 front 側**：同樣全綠，且正確地未執行 api-client generate（front 側不生成型別）
- [x] 3.4 **冪等驗證**：重複執行後 response-codes / response-messages / openapi.yaml 各僅 1 處，檔案一律 skip
- [x] 3.5 清除兩側探針與共用檔注入，`git status` 僅剩 gen-module.ts 本身的改動
- [x] 3.6 `openspec/project.md` 的「新增 Domain Module 範本」章節改寫為「產生器自動完成 vs 你要手動完成」，並**修掉過時的第 13 項**（GlobalExceptionFilter 早已不需修改）
- [x] 3.7 完整驗證鏈：typecheck ✓ / lint ✓ / test:cov ✓ / swagger:check ✓ / e2e 138 ✓ / build ✓
