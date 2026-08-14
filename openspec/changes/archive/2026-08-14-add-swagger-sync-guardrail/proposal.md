# Swagger 契約同步護欄（add-swagger-sync-guardrail）

## Why

API 契約從實作流到前端要經過三段轉換，而**只有最後一段受型別保護**：

```
Controller 路由 → docs/swagger/*/[模組].yaml → openapi.bundle.yaml → api-client/schema.ts → 前端
                └─ 人工同步 ─┘   └─ swagger:bundle ─┘   └─ generate ─┘   └─ TypeScript ─┘
```

前三段任一環節漏掉，結果都是**靜默不同步**：新增 endpoint 忘了寫 yaml、改了 yaml 忘了跑 `swagger:bundle`、bundle 更新了忘了跑 `generate`。沒有任何機制會失敗，只有前端在執行期拿到與後端不符的型別時才會發現。

目前這條規則只存在於 `CLAUDE.md` 的文字提醒（「若 swagger yaml 改變，記得跑 bundle + generate」）—— 與 `add-engineering-guardrails` 之前的 Hard Rules 處境相同。

實測現況（本 change 導入前）：controller 35 條路由、swagger 宣告 33 條，差異僅 `/api/health` 與 `/api/health/ready` 兩支健康檢查端點（刻意不納入 API 文件），產物也與來源同步。**現況是健康的，本 change 的價值在於防止未來腐化，而非修復既有問題。**

## What Changes

- **新增架構測試 `swagger-sync.spec.ts`**，以純靜態比對守住三段轉換：
  1. controller 的路由都必須宣告於來源 yaml（豁免清單處理刻意省略者）
  2. 來源 yaml 的 paths 集合必須等於 `openapi.bundle.yaml`（抓「改了 yaml 沒重跑 bundle」）
  3. bundle 的 paths 集合必須等於 `api-client/src/schema.ts` 的 `paths` key（抓「bundle 更新了沒重跑 generate」）
- **新增 `pnpm --filter @app/api swagger:check`**：把 bundle 與 client 產生到暫存目錄後比對內容，涵蓋架構測試抓不到的「路由沒變但 schema 內容變了」，且**不修改工作目錄任何檔案**。
- **`js-yaml` 提升為 `apps/api` 的直接 devDependency**：測試需要正確解析 yaml，用 regex 會被多行 `description: |` 區塊誤導（本次探索已實際踩到）。
- 文件更新：`openspec/project.md` 的 Swagger 章節、`CLAUDE.md` 的 Pre-Change Checklist。

## Capabilities

### Modified Capabilities

- `engineering-guardrails`: 新增「API 契約三段轉換必須同步」規則群。

## Impact

**新增檔案**

- `apps/api/test/architecture/swagger-sync.spec.ts`
- `apps/api/scripts/check-swagger-sync.ts`（供 `swagger:check` 使用）

**修改檔案**

- `apps/api/package.json`（新增 `swagger:check` script 與 `js-yaml` devDependency）
- `apps/api/test/architecture/allowlist.ts`（新增 swagger 豁免清單：health 端點）
- `openspec/project.md`、`CLAUDE.md`

**不受影響**

- 任何 production code、API 行為、既有 swagger 內容

**風險**

- 路由層級的比對抓不到「path 未變但 request/response schema 改了」的不同步 —— 這正是 `swagger:check` 補上的部分，但後者需要執行外部工具（數秒），故不放進每次都跑的架構測試。
- 豁免清單若被濫用（把忘了寫文件的 endpoint 塞進去）會讓規則失效 —— 沿用既有的過期檢查機制，且豁免需附理由。
