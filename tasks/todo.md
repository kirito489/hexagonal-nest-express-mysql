# 專案 TODO

> 跨模組待辦清單。每次新 session 先讀；實作中發現新 TODO 立即記錄，**完成當下就回頭勾掉**（曾有兩條早已完成的待辦掛了近一個月，讓人誤判專案現況）。
> 排序原則：近期可動 → 需等外部條件 → 延後技術債。

## 進行中

### 從 nexus-nest-backend 回補模板（2026-09-04 起）

`/Users/alantsai/side_projects/nexus-nest-backend` 是本模板的衍生專案（87 commits），已改為 PostgreSQL + 聊天/WebSocket。
盤點後確認可回補的部分切成 10 支 change，依風險與相依排序：

- [x] **C1 `platform-ai-workflow-backport`** — `.claude/skills/`（grill-me / pr-body / tidy-todo）、`.husky/pre-push`、PR/MR 模板（GitLab 側改 symlink）、`openspec/config.yaml`、lessons 合併 22 條（288 → 473 行）。守則 19 支 / 68 → 69 項。**待封存**
- [x] **C2 `platform-security-hardening`** — 帳號鎖定時效 + 三態 `checkLock`、大小寫繞過修補、CSP 不再全域關閉、`SWAGGER_ENABLED`、refresh token 效期 7 天→1 天。
      **實作途中另外修掉三個既有缺陷**：鎖定回應 403/`FORBIDDEN` 與 spec 寫的 423/`ACCOUNT_LOCKED` 不符（**對外契約變更**）、`AccountLockedException` 是零呼叫端的死碼、`LoginService` 內嵌使用者文案違反 Hard Rule。
      單元 330 條 / 守則 69 條 / e2e 160 條（151 → 160）。**待封存**
- [x] **C3 `platform-guardrail-backport`** — 回補四支守則（`guardrail-inventory` / `env-example-sync` / `public-surface` / `role-permission-cache`），守則 19 支 / 69 項 → **23 支 / 102 項**。
      **順帶修掉一個活的 bug**：`UpdateRoleService` 改完角色權限不清成員快取，撤銷的權限最多 5 分鐘後才生效。
      刻意不搬三項：`session-revocation`（守 WS 連線撤銷，模板無 WS 層）、`permission-catalog-sync`（同步前後端權限碼，模板前端還沒有 `lib/permission-codes.ts`，屬 C6b）、`infra-endpoint` 裝飾器（為不存在的問題建設施）。**待封存**
- [ ] **C4 `platform-container-single-entry`** — `verify-ci.sh` 的 `down -v` 誤刪全專案 volume、nginx 單一入口 + `TRUST_PROXY`、容器吃本機 `.env`、`e2e-docker.sh`
      ⚠️ **`down -v` 這條在 C1 已寫進 `lessons.md` 並標明「現在正踩著」**——在 C4 落地前，跑 `pnpm verify:ci` 會清掉開發用的 `mysql-data` / `redis-data` 與五個 `node_modules` volume，事後要重跑 `pnpm install` 與 `pnpm docker:init`
- [ ] **C5 `platform-ci-dual-provider`** — GitLab 與 GitHub Actions **兩份並存**（fork 的人自己刪一份），job 前置抽共用、版號取自 `.nvmrc` / `packageManager`
- [ ] **C6a `api-account-lock-management`** — 見下方「功能」段既有條目
- [ ] **C6b `ui-route-permission-guard`** — 路由依權限守衛，sidebar 隱藏不再是唯一防線
- [ ] **C6c `ui-permission-tree-legibility`** — 權限樹中文化、不可指派的安全管理改純說明列表
- [ ] **C6d `ui-admin-orientation`** — 後台導覽依管理對象分組、首頁改營運摘要
- [ ] **C6e `api-front-auth`** — 前台註冊 / 信箱驗證 / 密碼重設（模板 front 端目前只有 `ping`，唯一從零到有的一支，最後做）

**共通適配成本**：nexus 是 PostgreSQL、模板是 MySQL/MariaDB，migration、compose service、healthcheck、`@prisma/adapter-*` 都要改回 MySQL 版。

**刻意不搬**：PostgreSQL 遷移、聊天/WebSocket、Redis io adapter、moderation / front-users 後台頁、metrics + chat audit 可觀測性、`gen:comments`（Postgres `COMMENT ON` 專屬）。

