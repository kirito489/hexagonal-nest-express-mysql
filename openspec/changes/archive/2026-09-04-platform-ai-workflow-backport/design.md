## Context

`nexus-nest-backend` fork 自本模板後累積 87 個 commit，過程中長出四樣模板沒有的東西：三支自訂 skill、push 前的完整驗證、專案層的 openspec schema 設定，以及約 25 條通用教訓。三支 skill 掃過一遍**沒有任何衍生專案專屬內容**（唯一相關的字串是 frontmatter 的 `author: nexus`），教訓則混雜了聊天 / WebSocket / PostgreSQL 專屬條目，需要逐條篩。

模板這一側有兩處既有狀態要一併處理：

- `openspec-schema.spec.ts` 與 `platform-engineering-guardrails` spec 都寫著「`openspec config` 只支援 global scope，專案預設 schema 進不了版控」。這句話對**指令**成立（`openspec config --scope` 只接受 `global`），對**設定檔**不成立——1.3.1 的 `dist/core/project-config.js` 會從專案根讀 `openspec/config.yaml`，`openspec new change --schema` 的說明也寫著 "auto-detected from config.yaml"。誤述導致一個可以進版控的預設值一直沒被設。
- `.gitlab/merge_request_templates/Default.md` 是英文樣板，且「WHO MUST APPROVE?」底下寫死 `@Jack, @Charlie` 兩個與本專案無關的名字——從別處帶進來後沒有人動過。

## Goals / Non-Goals

**Goals:**

- 專案預設 schema 進版控，讓格式規範不再只靠「記得帶旗標」
- push 與 commit 兩層本機驗證各司其職，補上兩者之間的空窗
- 三支通用 skill 進入模板，fork 的人開箱即有
- PR / MR 描述有單一份可用的模板，不論用 GitLab 或 GitHub
- 衍生專案的通用教訓回到模板，避免下一個 fork 重踩

**Non-Goals:**

- **不改 CI 選型**。GitLab 與 GitHub Actions 兩份並存屬 `platform-ci-dual-provider`，本 change 只碰 MR / PR 模板檔案，不碰 `.gitlab-ci.yml`
- **不回補安全性修補、架構守則、容器改動**——各自獨立 change（C2 / C3 / C4）
- **不為 husky 是否活著新增檢查**（理由見 D5）
- **不搬 `gen:comments`**：那支腳本輸出 PostgreSQL 的 `COMMENT ON` 語法，模板是 MySQL/MariaDB

## Decisions

### D1：`openspec/config.yaml` 與 `--schema` 旗標並存，不擇一

新增設定檔之後，**旗標檢查不移除**。

不選「只留 config.yaml、拿掉旗標與那條守則」：設定檔可以被刪、被改錯值、或在 fork 出去的專案裡忘了帶；旗標是每次建立 change 都會經過的路徑。兩者失效的方式不一樣——設定檔失效是靜默的（落回內建 schema），旗標失效是顯性的（守則紅）。留兩道的成本只有一行 YAML。

不選「只留旗標、不加設定檔」：那就是現狀，而現狀的問題是**唯一防線寫在文件裡**——`.claude/` 底下的指令有守則盯著，但人在終端機手打 `openspec new change` 沒有任何東西擋。

守則因此新增一條 scenario：`openspec/config.yaml` 存在且 `schema:` 為 `spec-driven-custom`。

### D2：PR / MR 模板單一真相，GitLab 側用 symlink

`.github/PULL_REQUEST_TEMPLATE.md` 是實體檔，`.gitlab/merge_request_templates/Default.md` 改為指向它的 symlink。

不選「兩份各自維護」：**複製出去的設定必然漂移**，而模板的兩份 CI 並存本來就是給 fork 的人二選一用的，漂移之後留下來的那份可能正好是舊的那份。

不選「只留一份、另一個平台沒有模板」：兩份 CI 並存是使用者已經決定的方向，PR 模板跟著兩邊都在才一致。

symlink 這個手法本 repo 已經在用（`AGENTS.md -> CLAUDE.md`），不是新引入的機制。GitLab 讀 `merge_request_templates/` 時跟著 symlink 走，檔名維持既有的 `Default.md`（大寫 D）以免改名造成既有 MR 選單失效。

順帶：既有內容整份汰換掉。`@Jack, @Charlie` 是別的專案帶進來的殘留，留著會讓 fork 的人以為要 at 這兩個人。

### D3：`pre-push` 跑完整鏈，不是 `pre-commit` 的加強版

`pre-commit` 維持只跑 `lint-staged`（只 lint 改動檔，快到每次 commit 都跑得起）；`pre-push` 跑 `pnpm typecheck && pnpm lint && pnpm test:cov`——與 CI 品質檢查同一條鏈，約一分鐘。

不選「把完整鏈放進 `pre-commit`」：一分鐘乘上一天的 commit 次數，結果是所有人都開始用 `--no-verify`，於是連 lint 都不跑了。**把關太嚴會讓整道關卡被繞過**，比只擋一半更糟。

