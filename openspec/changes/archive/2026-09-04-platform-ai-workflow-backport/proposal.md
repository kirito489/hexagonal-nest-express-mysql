## Why

衍生專案 `nexus-nest-backend`（fork 自本模板，已累積 87 個 commit）在 AI 協作流程上長出了模板沒有的東西：三支自訂 skill、push 前的完整驗證、以及約 25 條通用教訓。同一批東西留在衍生專案裡，模板的下一個 fork 就得再踩一次。

其中一項還是模板現存的**執行路徑缺口**：`openspec new change` 的 `--schema spec-driven-custom` 目前是格式規範生效的唯一防線，而漏帶旗標會靜默落回內建 schema。已驗證 openspec 1.3.1 會從專案根讀取 `openspec/config.yaml`（`dist/core/project-config.js`），`--schema` 的說明也寫著 "auto-detected from config.yaml"——模板 spec 與 `CLAUDE.md` 寫的「`openspec config` 只支援 global scope，專案預設進不了版控」把**指令**的限制誤述成了整體限制，於是一個可以進版控的預設值一直沒被設。

## What Changes

- 新增 `openspec/config.yaml`（`schema: spec-driven-custom`），讓專案預設 schema 進版控；`openspec-schema.spec.ts` 加一條檢查它存在且值正確，旗標檢查維持不動（兩道防線，不是替換）
- 修正 `CLAUDE.md`、`platform-engineering-guardrails` spec、`openspec-conventions.md` 三處對 `openspec config` 限制的過時敘述
- 新增 `.husky/pre-push`：跑完整 `typecheck && lint && test:cov`，與只 lint 改動檔的 `pre-commit` 分成兩層
- 新增 `.claude/skills/` 三支自訂 skill：`grill-me`（把計畫拷問到每個分支都有答案）、`pr-body`（讀 PR 模板與分支的 openspec change 產出描述）、`tidy-todo`（change 收尾時整理 `todo.md`）
- 新增 PR / MR 模板（`.github/PULL_REQUEST_TEMPLATE.md` 與 `.gitlab/merge_request_templates/`，兩份並存）
- 合併衍生專案 `tasks/lessons.md` 的通用教訓進模板，排除聊天 / WebSocket / PostgreSQL 專屬條目

不做的事：CI 選型（GitLab 與 GitHub Actions 兩份並存的落地屬 `platform-ci-dual-provider`）、安全性修補、架構守則回補、容器改動——各自獨立 change。

## Capabilities

### New Capabilities

- `platform-ai-collaboration`：AI 協作流程的契約——自訂 skill 的職責邊界與薄殼原則、`tasks/lessons.md` 與 `tasks/todo.md` 的記憶規則（什麼該寫、什麼該移走、什麼該刪）、PR 描述的產出方式。目前這些只寫在 `CLAUDE.md` 的行為規則裡，沒有任何可驗收的需求，也沒有守則盯著。

### Modified Capabilities

- `platform-engineering-guardrails`：「openspec 自訂 schema 的執行路徑檢查」需求改寫——專案預設 schema 改為由 `openspec/config.yaml` 承載並進版控，檢查同時要求該檔存在與建立指令帶旗標；原需求裡「專案預設 schema 進不了版控」的理由敘述一併修正。
- `platform-ci-quality-gate`：新增「push 前的本機完整驗證」需求——`pre-push` 執行與 CI 品質檢查同一條鏈，補上 `pre-commit`（只 lint 改動檔）與 CI（推上去才跑）之間的空窗。既有「`--no-verify` 可繞過」的 scenario 需擴充到兩支 hook。

## Impact

- **新增檔案**：`openspec/config.yaml`、`.husky/pre-push`、`.claude/skills/{grill-me,pr-body,tidy-todo}/SKILL.md`、`.github/PULL_REQUEST_TEMPLATE.md`、`.gitlab/merge_request_templates/default.md`
- **修改檔案**：`apps/api/test/architecture/openspec-schema.spec.ts`、`CLAUDE.md`、`openspec/project/openspec-conventions.md`、`openspec/project/tooling.md`、`tasks/lessons.md`
- **無 migration、無 .env 變更、無新增相依套件**
- `pre-push` 會讓每次 `git push` 多約一分鐘。這是刻意的取捨——`--no-verify` 仍可繞過，擋的是手滑而非蓄意
