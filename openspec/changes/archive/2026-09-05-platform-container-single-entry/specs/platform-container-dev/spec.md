## MODIFIED Requirements

### Requirement: 單一 compose 檔涵蓋三種用途

系統 SHALL 以**單一** `compose.yml` 支援四種用法，靠「指定服務」與 profile 區分：
整套跑在容器（預設 `up`）、只起相依服務（`up mysql redis`）、
重現 CI 的 e2e 環境（`--profile verify`）、在容器內跑完整 e2e（`--profile e2e`）。

verify 用的 MySQL MUST 獨立成服務而非共用開發用的那個——兩者對資料的要求相反：
開發要 named volume 重啟保留，驗證要 `tmpfs` 每次乾淨。它 MUST 掛在 profile 底下，
使平常的 `up` 不會啟動它。

三者與 CI 的 service container MUST 共用同一條 MySQL 版本線，避免「本機過、CI 掛」。

**臨時容器的收尾 MUST 只作用於自己起的服務**，MUST NOT 使用 `docker compose down -v`。
`--profile` 只影響「哪些服務被視為啟用」，**不限制 `down` 的作用範圍**——
`down` 移除專案的所有容器，`-v` 移除 compose 檔宣告的**所有** named volume，
包含資料庫與五個 `node_modules` volume。症狀是下一次啟動時
「找不到 `.prisma/client`」或「資料庫是空的」，**完全指不到是收尾那一行造成的**。
正確做法是 `rm -fsv <服務名>`（`-f` 不問、`-s` 先停、`-v` 只移除該容器的匿名 volume）。
`down -v` 保留給「我真的要重置整個專案」的情境。

腳本 MUST 向 compose 查詢實際發布的埠（`docker compose port <服務> <容器埠>`），
MUST NOT 寫死或自行解析 `.env`——埠可被覆寫，寫死會在使用者調過之後失準，
而症狀是「容器起來了但連不上」，錯誤訊息指不到是哪一邊沒同步。

#### Scenario: 預設啟動整套

- **WHEN** 執行 `docker compose up -d`
- **THEN** api、web、mysql、redis 與反向代理啟動，`mysql-verify` 與 `e2e` MUST NOT 啟動

#### Scenario: 只起相依服務

- **WHEN** 執行 `docker compose up -d mysql redis`
- **THEN** 僅資料庫與快取啟動，api / web 由開發者在 host 執行

#### Scenario: 重現 CI 環境

- **WHEN** 執行 `--profile verify`
- **THEN** 啟動 tmpfs 版 MySQL，測試結束後**僅移除該服務的容器與匿名卷**

#### Scenario: 收尾誤用 down -v

- **WHEN** 臨時容器的清理使用 `docker compose down -v`
- **THEN** 視為缺陷——開發用的資料庫與 `node_modules` volume 會被一併清掉

### Requirement: 容器設定不得受 host 的環境檔影響

系統 SHALL 讓容器能讀取開發者本機的覆寫檔（`env_file`，檔案不存在時不報錯），
但**連線類環境變數 MUST 在 compose 的 `environment` 釘死**，使本機的值蓋不掉它們。

該覆寫檔 MUST 是**專供容器的獨立檔**（不進版控），MUST NOT 直接指向 `apps/api/.env`。
compose 的 env 解析器比 dotenv 嚴格，而 `env_file` 解析失敗會讓**所有**
docker compose 指令失效——連 `config` / `ps` / `down` 都跑不了。
也就是說，一行對應用程式完全合法的設定，可以讓整個 compose 無法使用。

設定的優先序 MUST 為（高到低）：

```
compose 的 environment  >  apps/api/.env.container  >  docker/api.container.env  >  envSchema 預設
```

`docker/api.container.env` 的掛載 MUST 保留，但其職責是**隊友共用的容器基準**
（進版控，所有人跑起來一樣），不是「防止本機設定進來」的手段——
那件事由 `environment` 的優先序負責。`.env.container` 則是**個人偏好**（不進版控）。

連線類的判準為變數名以 `_HOST` / `_PORT` / `_URL` 結尾。它們的正確值由拓撲決定
（service 名稱），而 host 的值必然指向 `localhost`，在容器內連不到。
其餘變數（`LOG_LEVEL`、feature flags 等）SHALL 讓開發者自行調整。

守則 MUST 只檢查「有沒有釘」，MUST NOT 檢查「值對不對」——後者需要知道每個變數的語意。
值由實機驗收負責；守則負責的是「新增時有沒有人想過它在容器裡該是什麼」。
這條 MUST 在**新增變數的當下**失敗，因為症狀全是靜默的：
Redis 連不上會降級運行、SMTP 要到真的寄信才失敗。

