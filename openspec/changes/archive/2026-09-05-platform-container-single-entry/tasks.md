> 每一塊（`##` 標題）須能獨立通過驗證鏈：`pnpm typecheck && pnpm lint && pnpm test`。
> 本 change **不動任何 production TypeScript**，因此不需要 `test:e2e` 的既有路徑驗證，
> 也不需要 `pnpm build`。塊 4 新增的容器化 e2e 本身就是驗證。
> 全部完成後給**一個** commit 指令，由使用者手動執行。
>
> **塊的依賴**：
> - **塊 1（修 `verify-ci.sh`）先做**，它是本 change 唯一的缺陷修復，且與其餘塊無關。
>   放最前面是為了讓後續塊在跑容器指令時不會再清掉開發環境。
> - 塊 2（nginx 單一入口）與塊 3（容器吃本機 `.env`）互相獨立。
> - 塊 4（容器化 e2e）用到塊 1 的收尾寫法。
> - **塊 5（守則）必須排在 2～4 之後**——三條守則各自對應那些塊的產物，
>   提前寫會是紅的（而那不是「抓到缺陷」，只是順序錯了）。
>
> ⚠️ **實機驗證是本 change 的主要驗證手段**，不是單元測試。
> 容器拓撲的正確性只有真的跑起來才知道，而 `pnpm test` 對它一無所知。

## 1. 修掉 `verify:ci` 會清掉開發環境的缺陷

- [x] 1.1 `scripts/verify-ci.sh` 的 `cleanup()` 由 `docker compose --profile verify down -v` 改為 `docker compose --profile verify rm -fsv mysql-verify`
- [x] 1.2 註解寫明**為何不能用 `down -v`**：`--profile` 不限制 `down` 的作用範圍，`-v` 會移除專案的所有 named volume（含 `mysql-data` / `redis-data` 與五個 `node_modules`）
- [x] 1.3 埠改為向 compose 查詢（`docker compose --profile verify port mysql-verify 3306`），不寫死 `13306`
- [x] 1.4 **實機驗證（兩個方向都做了）**：
      - 修好之後：起 `mysql-data` / `redis-data` → 跑 `pnpm verify:ci`（e2e 165 全過、埠正確查到 13306）→ 兩個 volume **完好無損**
      - **並實際示範舊寫法的破壞性**：跑一次 `docker compose --profile verify down -v`，輸出直接顯示 `Volume hexagonal-nest_mysql-data Removed` / `redis-data Removed`——那兩個 volume 與 verify profile 毫無關係。缺陷證實，不是推論

## 2. nginx 單一入口

- [x] 2.1 新增 `docker/nginx/default.conf`：`/api` → api、`/` → web。**不要加 `/socket.io` 段**——模板沒有 WS 層，加一段沒有對應服務的路由是為不存在的東西建設施
- [x] 2.2 設定檔 MUST NOT 加任何安全標頭。註解寫明理由：後端的 CSP 是分路徑的，在這裡加一份會把整個判斷蓋掉**而且兩邊都不會失敗**
- [x] 2.3 註解寫明「抄去正式環境之前」要處理 `/api/metrics` 與 `/api/*/docs` 的暴露——本檔是 dev 樣板，而樣板會被抄
- [x] 2.4 `Connection` 用 `map $http_upgrade $connection_upgrade`，**不要寫死 `upgrade`**：寫死的話每個普通 HTTP 請求都會帶著它，上游會把連線標成不可重用。現在沒有症狀（沒有 keepalive），但哪天有人加 `keepalive` 它會**安靜地不生效**
- [x] 2.5 compose 新增 `nginx` 服務，`depends_on` api 為 `service_healthy`、web 為 `service_started`
- [x] 2.6 api 服務加 healthcheck（打自己的 `/api/health`）。**不是檢查行程或埠**——容器啟動與「可以接請求」之間有實質空窗，而 `up --wait` 對沒有 healthcheck 的服務只等到 running
- [x] 2.7 `start_period` 要寫明來歷：量到的部分寫出量測條件，沒量到的明說是餘裕並寫出代價（應用真的壞掉時 `--wait` 要等滿才會失敗）
- [x] 2.8 移除 api 與 web 的 `ports`；註解寫明「要直連請改跑 host 模式」與「怎麼分辨代理壞了還是應用壞了」
- [x] 2.9 api 服務加 `TRUST_PROXY: '1'`，註解寫明少了它會有哪三個功能同時靜默失效
- [x] 2.10 **實機驗證**：`pnpm docker:down && pnpm docker:up` → `curl localhost:8080/api/health` 得到 200 → 瀏覽器開 `localhost:8080` 看得到前端 → `curl localhost:3000` **必須連不上**（埠已移除）

## 3. 容器吃本機 `.env`，連線類釘死

- [x] 3.1 ⚠️ **改成指向 `./apps/api/.env.container` 而非 `./apps/api/.env`——實測後改的**。
      原設計會讓 **compose 整個無法使用**：它的 env 解析器比 dotenv 嚴格，
      而 `env_file` 解析失敗會讓所有 `docker compose` 指令失效（連 `config` / `ps` / `down` 都跑不了）。
      本機 `.env` 有一行 `... <noreply@example.com>`，對應用程式完全合法卻讓 compose 直接爆掉。
      **代價遠大於它解決的問題**，改用獨立檔（已加進 `.gitignore`），design 的 D5 與 spec 已同步