## 待辦

### 從衍生專案再撈的（2026-09-06 盤點，nexus 多出三支 commit）

- [x] **C2b `fix-viewless-module-permission`** — `BACKEND:ATTACHMENT:EDIT` 對任何角色都存不進去（前後端各有一個獨立的擋路者）。已修並封存。
- [ ] **PageHeader 共用元件**（nexus `43e2fc4`）：列表頁的頁首抽成 `components/PageHeader.tsx` + 測試，模板有 4 支列表頁適用（members / roles / security/ip-blacklist / ip-whitelist）。附 `platform-frontend-conventions` 的 spec delta。純前端重構，風險低。
- [ ] **帳號鎖定頁版面**（nexus `e674a2a`）：**不單獨搬**，回補 C6a（`api-account-lock-management`）時直接以修正後的版本為藍本。

### 從 C2 分出來的後續

- [x] ~~**守則應涵蓋「`.env.example` 真的能通過 `envSchema`」**~~ —— **C3 已完成**（`env-example-sync.spec.ts`）。反向驗證確認它會抓到 C2 那個缺陷：把 `SWAGGER_ENABLED` 改回純 `.optional()` 時，訊息直接指出該變數。原始說明：目前 `env-schema.spec.ts` 只檢查「程式用到的變數有沒有宣告」，**沒有任何東西把範例檔餵進 `envSchema` 跑一次**。這個缺口在 C2 收尾時親自踩到——`SWAGGER_ENABLED=`（留空）會被 `.optional()` 判定為不合法，任何照抄範例檔的新部署都會啟動失敗，而開發機因為本機 `.env` 沒有那一行所以完全無感。同一次比對還抓出四個長期缺漏的變數（`LOG_PURGE_ENABLED` / `LOG_RETENTION_DAYS` / `LOG_PURGE_CRON` / `THROTTLE_FAIL_OPEN`）。**新守則要做兩件事**：(1) `envSchema` 宣告的變數與範例檔的鍵集合完全相等；(2) 把範例檔 parse 後（必填項補假值）餵進 `envSchema`，必須通過。建議併進 C3。

- **guard 層 5 處內嵌使用者文案**（`IpBlacklistGuard` ×2、`IpWhitelistGuard`、`PermissionsGuard`、`RolesGuard`）：與 C2 修掉的 `LoginService` 同型，違反 Hard Rule「訊息只能住在 `response-messages.ts`」。**`no-inline-message.spec.ts` 只掃 `domain/exception/`，掃不到 guard 與 service**——所以真正該做的不只是改那 5 處，而是把守則的掃描範圍擴到會拋例外的所有層。C2 刻意不夾帶：那 5 處不在 C2 的路徑上，且擴大守則範圍可能掃出更多既有違規，屬獨立的清理 change。

### 需人工處理（AI 做不到）

- **環境變數範例檔的修改**：AI 的工具權限讀不到 `.env.example`，需要改它時的流程是——AI 在 `apps/api/env.example`（無點號）寫好，開發者覆蓋回去後刪掉工作副本。
  **守則盯的是真檔**（`env-example-sync.spec.ts` 跑在 jest 的 Node 行程裡，不受工具權限限制），所以違規一定會被抓到，只是修正需要人手。
  （2026-09-05 清掉一條過期待辦：原本掛著「`.env.example` 補 `ALLOW_PROD_SEED`」，實際上該行早就在檔案裡了。）

- **首次 CI pipeline 需人工觀察**：`pnpm verify:ci` 已能在本機以容器重現 e2e 測試環境（2026-08-16 加入），**測試層面的驗證範圍縮小到剩下 runner 專屬行為**：(1) `quality-check` 與 `e2e-test` 是否在 MR 觸發；(2) cache 是否命中；(3) pipeline 總時長可否接受，過慢可把 `e2e-test` 限縮為只在 MR 跑。GitLab 的 services 不支援 compose 的 healthcheck，CI 端沿用手動等待迴圈（30 次 × 2 秒）—— 首跑時留意是否足夠。

### 觀察中

