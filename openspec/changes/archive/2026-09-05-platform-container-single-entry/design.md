## Context

四件事各自獨立，但共用一個形狀：**開發環境的便利性決定了某個正式環境行為會不會被走到**。

- `verify-ci.sh` 的 `down -v` 是純缺陷，與其他三項無關，但同屬「容器收尾」這個主題。
- 目前 api / web 各自發布埠，開發時是兩個 origin；正式是單一埠。C2 剛把 CSP 改成分路徑判斷、把 refresh token 效期綁在儲存位置上——**這兩個決定的正確性都取決於「同一個 origin」，而開發時不是**。
- `docker/api.container.env` 遮蔽 host `.env` 的理由（連線類變數會打壞容器）成立，但手段涵蓋了全部 78 個變數。
- e2e 只能在 host 跑，於是「本機綠 CI 紅」沒有中間狀態可查。

模板既有的相關設定：

- `x-app-base` 已把 `./docker/api.container.env` 掛成 `/app/apps/api/.env:ro`。
- `mysql-verify` 已存在（`--profile verify`、tmpfs、發布 `127.0.0.1:13306`），但只被 host 端的 `verify-ci.sh` 使用。
- `TRUST_PROXY` 預設 `'loopback'`（不採信外部 `X-Forwarded-For`）。
- `compose-files.spec.ts` 掃 `docker/` 時用 `readdirSync().map()`——**只吃得下平鋪的檔案**。

## Goals / Non-Goals

**Goals:**

- `verify:ci` 不再清掉開發環境
- 開發時的拓撲與正式一致：單一 origin
- 容器能讀本機的個人偏好設定，但連線類打不壞它
- e2e 有一條不依賴 host 環境的執行路徑

**Non-Goals:**

- **不移除 host 模式**（`pnpm docker:deps` + `pnpm dev`）。它是最快的開發迴圈，也是唯一能直連 api / web 的方式。單一入口是**容器模式**的性質，不是全域規定。
- **不處理正式環境的 nginx**。本檔是 dev 樣板；抄去正式前要另外處理 `/api/metrics` 與 `/api/*/docs` 的暴露（設定裡會寫明）。
- **不加 WebSocket 的代理段**。模板沒有 WS 層，加一段沒有對應服務的路由是為不存在的東西建設施。

## Decisions

### D1：`verify-ci.sh` 用 `rm -fsv <服務>`，不用 `down`

`docker compose --profile verify rm -fsv mysql-verify`。

`down` 的作用範圍是**整個專案**，`--profile` 不縮限它——這正是缺陷的根源。`rm` 只作用於指定的服務：`-f` 不問、`-s` 先停、`-v` 移除**該容器的匿名 volume**。`mysql-verify` 用 tmpfs，容器一消失資料就跟著消失。

不選「把 `-v` 拿掉、保留 `down`」：那樣不會誤刪 volume，但仍會停掉整個專案的容器——跑一次 `verify:ci` 就把開發用的 api / web / mysql / redis 全關了，症狀比較明顯但一樣不該發生。

`down -v` 保留給 `pnpm docker:reset`，那支的定位本來就是「我真的要重置整個專案」。

### D2：埠也要問 compose，不要自己組

`VERIFY_PORT="$(docker compose --profile verify port mysql-verify 3306 | sed 's/.*://')"`。

寫死 `13306` 或自己解析 `.env` 都會在使用者調過之後失準，而症狀是「容器起來了但 e2e 連不上」——錯誤訊息指不到是哪一邊沒同步。**問 compose 實際開了哪個埠**是唯一不會漂的做法。

### D3：單一入口用 nginx，且 api / web **不發布埠**

不選「加 nginx 但保留 api / web 的埠」：那樣「單一 origin」變成可選的，而開發時走哪條路取決於習慣。**兩條路並存等於沒有統一拓撲**——CSP 與 cookie 的問題仍然只在其中一條上出現，而那條剛好是沒人走的。

要直連的需求由 host 模式滿足（3000 / 5173），這是刻意的分工：**容器模式 = 貼近正式；host 模式 = 最快迴圈**。

要分辨「代理壞了還是應用壞了」不靠開一個 host 埠，而是從代理容器內部打後端——那涵蓋了代理的網路路徑，比多開一個埠更精準：

```bash
docker compose exec nginx wget -qO- http://api:3000/api/health
```

守則用**服務名稱**表述（「api 與 web 不得宣告 ports」）而非白名單（「只有 nginx 可以有 ports」）：白名單會在有人加新服務時誤報，而誤報的處理方式是把服務加進白名單，規則從此空轉。並以 nginx 當**正對照組**（它一定有 ports）——那條若為 false 代表解析失效，而失效的表現正好是「api / web 也都看起來沒有 ports」。

### D4：`TRUST_PROXY: '1'` 與 nginx 必須一起出現

加了代理卻沒設 `trust proxy`，`request.ip` 會變成 nginx 的容器位址，而**三個功能同時靜默失效**：

| 功能 | 壞掉的樣子 |
| --- | --- |
| IP 黑名單 | 擋不到真正的來源；一旦誤封就是封掉整個 nginx |
| 登入失敗計數 | 所有人算成同一個，第 N 次失敗把全部人擋掉 |
| 全域節流 | 每分鐘 100 次變成**全站共用**一份額度 |

