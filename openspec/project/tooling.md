# AI 工具、CI 與指令參考

> .agents/hooks 的設計、兩套 CI（GitLab / GitHub Actions）各 job 職責，以及完整的 per-workspace 指令參考。

> 本檔為 `openspec/project.md` 的一部分，導覽見該檔。

---

## AI 工具設定（`.agents/`）

hook 的**邏輯**放在工具無關的 `.agents/hooks/*.sh`，各家 AI 的設定只負責「註冊」呼叫。

```
.agents/hooks/
├── check-typescript.sh          # PostToolUse：對剛改的單一 .ts 跑該 workspace 的 eslint
├── check-prisma-schema.sh       # PostToolUse：schema.prisma 異動 → 提醒 migrate / generate / 連動檔
├── check-domain-exception.sh    # PostToolUse：新增 exception → 提醒補 code + 訊息（成對）
└── check-swagger-artifacts.sh   # Stop：改了來源 yaml 但產物沒重生 → exit 2 擋下
```

為什麼不放 `.claude/`：這些檢查（產物是否過期、schema 是否要 migrate）本質上與 AI 工具無關，git pre-commit 或其他 agent 也該能用。script 以 `${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel)}` 取得專案根目錄，不相依特定工具。

**新增 hook 的作法**：寫 `.agents/hooks/<name>.sh`（檔頭註明用途 / 觸發時機 / exit code 語意）→ 在 `.claude/settings.json` 註冊 → 架構測試 `hook-scripts.spec.ts` 會自動以 `bash -n` 檢查語法，並驗證「settings.json 註冊的 script 都存在」。

**exit code 語意**：`0` 通過；`2` 在 Stop hook 代表阻止結束並把 stderr 回饋給 AI。用 `2` 要保守——誤判會讓人無法收工，判斷條件寧可漏判也不要誤擋。

`AGENTS.md` 是 `CLAUDE.md` 的 symlink，讓讀 `AGENTS.md` 慣例的工具（Codex 等）拿到同一份規則。

---

## CI（兩套並存，fork 後刪掉不用的那份）

模板同時提供 `.gitlab-ci.yml` 與 `.github/workflows/ci.yml`。**兩份跑同一組檢查**，
由 `ci-parity.spec.ts` 守著——**CI 設定的錯誤方式全是靜默的**：

| 漏掉什麼 | 症狀 |
| --- | --- |
| 用 `pnpm test` 而非 `test:cov` | 覆蓋率門檻**不執行**，數字掉了沒人知道 |
| 建置 job | path alias / decorator metadata 的錯誤延到合併後才爆 |
| e2e 的庫名不含 `test` | `globalSetup` 守門中止，job 紅得莫名其妙 |
| 資料庫大版本不同 | 「本機過、CI 掛」，而差異在版本不在程式碼 |

沒有一項會在設定寫錯的當下出聲，所以一致性交給機器。
**只留一份時守則自動放行**——那是 fork 後的預期行為。

刻意不做「單一真相 + 產生器」：兩個平台的表達力差異太大（GitLab 的 anchor 與
`extends`、GitHub 的 composite action），中介層要嘛表達力不足要嘛更複雜，
**而且多出一個沒有人熟悉的東西**——出事時要先看懂產生器。

### Job 對照

| 做什麼 | GitLab | GitHub | 對應本機指令 |
| --- | --- | --- | --- |
| 裝依賴 | `npm-install`（prepare stage） | composite action | `pnpm install` |
| 型別 / lint / 單元測試 + **覆蓋率門檻** + 架構守則 | `quality-check` | `quality` | `pnpm typecheck && pnpm lint && pnpm test:cov` |
| 對 `mysql:9` 跑完整 e2e | `e2e-test` | `e2e` | `pnpm --filter @app/api test:e2e` |
| Prisma generate + build（**需品質檢查通過**） | `prepare-production` | `build` | `pnpm build` |
| 清 cache | `cleanup` | 不需要（runner 一次性） | — |

GitHub 不需要獨立的裝依賴 job——`actions/cache` 加 composite action 已涵蓋；
GitLab 那個 job 存在是因為它的 cache 模型需要一個明確的產生者（`policy: pull-push`）。