- **e2e 有間歇性失敗（已發生 3 次）**：2026-08-14（`1 failed / 137 passed`）、2026-08-16（`1 failed / 143 passed`）、**2026-09-06（`1 failed / 161 passed`）**。三次都在重跑後全綠（第三次連跑 3 次皆綠）。**共同點是「緊接在另一個會寫檔案的指令之後的第一次執行」**——前兩次接在 `pnpm test` / `lint:fix` 後，第三次接在 `pnpm test:cov` 後。懷疑與 ts-jest 快取或檔案 mtime 有關，但未證實。已排除：各 spec 的 DB 隔離正常。

  **第三次終於留下了失敗的測試名稱與症狀**（前兩次因 grep 過濾而遺失，這是先前查不下去的主因）：

  ```
  ● Role E2E › GET /api/admin/roles › 無 token → 401
    Expected: 401
    Received: 404
  ```

  **關鍵新線索：症狀是 404 而不是授權失敗。** 404 代表那個請求根本沒有匹配到路由，
  與 JWT / guard 完全無關——所以先前「懷疑 DB 隔離或 token 汙染」的方向可以排除。
  可能的方向：`ServeStaticModule` 的 SPA fallback 在某些時序下攔截了 `/api/*`
  （`serve-static.e2e-spec.ts` 會在 tmpdir 建 `index.html` fixture），
  或 app 尚未完成 `init()` 就收到請求。下次再發生時**優先確認當下 `WEB_STATIC_ROOT`
  指向的 fixture 是否存在**，以及失敗的是不是同一支 spec。

- **剩餘 77 個傳遞依賴漏洞**：2026-08-14 已把能直接控制的修完（overrides 機制修復 + js-yaml / vite / nodemailer 升級，85 → 77）。剩下的皆深埋在 `prisma` / `@nestjs/terminus` 等上游相依樹中（含 2 個 critical：`shell-quote`、`websocket-driver`），**刻意不加 override 強制提版**——相容風險大於收益，模板穩定性優先。追蹤方式：定期 `pnpm audit`，待上游更新後再跑一次升級；若某漏洞出現實際可利用的攻擊面，再單獨評估。

### 功能

- **帳號鎖定管理 CRUD（`api-account-lock-management`，即上方 C6a）**：`add-security-ip-list-management` 的 Non-Goals 預留。後端 `GET/POST /api/admin/security/locks`、`DELETE …/:id`（已鎖帳號列表 + 分頁 + 搜尋 / 手動鎖定 / 手動解鎖）；前端 `/security/account-locks` 列表頁，sidebar「安全」group 加第三條。沿用 SUPERADMIN role gate。**衍生專案已實作，回補時以其為藍本**。
  **前置條件已滿足**（C2 已落地時效，手動解鎖不再是唯一途徑）。實作時注意兩點：(1) 列表的到期判定必須與 `AccountLockPort.checkLock()` 用同一份規則，自己再算一次會漂移成「列表說鎖著、但那個人登得進去」；(2) `APPLICATION_ACCOUNT_LOCK_ENABLED` **預設 false**，關閉時系統永遠不會產生鎖定紀錄，那一頁會永遠是空的——端點要把開關狀態一起回傳，畫面在關閉時明講「不會有」而非「目前沒有」。

### 技術債（外部相依卡住，延後）

> **處理原則**：卡在上游生態，不是本專案能單方面解決的。改動範圍大且會動搖 build baseline，要動請另開 change 並先確認條件已滿足，不要夾帶在功能開發裡。

- **`moduleResolution: node`（node10）遷移 `nodenext`**：TS 7.0 會移除 node10。**現狀處置（2026-07-14）**：api 已對齊到 TS 6.0.2（與 web / 編輯器同版），`tsconfig.json` 加 `ignoreDeprecations: "6.0"` 消音 + `rootDir: "."`（TS 6 起 `TS5011` 要求明示，否則 ts-jest 全掛）。真解 `nodenext` **實測 TS 5.9 與 6 皆爆 124 個 `TS1272`**——NestJS 裝飾器 metadata 要求 `@Body()` DTO 用 `import type`，但注入的 service 不能改否則 DI 壞掉，與 TS 版本無關、卡在 NestJS 上游。**條件**：等 NestJS 改善 nodenext 支援；TS 7 移除 node10 時消音會失效，屆時強制處理。

---

## 已完成

### 2026-08-16 — 第三輪審查 4 項修復 + spec 補登

