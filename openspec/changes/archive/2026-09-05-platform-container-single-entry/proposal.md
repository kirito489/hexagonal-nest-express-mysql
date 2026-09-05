## Why

**`pnpm verify:ci` 每跑一次就清掉開發環境。** `scripts/verify-ci.sh` 的收尾寫著 `docker compose --profile verify down -v`——`--profile` 只影響「哪些服務被視為啟用」，**不限制 `down` 的作用範圍**，而 `-v` 移除的是 compose 檔裡宣告的**所有** named volume：`mysql-data`、`redis-data`，以及五個 `node_modules` volume。症狀是下一次啟動時「找不到 `.prisma/client`」或「資料庫是空的」，**完全指不到是那一行造成的**。這條已在 C1 寫進 `lessons.md` 並標明「模板現在正踩著」，本 change 修掉它。

其餘三項是拓撲層面的補強，都來自衍生專案的實戰：

**開發與正式的拓撲不一致。** 目前 api 與 web 各自發布對外埠（3000 / 5173），而正式是單一埠部署（`ServeStaticModule` 讓 API 一併服務 `apps/web/dist`）。兩種拓撲不一樣的話，**CORS、cookie 的 `SameSite`、以及 CSP 的分路徑判斷，開發時走的都不是上線時那條路**——C2 剛把 CSP 改成分路徑，而那個行為在目前的開發拓撲下根本不會被走到。

**容器完全讀不到本機設定。** `docker/api.container.env` 遮蔽了 host 的 `apps/api/.env`，理由是「本機的連線類變數會打壞容器」。方向對，但手段過重：連「想給自己開個 `LOG_LEVEL=debug`」都做不到。真正該防的只有連線類，而那個防護應該是 compose 的 `environment`（優先序最高，host 蓋不掉），不是整份遮蔽。

**e2e 只能在 host 跑。** `pnpm --filter @app/api test:e2e` 依賴 host 的 Node、套件與 `.env`。CI 上跑的是另一套環境，而「本機綠、CI 紅」的往返只能靠猜。

## What Changes

- **修復**：`verify-ci.sh` 的收尾改用 `docker compose rm -fsv <服務>`，只收自己起的那個容器
- 新增 nginx 反向代理（`docker/nginx/default.conf` + compose 服務），容器模式的**唯一入口**；api 與 web 移除對外埠
- api 服務設 `TRUST_PROXY: '1'`——**與 nginx 必須一起出現**，少了它，IP 黑名單、登入失敗計數、全域節流三個功能會同時靜默失效
- 容器改為 `env_file: ./apps/api/.env`（`required: false`）讀本機設定；`docker/api.container.env` 的職責改為「隊友共用的容器基準」；連線類變數（`*_HOST` / `*_PORT` / `*_URL`）在 compose `environment` 釘死
- 新增容器化 e2e：compose 的 `e2e` 服務（`--profile e2e`）+ `scripts/e2e-docker.sh` + `pnpm test:e2e:docker`
- 新增 `pnpm docker:prune`（清 builder 與懸空映像）
- `compose-files.spec.ts` 擴充三條：`docker/` 的掃描改遞迴（加了 `docker/nginx/` 子目錄）、api 與 web 不得宣告對外埠、連線類環境變數必須釘死或列入豁免

不做的事：把 host 模式（`pnpm docker:deps` + `pnpm dev`）拿掉——它仍是最快的開發迴圈，且是「要直連 api / web」時的唯一途徑。正式環境的 nginx 設定（本檔是 dev 的單一入口樣板，抄去正式前要處理 `/api/metrics` 與 `/api/*/docs` 的暴露）。

## Capabilities

### Modified Capabilities

- `platform-container-dev`：新增「容器模式的單一入口」「容器設定的優先序與連線類變數釘死」「容器化 e2e」三組需求；並修正「臨時容器的清理」——原本沒有規範收尾方式，於是實作用了會誤刪全專案 volume 的 `down -v`。
- `platform-engineering-guardrails`：新增三條守則需求（compose 檔掃描須遞迴、單一入口不得被繞過、連線類變數須釘死）。

## Impact

- **新增檔案**：`docker/nginx/default.conf`、`scripts/e2e-docker.sh`
- **修改檔案**：`compose.yml`、`scripts/verify-ci.sh`、`docker/api.container.env`、`package.json`、`apps/api/test/architecture/compose-files.spec.ts`、`allowlist.ts`、`README.md`、`openspec/project/tooling.md`、`openspec/project/backend-runtime.md`
- **無 migration、無 envSchema 變更**
- **行為變更需知會**：容器模式的存取位址由 `localhost:3000` / `localhost:5173` 改為 **`localhost:8080` 單一入口**（`APP_PROXY_PORT` 可覆寫）。要直連請改跑 host 模式
- **`verify:ci` 不再清掉開發 volume**——這是修復，不是破壞