**建置在 MR / PR 階段就跑**（兩邊皆然）：`nest build` / `vite build` 會抓到 path alias
解析、decorator metadata 與 emit 階段的錯誤，而 `tsc --noEmit` 抓不到。
只在推分支時建置等於「PR 是綠的，合併完 develop 才紅」。
它 `needs` 品質檢查，所以拉長的只有「品質已經通過」那條路徑。

> ⚠️ **CI 通過與否要擋住合併，需要平台端的設定，而那不在版控內。**
> GitLab 走 Merge Request 的 approval / pipeline 必須成功；
> GitHub 要在 Settings → Branches 把 `quality` 與 `e2e` 設為 required status checks。
> **GitHub 免費方案的私有 repo 甚至設不了**（branch protection 與 ruleset 皆回 403），
> 那時只有 job 相依（`build` needs `quality`）那一半成立，人為 merge 的那一半不成立。

### GitLab 的 stage 細節

`.gitlab-ci.yml` 的 stages：`prepare → quality → optimize → cleanup → pr_agent`。

**本機重現 CI 的測試環境**：`pnpm verify:ci` 以 `docker compose --profile verify` 起一個 MySQL 9 容器（healthcheck 等就緒、`tmpfs` 跑在記憶體）並執行 e2e，實測約 60 秒。定位是「測試環境重現」而非「pipeline 模擬」——runner 行為與 cache 命中仍只能在實際 pipeline 觀察。

### 容器化（單一 `compose.yml`）

四種用法靠「指定服務」與 profile 區分，不需要多份檔案：

| 指令 | 起什麼 | 用途 |
| --- | --- | --- |
| `pnpm docker:up` | api + web + mysql + redis + **nginx** | 整套跑在容器裡，原始碼 bind mount + 熱重載。**入口只有 nginx** |
| `pnpm docker:deps` | mysql + redis | 只要資料庫，api / web 跑在 host（3000 / 5173） |
| `pnpm verify:ci` | mysql-verify（`--profile verify`） | 重現 CI 的資料庫環境，測試在 host 跑 |
| `pnpm test:e2e:docker` | mysql-verify + e2e（`--profile e2e`） | 連測試也在容器裡跑 |

後兩者的收尾**只移除自己起的服務**（`rm -fsv`），不是 `down -v`——理由見下方「兩條 e2e 執行路徑」。

`mysql-verify` 獨立成一個服務而非共用開發用的那個，因為兩者對資料的要求相反：
開發要 named volume 重啟保留，驗證要 `tmpfs` 每次乾淨。它掛在 profile 底下，
平常的 `up` 不會啟動它。兩者與 CI 的 service 共用 `mysql:9` 同一條版本線，
避免「本機過、CI 掛」。

對外埠一律避開預設的 3306 / 6379（多數開發機已有一組資料庫在跑），
可用 repo 根目錄 `.env` 的 `APP_PROXY_PORT` / `DEV_DB_PORT` /
`DEV_REDIS_PORT` / `DEV_DB_PASSWORD` 覆寫。
容器模式只有 nginx 發布埠，因此沒有 `APP_API_PORT` / `APP_WEB_PORT`。

#### 容器化開發的六個非顯而易見之處

這些都是實測踩出來的，改 `compose.yml` 或 `Dockerfile` 前先看過：

1. **Node 版本看 `packageManager` 不是 `engines`**——pnpm 11 需要 Node ≥ 22.13，
   用 node:20 會在 `pnpm install` 當場失敗（缺 `node:sqlite` 內建模組）。
2. **`node_modules` 五個位置都要用 volume 蓋掉**——pnpm 的 workspace `node_modules`
   是指向根目錄 `.pnpm` store 的 symlink，漏任一個就會載到 host 的 macOS/arm64 產物
   （症狀：bcrypt 或 Prisma 引擎 invalid ELF header）。用具名 volume 而非匿名，
   否則 Docker Desktop 清單裡十個隨機 hash 無從辨識。
3. **host 的 `apps/api/.env` 會被 bind mount 帶進容器**，而 dotenv 不覆寫既有的
   `process.env`——等於「compose 沒設的都由開發者本機補」。用 `docker/api.container.env`
   遮掉。個人化設定改走 `apps/api/.env.container`（見下方「容器設定的四層優先序」），
   連線類變數則在 compose 釘死。