依 `pr/2026-08-16-22-30-project-review.md`。本輪**三輪來第一個「原本就存在、與修復無關」**的問題。

**附件端點完全沒有授權（IDOR）**：`AttachmentController` 兩支端點零裝飾器，`uploadedBy` 有寫入、有索引、就是沒被讀——任何已登入者（含零權限帳號）可刪任何附件，連同實體檔案，不可逆、預設無稽核。四層修復：新增 `BACKEND:ATTACHMENT:EDIT` → 兩支端點標 `@Permissions` → `DeleteAttachmentService` 補擁有者檢查（非上傳者僅 SUPERADMIN）→ 單元 3 條 + e2e 3 條。**權限碼擋不住「有資格的 A 刪掉 B 的附件」**，附件 ID 隨上傳回應外流。

**補第一條「檢查應存在而不存在」的守則**：既有授權守則檢查的是「有標註的標對了」，漏洞出在「沒標的」。該 controller 通過了當時全部 18 支守則——每一條它都遵守，只是少了沒有規則要求它有的東西。新守則反向驗證時精準命中。

**purge 的 raw SQL 零測試**：第二輪把 `deleteMany` 換成手寫 SQL，換掉了 Prisma 的型別保護。補單元（迴圈）+ e2e（對真 DB，含跨批 6000 筆）——後者是唯一會在欄位改名／Prisma 升級時亮紅燈的。

**「驗過的 MIME」名不副實**：白名單比對的是 client 宣告值，不驗內容。註解改成事實，並補 `sniffMime` magic byte 檢查（5 種類型、無新依賴）。原本只靠 `nosniff` 緩解，而 `STORAGE_DRIVER=s3` 時那道 header 不在路徑上。

**spec 補登（`add-guardrail-and-container-specs`）**：`openspec/specs/` 落後實作——guardrails 停在 22 條需求（實際 19 支/61 項）、容器化零覆蓋，且我這幾輪直接改 master spec 繞過了 delta 流程。開追認 change 走完整流程，補 10 條守則需求 + 新能力 `platform-container-dev`。順帶補實兩支 master spec 掛了三個月的 `TBD` Purpose，並把 archive 兩個動詞離群值改名（16 個全部合規）。

**護欄 19 支 / 61 項。**

**本輪暴露的缺口**：change 命名沒有守則檢查——本 change 初始命名用了不在白名單的 `record-`，靠人工發現。

### 2026-08-16 — 第二輪審查 7 項修復 + 整套容器化

依 `pr/2026-08-16-21-50-project-review.md`。本輪問題的形狀與上輪不同——**全部落在「兩個各自正確的決定之間的接縫」**，而非功能內部。

**舊格式黑名單被當成「不在黑名單」**：上輪把 `isBlacklisted`（boolean）改成 `getBlacklistReason`（reason）時，adapter 把無法辨識的值壓成 `null`。註解意圖是「少撤銷」，但呼叫端把 `null` 當成沒進過黑名單，**連 throw 都跳過**——部署當下所有既存的已登出 / 已輪替 refresh token 在剩餘 TTL 內（預設 7 天）全部復活。修法是 port 加第三個狀態 `'unknown'`，service 一行未改。**bug 在 adapter 的翻譯層，service 邏輯從頭到尾都是對的**，所以 service 層測試怎麼寫都抓不到，補的是 adapter 層測試。

**Redis 已是硬相依但文件還在承諾降級**：節流與黑名單都改 fail-closed 後，`JwtAuthGuard` 內「Redis 掛掉就降級查 DB」那段變成永遠到不了的死碼（同一個 `client.isOpen`，前面已 throw 503），三處文件也還寫著「選填」「服務不中斷」。已刪死碼、改寫文件為「Redis 是硬相依」。

**日誌清理改分批**：單一 `deleteMany` 本身就是一個交易，對累積數百萬列的部署，第一次執行會長時間持鎖——防止資料庫爆掉的機制自己造成事故。改為每批 5000、批間讓出 100ms，對真 DB 實測 12000 筆 / 299ms。

**其餘**：`docker/api.container.env` 註解指向已刪除的 `compose.app.yml` 與 `pnpm app:up`；`Dockerfile` 宣稱「映像單獨也能跑」但 `.dockerignore` 排除了 4 支守則讀的路徑（改為據實說明）；production target 的非 root 提醒；MySQL healthcheck 拿掉命令列密碼。

