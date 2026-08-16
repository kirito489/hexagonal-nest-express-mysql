## Why

`openspec/specs/` 是「已批准的能力規格」，但它已經落後實作一大段：

- **守則**：`platform-engineering-guardrails` 停在 22 條需求，實際已有 19 支規則檔 / 61 項斷言。
  近三輪 review 與 openspec 慣例整頓新增的 10 條規則，一條都沒進 spec。
- **容器化**：整套容器化開發環境（`Dockerfile` + 單一 `compose.yml` + 三種用法）
  **完全沒有任何 spec 涵蓋**，而它是這個模板現在最顯眼的能力之一。

成因是這幾輪都以 block 方式直接改碼，`api-attachment` / `api-auth` 兩支 master spec
也是直接編輯而非經 delta 合併——繞過了 `CLAUDE.md` 明訂的 review follow-up 流程。

本 change 是**追認補登**：把已完成且已驗證的行為寫進 spec，讓「已批准的規格」名副其實。
不新增任何程式碼行為，所有需求描述的都是 repo 內現存且有測試守著的狀態。

## What Changes

- `platform-engineering-guardrails` 補上 10 條守則需求，涵蓋 openspec schema 執行路徑、
  spec 命名與格式、文件連結完整性、swagger 成功狀態碼、e2e spec 位置、opsx 指令薄殼、
  compose 執行路徑與埠號、sanitize 敏感欄位覆蓋、全域 guard 註冊與順序、繁體中文掃描、
  以及授權覆蓋（收 `@Param` 的端點必須表態）。
- 新增能力 `platform-container-dev`，定義容器化開發環境的契約：單一 `compose.yml`
  的三種用法、映像的 dev-only 定位、bind mount 與 volume 遮罩規則、熱重載機制。
- **無程式碼變更**。

## Capabilities

### New Capabilities

- `platform-container-dev`：容器化開發環境的契約——單一 compose 的三種用法、
  映像定位、`node_modules` 遮罩與 host `.env` 隔離、前後端熱重載的成立條件。

### Modified Capabilities

- `platform-engineering-guardrails`：新增 10 條守則需求。既有 22 條不變。

## Impact

- 僅影響 `openspec/specs/`，不動任何 `apps/` 或 `packages/` 的程式碼。
- 補登後 `openspec-spec-format.spec.ts` 會對新的 `platform-*` spec 生效
  （不得寫 API 請求／回應區塊），寫作時需遵守。
- 無需 migration、無需改 `.env`。