#### Scenario: host 的 .env 含容器不適用的連線設定

- **WHEN** 開發者的覆寫檔設有指向 host 的連線 URL
- **THEN** 容器 MUST NOT 採用該值——compose 的 `environment` 優先序較高

#### Scenario: 開發者想調整非連線類設定

- **WHEN** 開發者在 `apps/api/.env.container` 設 `LOG_LEVEL=debug`
- **THEN** 容器 MUST 採用該值

#### Scenario: 新增連線類變數但沒有釘死

- **WHEN** `envSchema` 新增一個以 `_HOST` / `_PORT` / `_URL` 結尾的變數，而 compose 沒有釘它也沒有列入豁免
- **THEN** 檢查失敗

## ADDED Requirements

### Requirement: 容器模式的單一入口

容器模式 SHALL 以反向代理作為**唯一**入口，api 與 web MUST NOT 宣告對外埠。

目的不是「有一個代理」，而是讓開發時的拓撲與正式的單一埠部署一致：**同一個 origin**。
兩種拓撲不一樣的話，CORS、cookie 的 `SameSite`、以及 CSP 的分路徑判斷，
開發時走的都不是上線時那條路。

保留 api / web 的埠 MUST 被視為違規——兩條路並存等於沒有統一拓撲，
而問題仍然只在其中一條上出現，那條剛好是沒人走的。要直連 api / web 時
SHALL 改用 host 模式（`docker compose up mysql redis` + `pnpm dev`）。

代理設定 MUST NOT 加任何安全標頭（CSP / X-Frame-Options / HSTS…）。
那些由後端統一負責，而 CSP 尤其不可加：後端的 CSP 是**分路徑**的
（Swagger UI 放寬、其餘套預設），在代理加一份會把整個判斷蓋掉，
**而且兩邊都不會失敗**——症狀是「Swagger UI 打不開」或「某個資源被擋」，
沒有人會想到是代理。

api 服務 MUST 同時設定 `TRUST_PROXY` 為信任一跳（`'1'`）。
**這兩者必須一起出現**——少了它，`request.ip` 會變成代理的容器位址，
而三個功能同時靜默失效：IP 黑名單擋不到真正的來源（誤封就是封掉整個代理）、
登入失敗計數所有人算成同一個、全域節流變成全站共用一份額度。
MUST NOT 設為 `'true'`——那會無條件採信偽造的 `X-Forwarded-For`。

#### Scenario: 從單一入口存取前後端

- **WHEN** 以代理的埠存取 `/api/*` 與 `/`
- **THEN** 前者轉發到 api、後者轉發到 web，兩者同一個 origin

#### Scenario: api 或 web 宣告了對外埠

- **WHEN** compose 的 api 或 web 服務出現 `ports:`
- **THEN** 檢查失敗——多一條直連的路，統一拓撲就變成可選的

#### Scenario: 分辨代理壞了還是應用壞了

- **WHEN** 需要判斷故障來源
- **THEN** 從代理容器內部打後端的健康端點，MUST NOT 為此另開一個 host 埠

### Requirement: 容器化的 e2e 執行路徑

系統 SHALL 提供在容器內執行完整 e2e 的途徑（`--profile e2e`），
與 host 的 e2e **並存而非取代**：

| 路徑 | 定位 |
| --- | --- |
| host（`pnpm --filter @app/api test:e2e`） | 最快，改一行就重跑，開發時用 |
| 容器（`pnpm test:e2e:docker`） | 密封，不依賴 host 的 Node / 套件 / `.env`，推送前用 |

e2e 服務 MUST 以 `run --rm` 執行，使退出碼直接是測試的退出碼。
用 `up` 的話還要另外撈容器的退出碼，多一層容易寫錯。

服務的 command MUST 以 `db:generate` 開頭：Prisma client 產在 `node_modules`
的具名 volume 裡，新建或剛被重建的 volume 不會有它，
症狀是所有 spec `failed to run` 並報 `Cannot find module '.prisma/client/default'`。

建立測試庫與 migration SHALL 仍由 jest 的 `globalSetup` 負責，腳本 MUST NOT 重複做。

#### Scenario: 在容器內跑 e2e

- **WHEN** 執行 `pnpm test:e2e:docker`
- **THEN** 起 tmpfs 資料庫、在容器內跑完整 e2e，退出碼即測試成敗，結束後只收自己起的容器

#### Scenario: 測試失敗

- **WHEN** 容器內的 e2e 有測試不通過
- **THEN** 指令以非零碼結束，且容器仍被清理乾淨（收尾走 trap，失敗時最需要）
