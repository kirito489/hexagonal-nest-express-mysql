> 每一塊（`##` 標題）須能獨立通過驗證鏈：
> `pnpm typecheck && pnpm lint && pnpm test:cov && pnpm --filter @app/api test:e2e && pnpm build`
> 綠燈後給 commit 指令，由使用者手動執行，再進下一塊。
>
> 〔檔頭補寫於 2026-08-16 的 openspec 慣例整理。驗證鏈取自本檔各塊當時實際記錄的結果，塊與任務內容維持原樣未改。〕

## 1. 覆蓋率門檻的執行路徑

- [x] 1.1 `apps/web/package.json` 新增 `test:cov`（`vitest run --coverage`）
- [x] 1.2 `apps/api/package.json` 的 `test:cov` 補上架構測試（`jest --coverage && jest --config test/jest.arch.config.js`）
- [x] 1.3 root `package.json` 新增 `test:cov`（`pnpm -r test:cov`）
- [x] 1.4 `.gitlab-ci.yml` 的 `quality-check` script 由 `pnpm test` 改為 `pnpm test:cov`
- [x] 1.5 本機執行 `pnpm test:cov`，確認兩個 workspace 的門檻都被檢查且通過
- [x] 1.6 **反向驗證**：web statements 門檻暫調 75 → 99（實際 94），`pnpm test:cov` 如期 exit 1 並輸出 `Coverage for statements (94%) does not meet global threshold (99%)`，還原後乾淨

## 2. 前端 import 邊界

- [x] 2.1 `apps/web/eslint.config.js`（實際檔名非 .mjs）加入兩條 eslint 規則；第三條「routes 互不相依」**靜態 glob 表達不了**（需知道「自己是哪個 route」），改以 `src/test/architecture.test.ts` 動態檢查
- [x] 2.2 注意 flat config 同名規則「後蓋前」：`components/ui` 同時屬於 `components`，重疊範圍須各自列齊完整限制
- [x] 2.3 確認現況 `pnpm --filter @app/web lint` 通過（實測三條規則皆 0 違規）
- [x] 2.4 **反向驗證**：四種情境各插探針——lib→routes、ui→api、ui→routes（驗證重疊區塊未被覆蓋）、route↔route；前三者 eslint 報錯、第四者架構測試失敗；還原後無殘留

## 3. 文件與收尾

- [x] 3.1 `openspec/project.md` 的 CI 章節更新 `quality-check` 的實際指令；測試章節補「覆蓋率門檻由 `test:cov` 執行」
- [x] 3.2 `tasks/lessons.md` 記錄「設定了門檻卻沒有執行路徑」這個反覆出現的問題型態
- [x] 3.3 完整驗證鏈：typecheck ✓ / lint ✓ / test:cov ✓（api 86.91、web 94，含 20 條架構規則）/ e2e 138 ✓ / build ✓