4. **api 不能用 `nest start --watch`**——重啟時舊行程還在跑 `enableShutdownHooks` 的
   優雅關閉（Prisma pool + Redis quit），新行程搶埠失敗直接死，症狀是**編譯成功但
   改動不生效**，log 完全正常。改為 `nest build --watch` + `node --watch` 兩段，
   並用 `nest-cli.docker.json` 關掉 `deleteOutDir`（否則 rebuild 清空 dist 的空窗期
   會讓 `node --watch` MODULE_NOT_FOUND 後放棄）。
5. **bind mount 不傳遞 inotify 事件**（macOS）——看 host 改動的 watch 必須輪詢：
   tsc 用 `TSC_WATCHFILE`、Vite 用 `server.watch.usePolling`。反過來，容器**自己**
   寫出的檔案（`dist`）事件是通的，不必輪詢。
6. **容器只綁 IPv4，`localhost` 在 macOS 優先解析 IPv6**——機器上若有別的服務綁在
   `::1:5173`，用 `localhost` 會連到它。文件一律寫 `127.0.0.1`。

**改了依賴後具名 volume 不會自動更新**：volume 只在第一次建立時從映像複製內容，
之後即使重建映像也沿用舊的。改 `package.json` / lockfile 後用 `pnpm docker:renew`
——它只砍 `node_modules` 的 volume 再重建，**不動 `mysql-data` / `redis-data`**。
`docker:reset`（`down -v`）會移除專案的**所有** volume 含資料庫，之後得重跑 `docker:init`。

要點：

- **兩個品質 job 在 Merge Request 就觸發**（不像 `prepare-production` 只認分支推送）—— MR 正是最該擋下問題的時機。
- `quality-check` 與 `e2e-test` 同 stage 平行執行；前者不需外部服務，多數問題數十秒內回報。
- e2e 的 DB 連線走 **job variables**，不在 CI 偽造 `.env`：`applyE2EDbEnv()` 以 dotenv 載入 `.env`，而 **dotenv 不覆寫既有 `process.env`**，因此 CI 供應的變數優先生效。
- `DB_TEST_DATABASE` 必須含 `test`，否則 e2e 的 globalSetup 守門會中止（防誤連 dev / prod）。
- `--no-verify` 可繞過兩支 husky hook，但繞不過 CI —— 這是把關的最後一道。

### 容器模式的單一入口

`pnpm docker:up` 起的是 **api / web / mysql / redis / nginx 五個服務，而只有 nginx 有對外埠**
（`${APP_PROXY_PORT:-8080}`）。路由表在 `docker/nginx/default.conf`：`/api` → api、`/` → web。

目的不是「有一個 nginx」，是讓開發時的拓撲與正式的單一埠部署一致：**同一個 origin**。
兩種拓撲不一樣的話，CORS、cookie 的 `SameSite`、以及 CSP 的分路徑判斷，
開發時走的都不是上線時那條路。保留 api / web 的埠會讓「同一個 origin」變成可選的，
而問題只在沒人走的那條路上出現——有守則（`compose-files.spec.ts`）擋著。

**api 服務必須同時設 `TRUST_PROXY: '1'`**。少了它 `request.ip` 會變成 nginx 的容器位址，
而三個功能同時靜默失效：

| 功能 | 壞掉的樣子 |
| --- | --- |
| IP 黑名單 | 擋不到真正的來源；一旦誤封就是封掉整個 nginx |
| 登入失敗計數 | 所有人算成同一個，第 N 次失敗把全部人擋掉 |
| 全域節流 | 100 次／分鐘變成**全站共用**一份額度 |

設 `'1'`（信任一跳）而非 `'true'`——後者會無條件採信偽造的 `X-Forwarded-For`。

要直連 api / web 請改跑 host 模式（`pnpm docker:deps` + `pnpm dev`，3000 / 5173）。
要分辨「代理壞了還是應用壞了」從代理容器內部打後端，比開一個 host 埠更精準
（它涵蓋了代理的網路路徑）：

```bash
docker compose exec nginx wget -qO- http://api:3000/api/health
```

### 容器設定的四層優先序

```
compose 的 environment  >  apps/api/.env.container  >  docker/api.container.env  >  envSchema 預設
```

| 來源 | 進版控 | 職責 |
| --- | --- | --- |
| compose 的 `environment` | ✅ | 連線類變數，**釘死**不可被覆寫（有守則盯著） |
| `apps/api/.env.container` | ❌ | 個人偏好，只影響自己這台 |
| `docker/api.container.env` | ✅ | 隊友共用的容器基準 |

