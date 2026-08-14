# 讓覆蓋率門檻真的生效（enforce-quality-thresholds）

## Why

前後端都設了覆蓋率門檻，但**沒有任何自動流程會執行它們**：

| 專案 | 門檻 | 實際覆蓋率 | 誰會執行門檻 |
| --- | --- | --- | --- |
| `apps/api` | 70 / 60 / 70 / 70 | 86.91 / 64.97 / 78.13 / 87 | 有 `test:cov` script，但 `pnpm test` 與 CI 都不跑 |
| `apps/web` | 75 / 75 / 60 / 75 | 94 / 96.15 / 87.5 / 92.85 | **連 `test:cov` script 都沒有** |

現況數字都遠高於門檻，所以問題還沒浮現。但這四個門檻目前是裝飾品——若有人讓覆蓋率掉到 40%，不會有任何東西失敗。

這與本輪稽核發現的其他問題同型：**設定寫了，但沒有執行路徑**（`eslint.config.mjs` 的 `test/**` 區塊沒被 lint glob 涵蓋、PostToolUse hook 的 `npx tsc` 在 root 跑不起來、CI 完全不跑測試）。模板的價值在於「規則被機器守住」，設而不行的門檻反而製造虛假的安全感。

另外，`apps/web` 沒有任何 import 邊界規則（`no-restricted-imports` 為 0）。實測現況分層乾淨（三條候選規則各 0 違規），屬預防性補強。

> 本 change **不補任何測試**——前端覆蓋率 94%、後端 86.91%，該測的都測了。要修的是「門檻不會被執行」這件事本身。

## What Changes

- **`apps/web` 新增 `test:cov` script**（`vitest run --coverage`）。
- **`apps/api` 的 `test:cov` 補上架構測試**（原本只跑 `jest --coverage`，會遺漏 20 條架構規則）。
- **root 新增 `test:cov`**（`pnpm -r test:cov`）。
- **CI 的 `quality-check` 改用 `pnpm test:cov`**，一次涵蓋單元測試 + 覆蓋率門檻 + 架構規則。
- **`apps/web/eslint.config.mjs` 新增 import 邊界**：`lib` / `hooks` / `components` 不得反向 import `routes`；`routes` 之間不得互相 import；`components/ui`（shadcn 生成）不得 import 業務層。
- 文件：`openspec/project.md` 的 CI 與測試章節同步。

## Capabilities

### Modified Capabilities

- `ci-quality-gate`: 品質 job 的檢查範圍加入覆蓋率門檻。
- `engineering-guardrails`: import 邊界規則擴及前端。

## Impact

**修改檔案**

- `package.json`（root）、`apps/api/package.json`、`apps/web/package.json`
- `.gitlab-ci.yml`（`quality-check` 的 script）
- `apps/web/eslint.config.mjs`
- `openspec/project.md`

**不受影響**

- 任何 production code 與測試內容；覆蓋率門檻數字維持不變

**風險**

- CI 執行覆蓋率會比純測試稍慢（v8 provider 與 jest coverage 的額外成本），但換得門檻真正生效。
- 前端 import 邊界為預防性規則（現況 0 違規），若未來有正當的跨 route 共用需求，應把共用邏輯下沉到 `lib` / `components` 而非放寬規則。
