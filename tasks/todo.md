# 專案 TODO

> 跨模組待辦清單。每次新 session 先讀；實作中發現新 TODO 立即記錄，**完成當下就回頭勾掉**（曾有兩條早已完成的待辦掛了近一個月，讓人誤判專案現況）。
> 排序原則：近期可動 → 需等外部條件 → 延後技術債。

## 進行中

（目前無）

## 待辦

### 需人工處理（AI 做不到）

- **`.env.example` 補 `ALLOW_PROD_SEED`**：`envSchema` 已補宣告（2026-08-14），但 `.env.example` 尚未加。此檔在 AI 的權限設定中被拒絕存取，需開發者手動加一行 `ALLOW_PROD_SEED=`（註明僅正式環境用）。

- **首次 CI pipeline 需人工觀察**：`pnpm verify:ci` 已能在本機以容器重現 e2e 測試環境（2026-08-16 加入），**測試層面的驗證範圍縮小到剩下 runner 專屬行為**：(1) `quality-check` 與 `e2e-test` 是否在 MR 觸發；(2) cache 是否命中；(3) pipeline 總時長可否接受，過慢可把 `e2e-test` 限縮為只在 MR 跑。GitLab 的 services 不支援 compose 的 healthcheck，CI 端沿用手動等待迴圈（30 次 × 2 秒）—— 首跑時留意是否足夠。

### 觀察中

- **e2e 有間歇性失敗（已發生 2 次，仍無法重現）**：2026-08-14 一次（`1 failed / 137 passed`）、2026-08-16 一次（`1 failed / 143 passed`）。兩次都在重跑後全綠，連跑 5 次亦全綠。**兩次的共同點是「緊接在另一個會寫檔案的指令之後的第一次執行」**（一次接在 `pnpm test` 後、一次接在 `lint:fix` 後）——懷疑與 ts-jest 快取或檔案 mtime 有關，但未證實。已排除的可能：各 spec 的 DB 隔離正常（不碰 DB 的 3 支之外都有 `beforeEach resetDb`）。**下次務必用 `test:e2e > /tmp/x.log 2>&1` 保留完整輸出**——兩次都因為用 grep 管線過濾而沒留下失敗的測試名稱，這是查不下去的主因。

- **剩餘 77 個傳遞依賴漏洞**：2026-08-14 已把能直接控制的修完（overrides 機制修復 + js-yaml / vite / nodemailer 升級，85 → 77）。剩下的皆深埋在 `prisma` / `@nestjs/terminus` 等上游相依樹中（含 2 個 critical：`shell-quote`、`websocket-driver`），**刻意不加 override 強制提版**——相容風險大於收益，模板穩定性優先。追蹤方式：定期 `pnpm audit`，待上游更新後再跑一次升級；若某漏洞出現實際可利用的攻擊面，再單獨評估。

### 功能

- **帳號鎖定管理 CRUD（`add-account-lock-management`）**：`add-security-ip-list-management` 的 Non-Goals 預留。後端 `GET/POST /api/admin/security/locks`、`DELETE …/:id`（已鎖帳號列表 + 分頁 + 搜尋 / 手動鎖定 / 手動解鎖）；前端 `/security/account-locks` 列表頁，sidebar「安全」group 加第三條。沿用 SUPERADMIN role gate。

### 技術債（外部相依卡住，延後）

> **處理原則**：兩項都卡在上游生態，不是本專案能單方面解決的。改動範圍大且會動搖 build baseline，要動請另開 change 並先確認條件已滿足，不要夾帶在功能開發裡。

- **path alias（`@app/*`）導入**：專案有 187 處 4 層以上的相對 import，alias 可提升可讀性與重構安全。**延後原因（2026-07-15）**：`nest build` 走 tsc builder 不自動改寫 alias，三種機制皆有硬傷——tsc-alias 讓 dev（`nest start --watch` + `tsc-alias -w` 兩個 watch 賽跑）偶發「找不到 @app/x」；換 SWC 則踩 Hard Rule 的 cascade（decorator metadata / 與 ts-jest 並存）。純可讀性改善不值得動搖 build baseline。**條件**：改用 SWC / webpack builder，或有大重構痛點時再一起上。

