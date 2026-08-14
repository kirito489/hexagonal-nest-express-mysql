# 依賴安全修復（fix-security-dependencies）

## Why

`pnpm audit` 回報 **85 個漏洞（2 critical / 36 high / 42 moderate / 5 low）**，全部為傳遞依賴。稽核過程發現兩件事：

**1. 既有的 `overrides` 從未生效** —— 宣告在 `apps/api/package.json`，但 **pnpm 的 overrides 只在 workspace root 生效**：

| override 宣告 | 實際安裝 |
| --- | --- |
| `@hono/node-server: ">=1.19.13"` | 1.19.11 |
| `@tootallnate/once: "3.0.1"` | 2.0.1 |
| `picomatch: "^4.0.4"` | 4.0.4 與 2.3.2 並存 |

這是本輪稽核抓到的第 **7** 個「設定寫了但沒有執行路徑」型缺陷，也是唯一一個與安全直接相關的。

**2. 三個直接依賴落後於安全版本**，其中 `js-yaml` 是本輪 `add-swagger-sync-guardrail` 新增的——我加了一個帶 high 漏洞的版本。

模板的依賴會隨著每次 fork 複製出去，過時的安全版本會一併擴散。

## What Changes

- **`overrides` 搬到 root `package.json` 的 `pnpm.overrides`** 並更新版本要求（`@hono/node-server` 提到 `>=1.19.15`）。
- **升級三個直接依賴**：
  - `js-yaml` 4.1.1 → `>=4.3.0`（high）
  - `vite` 8.0.13 → `>=8.0.16`（high）
  - `nodemailer` 8.0.7 → `>=9.0.1`（high，**major**）
- 文件：`openspec/project.md` 註明 overrides 必須放 root。

## Capabilities

### Modified Capabilities

- `monorepo-workspace`: 新增「pnpm overrides 只在 root 生效」的約束。

## Impact

**修改檔案**

- `package.json`（root，新增 `pnpm.overrides`）
- `apps/api/package.json`（移除無效的 `overrides`、升級 `js-yaml` / `nodemailer`）
- `apps/web/package.json`（升級 `vite`）
- `pnpm-lock.yaml`
- `openspec/project.md`

**風險**

- `nodemailer` 為 major 升級。影響面經確認**僅 `adapter/out/mail/NodemailerEmailAdapter.ts` 一個檔案**，且只用 `createTransport` 與 `sendMail` 兩個 API——六角架構把外部套件關在 adapter 內，這正是它的價值。仍須以 typecheck + 該檔的單元測試驗證。
- `vite` 升級可能影響前端 build。以 `pnpm build` 驗證。
- 本 change **不追加** critical/high 傳遞依賴的 override（如 `shell-quote`、`websocket-driver`）——強制提版可能踩上游相容問題，待有需要再另案評估。修完後仍會有大量 moderate 漏洞，屬已知狀態。