不選「不加 `pre-push`、交給 CI」：CI 是最後一道，但它在 review 開始之後才紅。`pre-push` 擋的是「本機沒跑就推」這個手滑，而那正是最常見的一種。

兩者都擋不住 `--no-verify`，這是知情的——git hook 本來就不是安全邊界。真正的強制在 CI，寫進 `platform-ci-quality-gate` 既有的需求。

`pre-push` 沿用 `pre-commit` 既有的 nvm PATH 補救（`command -v pnpm` 失敗時載入 `nvm.sh`）——同一個環境問題，不重新發明。

### D4：三支 skill 原樣搬入，只改 frontmatter 的 `author`

不選「順手改寫成模板語氣」：這三支在衍生專案上實際用過，內容裡的具體例子（「守則 231」「417/417」「e2e 那個框最容易習慣性打勾」）正是它們有效的原因。抽象化會把可操作的部分磨掉，而模板讀者需要的恰好是那些具體的反例。

不選「連 `author` 也不改」：`author: nexus` 指向一個 fork 的人看不到的專案。改為本 repo 名稱。

`pr-body` 讀 `.github/PULL_REQUEST_TEMPLATE.md`，配合 D2 的 symlink 方向（實體檔在 `.github/`），這支 skill 一個字都不用改。

### D5：不為「husky 是否活著」新增守則

合併進來的教訓之一是「husky 壞掉時不會報錯，commit 照常成功、只是什麼都沒檢查」——斷的是 `.git/config` 的 `core.hooksPath`，而不是 `.husky/` 裡的檔案。

考慮過把 `hook-scripts.spec.ts` 的 `bash -n` 檢查範圍擴到 `.husky/*`。**否決**：`bash -n` 守的是語法，而實際的失效模式是 hook 根本沒被觸發。加了它會產生一種「husky 有被守著」的錯覺，而那正好是這條教訓在講的東西——**檢查了錯的東西比沒檢查更危險**。

真正的失效模式（`core.hooksPath` 沒值）是本機環境狀態，版控裡看不到，靜態檢查原理上就構不到。因此留在 `lessons.md` 當自律項，並在教訓裡寫明診斷方式（`git config --get core.hooksPath` 有沒有值，不是看 `.husky/` 有沒有檔案）。

### D6：教訓逐條過三道排除規則，不整檔覆蓋

`tasks/lessons.md` 開頭的規則已經寫明三種不該留在這裡的東西：複述官方文件、專案慣例與架構決策（應移到 `openspec/project.md`）、已有守則擋著的（應刪）。合併時每一條都要過這三關，而不是把衍生專案的檔案整份搬過來。

排除的類別：聊天 / WebSocket 專屬（`NestFactory.create()` 與 WS adapter、Socket.IO 不在 globalPrefix 底下、關閉 HTTP server 不等於 `kill -9`）、PostgreSQL 專屬用語。

有一條需要改寫而非照搬：Prisma 的 `///` 註解不會進資料庫——機制本身與資料庫無關，但衍生專案的寫法綁著 `gen:comments` 與 PostgreSQL 的 `COMMENT ON`。改寫成只講機制，不提模板沒有的腳本。

有一條刻意在對應修復之前就寫入：`docker compose down -v` 的 `-v` 是「專案的所有 volume」——模板的 `scripts/verify-ci.sh` 目前正踩著它（每跑一次 `pnpm verify:ci` 會清掉開發用的 `mysql-data`、`redis-data` 與五個 `node_modules` volume）。修復屬 C4，但教訓先寫進去，因為這段期間任何人跑 `verify:ci` 都會踩到，而症狀（下次啟動找不到 `.prisma/client`）指不到原因。

## Risks / Trade-offs

- **[`pre-push` 讓每次 push 多約一分鐘]** → 這是刻意的取捨（D3）。真的趕時間時 `--no-verify` 仍可繞過，而 CI 會接住。
- **[symlink 在 Windows 上未必展開]** → 本專案 `.nvmrc` / husky / `compose.yml` 的開發流程本來就假設類 Unix 環境，且 `AGENTS.md -> CLAUDE.md` 已在用同一個機制；若真的要支援，屆時一併處理兩處而不是只為 MR 模板破例。
- **[`openspec/config.yaml` 讓人以為旗標可以省了]** → 守則同時檢查兩者，省掉旗標會紅；`openspec-conventions.md` 一併寫明為何兩道並存。
- **[合併教訓時把只在衍生專案成立的條目帶進來]** → 每條都要能對應到模板現存的程式碼或流程；對不上的不收。實作時逐條列出判斷結果，不是整批打勾。

## Migration Plan

無 migration、無 `.env` 變更、無新增相依套件。

需要使用者手動執行的只有一項：`.husky/pre-push` 新增後要跑一次 `pnpm install` 讓 husky 的 `prepare` 重新註冊 hook 目錄（若 `git config --get core.hooksPath` 已有值則不需要，但跑一次沒有副作用）。

回滾：刪掉新增的檔案即可，沒有任何執行期行為相依於它們。