- **`moduleResolution: node`（node10）遷移 `nodenext`**：TS 7.0 會移除 node10。**現狀處置（2026-07-14）**：api 已對齊到 TS 6.0.2（與 web / 編輯器同版），`tsconfig.json` 加 `ignoreDeprecations: "6.0"` 消音 + `rootDir: "."`（TS 6 起 `TS5011` 要求明示，否則 ts-jest 全掛）。真解 `nodenext` **實測 TS 5.9 與 6 皆爆 124 個 `TS1272`**——NestJS 裝飾器 metadata 要求 `@Body()` DTO 用 `import type`，但注入的 service 不能改否則 DI 壞掉，與 TS 版本無關、卡在 NestJS 上游。**條件**：等 NestJS 改善 nodenext 支援；TS 7 移除 node10 時消音會失效，屆時強制處理。

---

## 已完成

### 2026-08-16 — AI 工程設置升級（借鏡 times-account-backend）

對方的 AI 設置比本專案成熟一個世代，四項全部落地：

- **hook 抽成 `.agents/hooks/*.sh`**：settings.json 從長串 shell 字串變成純註冊；邏輯放工具無關位置（git hook / Codex 也能呼叫同一支），根目錄以 `${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel)}` 推斷。同步加 `hook-scripts.spec.ts` 做 `bash -n` 檢查——否則只是把「不在檢查範圍的設定」換個地方放。
- **Stop hook 補上連動守門**（原本 `"Stop": []` 是空的）：改了 swagger 來源 yaml 但產物沒重生就 `exit 2` 擋下。判斷刻意保守（只有「來源變更且兩產物皆未變更」才擋）——誤判會讓人無法收工。
- **`pnpm verify:ci` 本機重現 CI**：compose 起 MySQL 9（healthcheck + tmpfs），實測 144 tests / 62 秒。順帶確認 GitLab services 不支援 compose 的 healthcheck 語法，CI 端的手動等待迴圈是必要的。
- **`AGENTS.md` symlink + Hard Rules 標註強制方式**：標註後浮現一個事實——**12 條 Hard Rules 只有 5 條有機器守，7 條純靠自律**。

架構規則 20 → 24，master spec 的 engineering-guardrails 16 → 19 條。


### 2026-08-14 — 工程護欄體系：把 Hard Rules 變成會失敗的檢查

起點是「看看 cga-laravel-backend 有什麼可以吸收」，借鏡其 `tests/Architecture/` 與 `tests/Feature/Api/Traits/`，最後擴展成一輪完整體檢，封存 7 個 change。**架構規則 0 → 21、單元測試 222 → 263、e2e 121 → 138、master specs 10 → 13。**

- **護欄本體**（`add-engineering-guardrails`）：`test/architecture/` 的規則檔 + eslint `no-restricted-imports` 分層邊界 + `test/helpers/assertions.ts`（e2e 共用斷言與 `describeUnauthorized` 產生器）。每條規則自帶「掃描數 > 0」與「豁免過期」兩道自我檢查。
- **錯誤處理重構**（`refactor-response-message-catalog`）：訊息集中到 `response-messages.ts`，完整性由 `satisfies Record<ResponseCode, …>` **型別**保證；`DomainException` 建構子重載讓靜態訊息自動查表、動態訊息漏傳即編譯失敗。domain 驗證失敗由 500 改為 400，並新增 `of()` / `trusted()` 雙路徑。
- **契約同步**（`add-swagger-sync-guardrail`）：controller → 來源 yaml → bundle → api-client 三段轉換的護欄。路由層級由架構測試守（毫秒），內容層級由 `swagger:check` 守（產物寫入 tmpdir，不污染工作目錄）。
- **產生器回歸修復**（`fix-gen-module-compliance`）：上述護欄讓 `gen:module` 產出物 typecheck 失敗 + 3 條規則紅 + 9 個 lint 錯誤——**模板最常用的入口壞了一輪都沒發現**。產生器改為自動注入錯誤碼 / 訊息 / swagger 骨架，產出物零手改即全綠。

導入過程抓出的真問題：domain 層 4 處 `throw new Error` 讓無效輸入回 500、e2e 有 29 個錯誤碼從未被斷言、eslint 邊界規則因 flat config「後蓋前」而有一半失效。

### 2026-08-14 — CI 品質關卡與覆蓋率門檻

- **CI 從「什麼都不檢查」到擋得住問題**（`add-ci-quality-gate`）：原本只有 install / build / cleanup，`grep -c "pnpm (test|lint|typecheck)"` = **0**。新增 `quality` stage：`quality-check` 與 `e2e-test`（`mysql:9` service container），**兩者於 MR 即觸發**，`prepare-production` 加 `needs: quality-check`。e2e 連線走 job variables 而非偽造 `.env`。
- **四個覆蓋率門檻原本是裝飾品**（`enforce-quality-thresholds`）：web 連 `test:cov` script 都沒有、api 的沒串架構測試、CI 跑的是不帶 coverage 的 `test`。改為 root `pnpm -r test:cov` 串接並讓 CI 使用。另補前端分層邊界（eslint 兩條 + vitest 架構測試一條）。
- **稽核修正**：原判斷「前端護欄遠落後」**不成立**——實測前端覆蓋率 94%、分層 0 違規；用「103 檔 : 7 測試檔」推斷是錯的，因為 shadcn 元件與整合層本就不在 coverage 分母內。