設 `'1'`（信任一跳）而非 `'true'`：後者無條件採信偽造的 `X-Forwarded-For`。`'1'` 只信任 nginx 那一跳，偽造的部分會被正確忽略。

### D5：容器設定的優先序，與「只釘連線類」

優先序（高到低）：

```
compose 的 environment  >  apps/api/.env.container  >  docker/api.container.env  >  envSchema 預設
```

⚠️ **個人覆寫用獨立的 `.env.container`，不是直接讀 `apps/api/.env`——這是實作時實測後改的。**
原本的設計是 `env_file: ./apps/api/.env`。實際跑下去發現 **compose 的 env 解析器比 dotenv 嚴格**，
而 `env_file` 解析失敗會讓**所有** docker compose 指令失效——連 `config` / `ps` / `down` 都跑不了。
本機的 `.env` 有一行帶角括號的寄件者位址（`... <noreply@example.com>`），
對應用程式完全合法，卻讓整個 compose 無法使用。

**那個代價遠大於它解決的問題**（讓開發者能自訂 `LOG_LEVEL` 之類）。
改用獨立檔保留了目標，同時拿掉「compose 的可用性取決於某人的 `.env` 寫法」這個耦合。
`.env.container` 已加進 `.gitignore`。

`docker/api.container.env` 的掛載**保留**，但職責改變——它不再是「防止本機設定進來」的手段（那件事由 `environment` 的優先序負責），而是**隊友共用的容器基準**（進版控，所有人跑起來一樣）；`.env.container` 則是**個人偏好**（不進版控，只影響自己這台）。

不選「拿掉遮蔽」：那樣就沒有「進版控的容器基準」這一層，新人 clone 下來跑起來的行為取決於他自己的覆寫檔。

**只釘連線類（`*_HOST` / `*_PORT` / `*_URL`）**：它們的正確值由拓撲決定（service 名稱），host 的值必然是 `localhost` 而在容器裡連不到。其餘變數（`LOG_LEVEL`、feature flags…）讓開發者自己調是合理的。

守則**只檢查「有沒有釘」，不檢查「值對不對」**：後者需要知道每個變數的語意。值由實機驗收負責，守則負責的是「新增時有沒有人想過它在容器裡該是什麼」。這條要在**新增變數的當下**失敗——症狀全是靜默的：Redis 連不上會降級運行、SMTP 要到真的寄信才失敗。

### D6：容器化 e2e 與 host e2e **並存**

`pnpm --filter @app/api test:e2e`（host）與 `pnpm test:e2e:docker`（容器）各有定位：

- **host** — 最快，改一行就重跑，開發時用這條
- **容器** — 密封，不依賴 host 的 Node / 套件 / `.env`，推上去之前用這條

`e2e` 服務用 `docker compose run --rm`，讓退出碼直接是測試的退出碼；用 `up` 的話還要另外撈容器的退出碼，多一層容易寫錯。

`command` 開頭先 `db:generate`：Prisma client 產在 `node_modules` 的具名 volume 裡，新建或剛被清掉重建的 volume 不會有它，症狀是所有 spec `failed to run` 並報 `Cannot find module '.prisma/client/default'`。

建測試庫與 `migrate deploy` 仍由 jest 的 `globalSetup` 負責，腳本不重複做——它讀的是 `process.env` 的 `DB_*`，而那些由 compose 的 `environment` 提供。

### D7：`compose-files.spec.ts` 的目錄掃描改遞迴

原本 `readdirSync(join(REPO_ROOT, 'docker')).map()` 假設 `docker/` 底下只有檔案。加入 `docker/nginx/` 之後 `readFileSync` 對目錄丟 `EISDIR`。

掃描清單的規則要能承受「有人在裡面開子目錄」，否則它會在**別人加東西的那一刻**壞掉，而錯誤訊息（`EISDIR`）完全指不到原因。

## Risks / Trade-offs

- **[開發者習慣的網址改變]** → `localhost:3000` / `5173` → `localhost:8080`。README 與 `tooling.md` 要寫清楚，且 host 模式的舊網址不變。
- **[nginx 多一層，除錯時多一個嫌疑犯]** → 設定裡直接寫上「怎麼分辨代理壞了還是應用壞了」的指令。
- **[個人覆寫要多維護一個 `.env.container`]** → 這是拿「compose 的可用性不受某人 `.env` 寫法影響」換來的，見 D5 的實測。連線類由 `environment` 釘死並有守則盯著；其餘變數本來就該讓開發者能調。
- **[`e2e` 服務與 host e2e 兩條路徑可能漂移]** → 兩者跑的是同一支 `test:e2e`，差別只在環境。漂移的可能性限於環境變數，而那由 compose 的 `environment` 集中管理。
- **[nginx 的 dev 設定被抄去正式]** → 設定檔開頭明寫「抄去正式之前」要處理哪兩組路徑。這是文件而非機制，屬知情的缺口。

## Migration Plan

無 migration、無 envSchema 變更。

使用者需知道的兩件事：

1. **容器模式的網址改為 `http://localhost:8080`**（`APP_PROXY_PORT` 可覆寫）。Swagger 走 `http://localhost:8080/api/admin/docs`。
2. 首次啟動要重建：`pnpm docker:down && pnpm docker:up`（新增了 nginx 服務）。

回滾：把 api / web 的 `ports` 加回去、移除 nginx 服務即可，其餘三項是獨立的。