連線類的判準是變數名以 `_HOST` / `_PORT` / `_URL` 結尾——它們的正確值由拓撲決定
（service 名稱），本機的值必然指向 `localhost` 而在容器裡連不到。
新增這類變數卻沒釘死時 `compose-files.spec.ts` 會紅。

> ⚠️ **`env_file` 不可指向 `apps/api/.env`。** compose 的 env 解析器比 dotenv 嚴格，
> 而解析失敗會讓**所有** `docker compose` 指令失效——連 `config` / `ps` / `down` 都跑不了。
> 實測踩到：`.env` 裡一行帶角括號的寄件者位址，對應用程式完全合法，
> 卻讓整個 compose 無法使用。因此個人覆寫用獨立的 `.env.container`。

### 兩條 e2e 執行路徑

| 指令 | 資料庫 | 測試在哪跑 | 用途 |
| --- | --- | --- | --- |
| `pnpm --filter @app/api test:e2e` | host 的 `.env` 指向的 | host | 最快，改一行就重跑 |
| `pnpm verify:ci` | 容器（tmpfs） | host | 重現 CI 的**資料庫環境** |
| `pnpm test:e2e:docker` | 容器（tmpfs） | **容器** | 密封，不依賴 host 的 Node / 套件 / `.env` |

> ⚠️ **臨時容器的收尾絕不可用 `docker compose down -v`。** `--profile` 只影響
> 「哪些服務被視為啟用」，**不限制 `down` 的作用範圍**——`-v` 會移除 compose 檔宣告的
> **所有** named volume（`mysql-data`、`redis-data` 與五個 `node_modules`）。
> 症狀是下次啟動「找不到 `.prisma/client`」或「資料庫是空的」，指不到是收尾造成的。
> 用 `rm -fsv <服務>` 只收自己起的那個。`down -v` 保留給 `pnpm docker:reset`。

### 本機的兩層 git hook

| Hook | 執行內容 | 大約耗時 | 擋的是 |
| --- | --- | --- | --- |
| `.husky/pre-commit` | `lint-staged`（只檢查改動的檔） | 秒級 | 明顯的格式 / lint 問題 |
| `.husky/pre-push` | `pnpm typecheck && pnpm lint && pnpm test:cov` | 約一分鐘 | 「本機沒跑就推」 |

`pre-push` 與 CI 品質 job 跑同一條鏈，讓問題在推之前就紅，而不是等 review 開始後才由 CI 報錯。

**完整鏈刻意不放進 `pre-commit`**：一分鐘乘上一天的 commit 次數，結果是所有人開始用
`--no-verify`，連 lint 都跟著失效。把關太嚴會讓整道關卡被繞過，比只擋一半更糟。

兩支都以同一段 nvm PATH 補救開頭（`pnpm` 不在 PATH 時載入 `nvm.sh`）——
nvm 用戶在某些 git / 終端組合下 PATH 不含 nvm 路徑。

> ⚠️ **hook 沒被觸發時 git 不會報錯，commit / push 照常成功、只是什麼都沒檢查。**
> husky v9 是把 git 的 hook 目錄指向 `.husky/_`（由 `package.json` 的 `prepare` 在
> `pnpm install` 時設定），而 `.husky/_/` 整個不進版控。診斷依據是
> `git config --get core.hooksPath` **有沒有值**，不是 `.husky/` 有沒有檔案；
> 沒有值就跑一次 `pnpm install`。`--ignore-scripts` 安裝或 `CI=true` 環境都會讓它沒被註冊。
>
> 這一點沒有守則擋著，也擋不了——失效狀態在本機的 `.git/config` 裡，版控看不到。
> 曾考慮把 `hook-scripts.spec.ts` 的 `bash -n` 擴到 `.husky/*`，**否決**：
> 那守的是語法，而實際的失效模式是根本沒被觸發，加了只會製造「有被守著」的錯覺。
- **覆蓋率門檻只有 `test:cov` 會執行**（`test` 不帶 coverage，供開發時快速回饋）。兩個 workspace 都設有門檻：api 70/60/70/70、web 75/75/60/75；新增設有門檻的 workspace 時**必須提供 `test:cov`**，否則會被 `pnpm -r test:cov` 靜默略過。
- `apps/api` 的 `test:cov` 刻意串接架構測試（`jest --coverage && jest --config test/jest.arch.config.js`）—— 只寫 `jest --coverage` 會讓 CI 換用 `test:cov` 後靜默漏掉整組架構守則。

