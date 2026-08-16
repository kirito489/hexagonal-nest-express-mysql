## ADDED Requirements

### Requirement: DTO 型別一律由 Zod schema 推導

`adapter/in/web` 下的 request / query 型別 MUST 以 `z.infer` 自 Zod schema 推導，MUST NOT 手寫 `class` 或 `interface` 宣告。

#### Scenario: 手寫 DTO 型別

- **WHEN** 某個 `*Request.ts` 或 `*Query.ts` 以 `class` / `interface` 宣告型別而非 `z.infer`
- **THEN** 架構測試失敗，指出應改用 Zod schema 推導

### Requirement: e2e 不得 mock 資料庫

e2e 測試 MUST 對真實測試資料庫執行，MUST NOT 覆寫 `PrismaService`。測試基礎設施 MUST NOT 提供 mock 資料庫的入口。

#### Scenario: 覆寫 PrismaService

- **WHEN** 任一 e2e spec 以 `overrideProvider(PrismaService)` 注入假物件
- **THEN** 架構測試失敗

#### Scenario: 測試 helper 提供 mock 入口

- **WHEN** `test-app.ts` 的 overrides 型別出現可注入假 Prisma 的欄位
- **THEN** 架構測試失敗——留著入口會讓規則形同虛設

### Requirement: 維持 CommonJS baseline

root 與 `apps/api` 的 `package.json` MUST NOT 設定 `"type": "module"`。`apps/web` 為明文例外（Vite ESM by design）。

#### Scenario: 後端 workspace 切換為 ESM

- **WHEN** root 或 `apps/api` 的 `package.json` 加入 `"type": "module"`
- **THEN** 架構測試失敗，指出會連鎖破壞 nest CLI / ts-jest / decorator metadata