**整套容器化**：三份 compose 併為一份 `compose.yml`，`docker compose up -d` 起 api + web + mysql + redis，前後端都支援熱重載。過程踩到六個坑（Node 版本看 `packageManager` 不是 `engines`、`node_modules` 五處遮罩、host `.env` 洩漏、`nest start --watch` 換不掉行程、`deleteOutDir` 空窗、`up` 撞 pnpm 內建別名），全部寫進 `tooling.md`。

**護欄 18 支 / 58 項 → 18 支 / 59 項**：`compose-files.spec.ts` 加一條——docker 相關檔案提到的 `pnpm <script>` 必須存在，正是為了擋「改名後註解沒跟上」。

### 2026-08-16 — 專案審查 12 項問題修復（review report 追蹤）

依 `pr/2026-08-16-18-30-project-review.md` 分四批處理，每批附帶對應守則——**報告自己的結論是「高槓桿投資不是修這 12 個問題，而是把其中 3 個變成守則」**，實作時把這點放大成每批都做。

** `newPassword` 明文寫進 system_logs**：`sanitize` 的敏感鍵是精確清單，`password` 有、`newPassword` 沒有。改成子字串比對一次收斂整類變形。查詢參數維持精確比對——子字串會讓 `key` 吃掉 `keyword`、`name` 吃掉所有過濾條件，而 URL 不帶憑證，過度遮蔽只損失除錯價值。

** 安全與正確性四項**：黑名單值改存原因（`rotated` / `logout`），重用偵測只對前者連坐撤銷——原本正常登出併發請求會踢掉使用者所有裝置；節流改預設 fail-closed 並加 `THROTTLE_FAIL_OPEN` 開關；ZADD member 改唯一值（原本用時間戳當 member，同毫秒請求併成一筆導致計數系統性低估）；`JwtAuthGuard` 的快取解析包 try/catch（`safeParse` 不保護 JSON 語法錯誤，壞快取會讓全域 guard 拋出、所有已登入請求同時 500）。

** 授權 guard 全域化**：`RolesGuard` / `PermissionsGuard` 升為 `APP_GUARD`。兩者本來就「無裝飾器即放行」，全域化行為等價但消滅「漏掛 = 沉默授權繞過」整類 bug。已用探針證明：拿掉 controller 的 `@UseGuards` 後 e2e 仍全過，代表全域註冊確實在執行授權。

** 日誌表**：補 7 個索引（migration `20260816200000_add_log_indexes`，已於 2026-08-16 執行）+ `LogRetentionScheduler` 保留排程。**排程預設開啟**而非報告建議的「文件寫明開啟 flag 前要先做保留策略」——後者把責任推給讀文件的人，而這是模板。兩種失效的代價不對稱：沒有保留策略會無界成長，多刪沒人讀的 90 天前日誌幾乎無損失。

** 清理**：PermissionsGuard 註解的日文新字體改為「權」；密碼到期改用新增的 `addMonths`（`setMonth` 遇月底溢位，1/31 加 1 月得到 3/2）；登入時帳號不存在仍跑一次 bcrypt 抹平時間差；`frontend.md` 記錄 localStorage token × 無 CSP 的取捨。`LoginService` 依報告建議不拆。

**護欄 11 支/32 項 → 18 支/58 項**，本輪新增：sanitize 覆蓋、全域 guard 註冊與順序、繁體中文掃描。

### 2026-08-16 — openspec 慣例整頓與 path alias 導入

**openspec 格式與命名**：fork 出專案本地 schema（`openspec/schemas/spec-driven-custom/`），把 spec / tasks 的格式規範放進 `instruction`，由 `openspec instructions` 直接餵給 AI，而不是寫在文件裡等自律。能力名稱定為 `api-` / `ui-` / `platform-` 三類前綴，13 支 spec 依此改名（`frontend-admin` → `platform-frontend-conventions`，因原名對不上內容；`member-role-options-api` 併入 `api-member-management`）。

**spec 從紀錄變成契約**：`CLAUDE.md` 早就要求 API spec 要寫請求 / 回應，但實際 13 支 spec **一個 JSON 區塊都沒有**——規則沒有執行路徑。補齊後 5 支 `api-*` 涵蓋全部 32 個 admin endpoint；其中 auth（6 支）與 attachment（2 支）原本零覆蓋。