> **用第三個平台的專案**（不是 GitLab 也不是 GitHub）：上方「Job 對照」表的「對應本機指令」欄即為等價檢查，請在自己的平台上照樣執行；否則所有架構守則與測試都只在開發者本機生效。此時把兩份設定都刪掉即可，`ci-parity.spec.ts` 在找不到任何 CI 設定時會失敗並提醒你——那是刻意的，「完全沒有 CI」與「刪掉一份」是兩回事。

---

## 完整指令參考

套件管理：**pnpm 11+**（root 透過 `packageManager` 欄位 + corepack 自動鎖版本）。

### Root 跨 workspace

```bash
pnpm install                 # 一次裝完所有 workspace 依賴
pnpm dev                     # concurrently 啟動 apps/api + apps/web
pnpm build                   # 依序 build apps/api → apps/web（api-client source-first，無 build）
pnpm typecheck               # 三個 workspace 全部 tsc --noEmit
pnpm lint                    # 三個 workspace 全部 eslint
pnpm test                    # 跑各 workspace 的 test script

# 容器化（單一 compose.yml，詳見上方「容器化」）
pnpm docker:up               # 整套跑在容器裡（api + web + mysql + redis + nginx；入口只有 nginx）
pnpm docker:init             # 容器內建表 + seed（首次一次）
pnpm docker:logs             # 跟蹤 api / web
pnpm docker:deps             # 只起 mysql + redis，api / web 跑在 host
pnpm docker:down             # 停止，資料保留
pnpm docker:renew            # 改依賴後：只重建 node_modules volume，資料保留
pnpm docker:reset            # 刪除所有 volume（含 DB / Redis 資料）
pnpm docker:prune            # 清 builder 快取與懸空映像（磁碟不夠時用）
pnpm verify:ci               # 重現 CI 的資料庫環境，測試在 host 跑
pnpm test:e2e:docker         # 連測試也在容器裡跑（密封，不依賴 host 環境）
```

### 後端 `apps/api`

```bash
# 開發
pnpm --filter @app/api dev               # watch 模式
pnpm --filter @app/api start:debug       # debug + watch
pnpm --filter @app/api build             # nest build → apps/api/dist
pnpm --filter @app/api start:prod        # 啟動 build 產物

# 程式碼品質
pnpm --filter @app/api lint
pnpm --filter @app/api lint:fix
pnpm --filter @app/api format

# 測試
pnpm --filter @app/api test              # 單元測試 (*.spec.ts)
pnpm --filter @app/api test:watch
pnpm --filter @app/api test:cov
pnpm --filter @app/api test:e2e          # E2E（需 MySQL + Redis）

# 資料庫（一律在 apps/api 工作目錄執行）
pnpm --filter @app/api db:create
pnpm --filter @app/api db:drop
pnpm --filter @app/api db:migrate              # 開發環境（含 generate）
pnpm --filter @app/api db:migrate:deploy       # 生產環境部署
pnpm --filter @app/api db:generate             # 僅產生 Prisma client（搬 monorepo 後第一次 typecheck 必跑）
pnpm --filter @app/api db:seed
pnpm --filter @app/api db:studio

# Swagger
pnpm --filter @app/api swagger:bundle    # 合併分檔 yaml → openapi.bundle.yaml
```

### 前端 `apps/web`

```bash
pnpm --filter @app/web dev               # Vite dev server (5173, proxy /api → :3000)
pnpm --filter @app/web build             # tsc -b && vite build → apps/web/dist
pnpm --filter @app/web typecheck
pnpm --filter @app/web lint
pnpm --filter @app/web preview           # 預覽生產 build

# 加 shadcn 元件（要在 apps/web 工作目錄）
cd apps/web && pnpm dlx shadcn@latest add <component>
```

### API client `packages/api-client`

```bash
# 後端 controller / Swagger 改動後同步型別
pnpm --filter @app/api swagger:bundle
pnpm --filter @app/api-client generate   # openapi.bundle.yaml → src/schema.ts

pnpm --filter @app/api-client typecheck  # source-first，無 build
```