- [x] 3.2 `environment` 補齊所有連線類變數（`*_HOST` / `*_PORT` / `*_URL`），確保 host 的值蓋不掉
- [x] 3.3 改寫 `docker/api.container.env` 的檔頭說明：職責由「防止本機設定進來」改為「隊友共用的容器基準」，並寫出四層優先序
- [x] 3.4 **實機驗證**：`.env.container` 同時寫 `LOG_LEVEL=debug` 與假的 `REDIS_HOST=nowhere-that-exists`
      → 容器內實際值是 `LOG_LEVEL=debug`、`REDIS_HOST=redis`。**兩件事同時成立**：個人覆寫生效、連線類蓋不掉
      —— ⚠️ 第一次驗證用 `docker compose restart` 得到 `LOG_LEVEL=undefined`，
      因為 **restart 不重讀設定**（它只重啟既有容器）。要用 `up -d` 重建才會套用新的 `env_file`

## 4. 容器化 e2e

- [x] 4.1 compose 新增 `e2e` 服務（`--profile e2e`、`restart: 'no'`），連 `mysql-verify` 而非 `127.0.0.1`
- [x] 4.2 command 以 `db:generate` 開頭；註解寫明理由（Prisma client 在具名 volume 裡，新建的 volume 不會有它）
- [x] 4.3 `DB_TEST_DATABASE` **必須給**——`applyE2EDbEnv()` 會檢查它存在且名稱含 `test`
- [x] 4.4 新增 `scripts/e2e-docker.sh`：起 `mysql-verify`（等 healthcheck）→ `run --rm e2e` → trap 收尾。**收尾用 `rm -fsv`，不是 `down -v`**（同塊 1）
- [x] 4.5 `package.json` 加 `test:e2e:docker` 與 `docker:prune`
- [x] 4.6 **實機驗證**：`pnpm test:e2e:docker` → 容器內 12 suites / 165 tests 全綠（7.3 秒），
      volume 只**新增** 5 個 `node_modules`、沒有任何被移除，容器零殘留。
      改壞一條 health 斷言 → `exit=1`、`1 failed / 164 passed`、容器仍被收乾淨
      —— ⚠️ 第一次跑失敗：`service "e2e" depends on undefined service "mysql-verify"`。
      `mysql-verify` 只掛在 `verify` profile，用 `--profile e2e` 啟動時它不在專案裡。
      修法是讓它同屬兩個 profile（`profiles: [verify, e2e]`），比每次都要記得帶兩個旗標穩健。
      **那個錯誤訊息指向 `depends_on`，不會讓人想到是 profile**

## 5. 守則（必須排在 2～4 之後）

- [x] 5.1 `compose-files.spec.ts` 的 `docker/` 掃描改為遞迴（`filesUnder`）。
      **改之前先確認舊寫法真的壞了**：加入 `docker/nginx/` 後跑守則，兩條測試以 `EISDIR: illegal operation on a directory` 紅——
      而那個訊息完全指不到原因。這是 D7 的實證，不是推測
- [x] 5.2 新增「api 與 web 不得宣告對外埠」：用服務名稱表述而非白名單；以 nginx 當**正對照組**（它一定有 ports，該斷言為 false 即代表解析失效）；服務名找不到要失敗
- [x] 5.3 新增「連線類環境變數必須釘死」：`envSchema` 的 `*_HOST` / `*_PORT` / `*_URL` 都要在 compose 的 api `environment` 出現，或列入具名豁免（附理由、且過期要失敗）
- [x] 5.4 三條都加「掃描數 > 0」的自我檢查
- [x] 5.5 **反向驗證**：(a) 替 api 加回 `ports:` → 單一入口那條紅；(b) 從 `environment` 拿掉 `REDIS_HOST` → 釘死那條紅並指出變數名；(c) 在 `docker/` 建一個空子目錄放檔案 → 遞迴那條仍綠（改回舊寫法會 `EISDIR`）。逐一還原
- [x] 5.6 `testing.md` 的規則表更新 `compose-files.spec.ts` 那一列的斷言數與描述

## 6. 文件

- [x] 6.1 `README.md`：容器模式的存取位址改為單一入口，並保留 host 模式的舊網址
- [x] 6.2 `openspec/project/tooling.md`：容器化那節補單一入口、`env_file` 的四層優先序、容器化 e2e、`down -v` 的坑
- [x] 6.3 `openspec/project/backend-runtime.md`：補「nginx 與 `TRUST_PROXY` 必須一起出現」以及少了它會壞掉的三個功能

## 7. 收尾

- [x] 7.1 完整驗證鏈實際輸出：

      ```
      typecheck   api / web / api-client 皆 Done
      lint        api / web 皆 Done
      test:cov    api  單元 53 suites / 349 tests；守則 23 suites / 106 tests（本 change 前 102）
                       All files 87.36 | 64.65 | 78.85 | 87（門檻 70/60/70/70）
                  web  94 | 96.15 | 87.5 | 92.85（門檻 75/75/60/75）
      ```
- [x] 7.2 實機驗證結果（本 change 的主要證據）：

      ```
      塊 1  verify:ci 跑完 volume 完好；舊寫法實測會移除 mysql-data / redis-data
      塊 2  五服務啟動，PORTS 欄只有 nginx 有值（api / web 皆空）
            proxy /api/health → 200、proxy / → 200、直連 3000 → connection refused
            docker compose exec nginx wget http://api:3000/api/health → 正常回應
      塊 3  .env.container 的 LOG_LEVEL=debug 生效；同檔的假 REDIS_HOST 被 compose 蓋掉
      塊 4  容器內 e2e 12 suites / 165 tests 全綠；失敗時 exit=1 且容器收乾淨
      ```
- [x] 7.3 更新 `tasks/todo.md`：勾掉 C4，並清掉那條「`verify:ci` 現在正踩著 `down -v`」的警告
- [x] 7.4 新踩到的坑寫進 `tasks/lessons.md`
