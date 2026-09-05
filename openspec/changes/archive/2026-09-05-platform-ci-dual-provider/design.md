## Context

模板是給人 fork 的，而 fork 的人用哪個 CI 平台不由模板決定。目前只提供 GitLab 一份，等於把「翻譯成 GitHub Actions」這件事留給每一個使用者各做一次——而那是最容易翻錯的地方。

**CI 設定的錯誤方式全是靜默的**：

| 翻錯什麼 | 症狀 |
| --- | --- |
| `test` 寫成 `test:cov` 之外 | 覆蓋率門檻**不執行**，數字掉了沒人知道 |
| 漏掉 `build` | path alias / decorator metadata 的錯誤延到合併後才爆 |
| e2e 的庫名不含 `test` | `globalSetup` 守門中止，job 紅得莫名其妙 |
| 資料庫版本不同 | 「本機過、CI 掛」，而差異在版本不在程式碼 |

沒有一項會在「設定寫錯的當下」出聲。

模板既有狀態：

- `.gitlab-ci.yml` 有 `npm-install` / `quality-check` / `e2e-test` / `prepare-production` / `cleanup` / `pr_agent_job`，其中 `prepare-production` 的 rules **只認 `$CI_COMMIT_BRANCH`**，MR 階段不跑。
- 快取用 `.package_cache` 與 `.build_artifacts_cache` 兩個 YAML anchor。
- e2e 的 MySQL 走 service container，等待就緒是**手動輪詢**（GitLab 的 services 不支援 compose 的 healthcheck 語法）。

## Goals / Non-Goals

**Goals:**

- fork 的人在兩個平台上都有一份可直接用的設定
- 兩份跑的是**同一組檢查**，而且這件事由機器保證
- 建置在 MR 階段就跑，不把 build 階段的錯誤推到合併後

**Non-Goals:**

- **不提供 GitHub 的部署 job**。GitLab 那份的部署已經整段註解成範本並寫明啟用步驟；部署綁各自的 registry 與主機，兩邊都無法通用，再寫一份只是多一份沒人驗證過的樣板。
- **不搬 `integration` job**。衍生專案用它驗跨實例 WebSocket 廣播（需要真 Redis），模板沒有 WS 層。
- **不動 `pr_agent_job`**。它預設 `when: never`，是 GitLab 專屬的選配。
- **不設 branch protection**。那項設定不在版控內，只能寫進文件。

## Decisions

### D1：兩份並存，不擇一，也不做「單一真相 + 產生器」

不選「只留一份、另一個平台自己翻譯」：那就是現狀，而現狀的問題正是翻譯會錯。

不選「寫一份中介格式再產生兩份」：CI 設定的表達力差異很大（GitLab 的 anchor 與 `extends`、GitHub 的 composite action 與 matrix），中介層要嘛表達力不足、要嘛比兩份原生設定加起來更複雜。**而它多出一個沒有人熟悉的東西**——出事時要先看懂產生器。

選「兩份並存 + 一致性守則」：接受重複，但讓重複的部分由機器盯著。fork 的人刪掉不用的那份，守則會因為「只剩一份」而自動放行（見 D3）。

### D2：GitHub 的三個 job 對應 GitLab 的三個，命名刻意貼近

| GitHub job | GitLab job | 內容 |
| --- | --- | --- |
| `quality` | `quality-check` | `typecheck` + `lint` + `test:cov` |
| `e2e` | `e2e-test` | 對 MySQL service container 跑完整 e2e |
| `build` | `prepare-production` | `db:generate` + `pnpm build` |

GitHub 不需要 `npm-install` 這個獨立 job——`actions/cache` 加 composite action 已經涵蓋，而 GitLab 那個 job 存在是因為它的 cache 模型不同（`policy: pull-push` 需要一個明確的產生者）。

`cleanup` 同理不需要：GitHub 的 runner 是一次性的。

前置步驟抽成 composite action，理由與 `compose.yml` 的 `x-app-base` anchor 相同：**複製出去的設定必然漂移**。Node 版本取自 `.nvmrc`、pnpm 版本取自 `package.json` 的 `packageManager`——CI 不另外宣告版號，否則就多一處要與本機同步的地方。

### D3：一致性守則檢查「檢查集合」，不檢查「寫法」

守則比對的是兩份設定裡**出現了哪些 pnpm 指令**，不是 YAML 結構。

不選「解析 YAML 比對 job 圖」：兩個平台的結構本來就不同（stage vs needs、services 的宣告方式），比對結構會逼兩份寫成同一個形狀，而那正是 D1 拒絕的中介層思路。

不選「只檢查其中一份」：那樣另一份漂掉不會有人知道。

**只剩一份時守則自動放行**：fork 的人刪掉不用的那份是預期行為，不該因此變紅。但**兩份都在時就必須一致**——這讓「有意識地只留一份」與「不小心讓兩份漂移」有不同的結果。

同時檢查資料庫映像的版本線：兩份用不同的 MySQL 大版本會產生「本機過、CI 掛」，而那個差異在版本不在程式碼，最難查。

### D4：GitLab 的 `prepare-production` 改為 MR 也跑

原本 rules 只有 `$CI_COMMIT_BRANCH`，改為沿用 `.quality_rules`（MR + 分支推送）。

`nest build` / `vite build` 會抓到 path alias 解析、decorator metadata 與 emit 階段的錯誤，而 `tsc --noEmit` 抓不到——這是本專案 `CLAUDE.md` 的 Pre-Change Checklist 第 4 條就寫著的事實。只在 push 時跑等於「PR 是綠的，合併完 develop 才紅」。

代價是 CI 時間變長。但 `needs: [quality-check]` 讓它只在品質檢查過了才開始，而品質檢查是最快失敗的那個。

## Risks / Trade-offs

- **[兩份設定要同步維護]** → 這是 D1 接受的代價，由 `ci-parity.spec.ts` 盯著檢查集合。真正會漂的是「加了新檢查只補一邊」，而那正是守則會抓的。
- **[GitHub 的設定沒有在真的 GitHub repo 上驗證過]** → 模板本身在 GitLab 上。語法正確性由 YAML 解析保證，但 runner 行為（cache 命中、service container 啟動時序）只能在實際 pipeline 觀察。**這是知情的缺口**，寫進 `todo.md` 的「首次 CI pipeline 需人工觀察」。
- **[GitLab 的 build 在 MR 跑會拉長回饋時間]** → 見 D4，這是刻意的取捨。
- **[branch protection 不在版控]** → 只能寫進文件與 workflow 的檔頭註解。GitHub 免費方案的私有 repo 甚至設不了。

## Migration Plan

無 migration。

fork 這個模板之後：**刪掉不用的那一份 CI 設定**（`.gitlab-ci.yml` 或 `.github/workflows/`）。一致性守則在只剩一份時自動放行。

GitHub 側另需人工設定（不在版控內）：Settings → Branches 把 `quality` 與 `e2e` 設為 required status checks，否則檢查失敗不會擋住合併。