**path alias 導入**：舊結論（2026-07-15）說 `nest build` 不改寫 alias、必須靠 tsc-alias 或 SWC，兩者都有硬傷。**實測相反**——@nestjs/cli 11 的 tsc builder 編譯時就改寫，`dist/` 內零 `@app/`、`node dist/main` 完整啟動。tsc-alias 與 SWC 都不需要，那個「兩個 watch 賽跑」的延後理由整個不存在。實際成本只有 13 行設定（tsconfig `paths`、三份 jest `moduleNameMapper`、9 支 ts-node 加 `-r tsconfig-paths/register`）。183 處 4 層以上的 import 已轉換，eslint 擋新增。

**文件與目錄**：`project.md` 905 行拆成索引 118 行 + `openspec/project/` 七支主題檔；`apps/api/test/` 由 16 項平鋪整成 `e2e` / `setup` / `helpers` / `architecture` 四目錄。

**順帶修掉三處實作與文件不一致**：`forgot-password` / `reset-password` 的 swagger 寫 `200` + `data.message`，實作是 `204` 無 body，且 401 用了根本不存在於 `ResponseCodes` 的 `INVALID_RESET_TOKEN`（錯的型別已流進 api-client）；舊 security spec 誤述新增 IP 為唯一鍵衝突，實作是 upsert；`testing.md` 的規則表停在 5 條（實際 14 支）且列了不存在的 `global-teardown.ts`。

**護欄 11 支 / 32 項 → 14 支 / 48 項**，新增：openspec schema 執行路徑、spec 命名與格式、`project.md` 連結完整性、swagger 成功狀態碼、e2e spec 位置、opsx 指令維持薄殼。

### 2026-08-16 — 補守剩餘的 Hard Rules

上一項標註強制方式後浮現「7 條純靠自律」的清單。盤點後只有三條屬「程式碼約束」可機器守，全部補上（現況零違規、零豁免）：

- **DTO 一律 z.infer**：同時查「有 z.infer」與「無手寫 class/interface」——只查前者不夠，一個檔案可以兩者並存而實際用手寫的那個。
- **e2e 不得 mock DB**：除了禁 `overrideProvider(PrismaService)`，也禁 `test-app.ts` **提供** mock 入口——留著入口等於官方認可的繞道。順手移除標了 `@deprecated ... 待轉完移除` 但條件早已滿足的 `TestAppOverrides.prisma`。
- **CommonJS baseline**：root 與 apps/api 不得設 `type: module`（apps/web 是設計上的例外，寫進規則範圍而非豁免清單）。

其餘四條維持自律是對的：兩條需語意判斷（訊息是否洩漏敏感資訊、of()/trusted() 用錯路徑），兩條是行為而非程式碼（不自行起 dev server、不改 .env）。**Hard Rules 的機器守覆蓋率 5/12 → 8/12**，架構規則 24 → 32。

### 2026-08-16 — AI 工程設置升級（借鏡 times-account-backend）

對方的 AI 設置比本專案成熟一個世代，四項全部落地：

- **hook 抽成 `.agents/hooks/*.sh`**：settings.json 從長串 shell 字串變成純註冊；邏輯放工具無關位置（git hook / Codex 也能呼叫同一支），根目錄以 `${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel)}` 推斷。同步加 `hook-scripts.spec.ts` 做 `bash -n` 檢查——否則只是把「不在檢查範圍的設定」換個地方放。
- **Stop hook 補上連動守門**（原本 `"Stop": []` 是空的）：改了 swagger 來源 yaml 但產物沒重生就 `exit 2` 擋下。判斷刻意保守（只有「來源變更且兩產物皆未變更」才擋）——誤判會讓人無法收工。
- **`pnpm verify:ci` 本機重現 CI**：compose 起 MySQL 9（healthcheck + tmpfs），實測 144 tests / 62 秒。順帶確認 GitLab services 不支援 compose 的 healthcheck 語法，CI 端的手動等待迴圈是必要的。
- **`AGENTS.md` symlink + Hard Rules 標註強制方式**：標註後浮現一個事實——**12 條 Hard Rules 只有 5 條有機器守，7 條純靠自律**。

架構規則 20 → 24，master spec 的 platform-engineering-guardrails 16 → 19 條。


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