### 2026-08-14 — 依賴安全與清單稽核

- **依賴漏洞**（`fix-security-dependencies`）：`pnpm audit` 85 個。修復 overrides 機制（原宣告在 `apps/api/package.json`，**雙重無效**：pnpm 只讀 root、且 10+ 起改讀 `pnpm-workspace.yaml`，三條 override 長期沒生效）+ 升級三個直接依賴（js-yaml 4.1.1→4.3.1、vite 8.0.13→8.2.1、nodemailer 8.0.7→9.0.5 major）。**85 → 77**。nodemailer 敢做 major 升級，是因為六角架構把它關在單一 adapter 內。
- **清單失真**：稽核發現「安全強化」兩條待辦（全域 JwtAuthGuard 預設拒絕、refresh token 重用連坐撤銷）其實**早已實作完成**，只是完成時沒回頭勾掉。教訓已記入 `lessons.md`。
- **文件同步**：三份文件（README / CLAUDE.md / project.md）補上本輪成果，並用腳本掃出 4 處既有過時內容（含存在一個月的 Swagger 網址 `/api/docs`，實際已是 `/api/admin/docs`）。

### 2026-07-14 — 前後台 API 分層（admin / front）

把單一 API 面重構成兩套：後台 `/api/admin/*`、前台 `/api/front/*`。切分只在 **in 側 5 層**（controller / facade / service / port-in / module），out 側 + domain + 橫切共用。

- 88+ rename、全 import 重接（段插入 + 深度 +1）+ e2e URL 調整，114 e2e 綠。
- swagger 分兩份（`serveFiles` 各綁各的 doc），api-client 靠 baseUrl 承載 `/api/admin` 前綴、path key 不動 → **前端呼叫端零改**。
- `gen:module` 升級支援 `--admin` / `--front`（執行期轉換）。
- 未做：apps/web 沒有真前台頁（front 目前只有骨架端點）。

### 2026-07-14 — e2e 全面改走真 test DB

6 支 e2e spec 從 mock Prisma 轉真庫，114 tests 全綠。基建：`helpers/e2e-env.ts`（載真 `.env` 帳密 + 守門庫名須含 `test`）、`global-setup.ts`（建庫 + `migrate deploy`）、`helpers/db.ts`（`resetDb` 依 FK 序清表 + seed helpers）。Redis 仍 mock。

### 2026-07-14 — 借鏡 kgie-nest-backend 的工程設置

- ESLint 抽共用基底 `packages/eslint-config`，api 升級 flat config + `recommendedTypeChecked`，**type-checked 抓到 9 個真發現**（含 `main.ts` bootstrap 未 catch 的 floating-promise）。
- Prettier 全 repo 統一根一份設定；前端從無分號 reformat 對齊（~107 檔），後端 0 churn。
- 後端六角模組產生器 `gen:module`（24 個模板 + 自動接線）。
- `init-project.sh` 衍生專案初始化腳本（保留 `lessons.md` 可重用基建知識）。
- `date.ts` 走 `APP_TIMEZONE` + 日邊界 helper（含「UTC 晚間 → 台北隔日」跨日證明）。

### 2026-06-25 — 從衍生專案回補共用基建

單一埠部署（`ServeStaticModule.forRootAsync` + 執行期偵測）、排程骨架（`onModuleInit` 動態註冊 + env gate 預設關）、MySQL 9 的 `allowPublicKeyRetrieval`、`.gitlab-ci.yml` 骨架。

### 2026-05-30 — 專案審查問題修補與基建補強

`/review-project` 發現的 15 項安全 / 健壯性問題：密碼重設 token 改存 sha256、forgot/reset 加 throttle 並改回 204、新增 `TRUST_PROXY` 且 IP 黑名單 fail-closed、帳號鎖定補 `deletedAt: null`、外部服務與 Redis 加 timeout、JWT 加 issuer/audience。

另補 Helmet、健康檢查升級（liveness + readiness）、Sentry / Prometheus（flag 預設關）、後端覆蓋率 30.86% → 86.77%。
