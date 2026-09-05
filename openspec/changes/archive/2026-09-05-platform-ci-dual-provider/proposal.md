## Why

模板目前只有 GitLab CI。fork 它的人有不少在 GitHub 上，而「自己照著 `.gitlab-ci.yml` 翻譯一份」正是最容易翻錯的地方——**CI 的錯誤方式是靜默的**：漏了 `test:cov` 就只是覆蓋率門檻不執行、漏了 `build` 就只是 path alias 的錯誤延到合併後才爆。兩者都不會有人發現。

盤點衍生專案時發現它的 GitHub Actions 版本比模板的 GitLab 版多做了一件對的事：**`build` 在 PR 階段也跑**。模板的 `prepare-production` 只認 `$CI_COMMIT_BRANCH`，也就是**只在推 develop / master 時才建置**——而 `nest build` / `vite build` 會抓到 path alias 解析、decorator metadata 與 emit 階段的錯誤，那些 `tsc --noEmit` 抓不到。等於「PR 是綠的，合併完 develop 才紅」，把問題推到最不該爆的地方。

## What Changes

- 新增 `.github/workflows/ci.yml` 與 `.github/actions/setup-workspace/action.yml`，與既有的 `.gitlab-ci.yml` **並存**（fork 的人刪掉不用的那份）
- **修正**：GitLab 的 `prepare-production` 改為在 MR 階段也執行，與品質檢查同一組 rules
- 新增守則 `ci-parity.spec.ts`：兩份 CI 設定必須跑**同一組檢查**（`typecheck` / `lint` / `test:cov` / `test:e2e` / `build`）、用**同一條 MySQL 版本線**、且 e2e 的測試庫名都含 `test`
- `README.md` 與 `openspec/project/tooling.md` 說明兩份的定位與「fork 後怎麼選一份」

不做的事：GitHub 的 `integration` job（衍生專案用來驗跨實例 WebSocket 廣播，模板沒有 WS 層）、部署 job（兩邊都綁各自的基礎設施，GitLab 那份已註解成範本，GitHub 這份不另外提供）、branch protection 的設定（不在版控內，只能寫進文件）。

## Capabilities

### Modified Capabilities

- `platform-ci-quality-gate`：新增「CI 設定可有多份但檢查集合必須一致」的需求；並修正「品質檢查必須在 Merge Request 階段執行」——原需求只涵蓋品質檢查，而建置同樣需要在 MR 就跑，理由是 `tsc --noEmit` 抓不到 build 階段的錯誤。
- `platform-engineering-guardrails`：新增「多份 CI 設定的一致性檢查」需求。

## Impact

- **新增檔案**：`.github/workflows/ci.yml`、`.github/actions/setup-workspace/action.yml`、`apps/api/test/architecture/ci-parity.spec.ts`
- **修改檔案**：`.gitlab-ci.yml`、`openspec/project/tooling.md`、`README.md`、`openspec/project/testing.md`
- **無 migration、無 envSchema 變更、無新增相依套件**
- **行為變更**：GitLab 的建置 job 現在也會在 MR 觸發——CI 時間變長，但問題會在該被發現的地方被發現
- **需人工設定**（不在版控內）：GitHub 側要在 Settings → Branches 把 `quality` 與 `e2e` 設為 required status checks，否則檢查失敗不會擋住合併
