## ADDED Requirements

### Requirement: pnpm overrides 必須宣告於 workspace root

依賴版本覆寫 MUST 宣告在 root `package.json` 的 `pnpm.overrides`。宣告在子 workspace 的 `overrides` **不會生效**，且不會有任何警告。

#### Scenario: 需要覆寫傳遞依賴版本

- **WHEN** 需要強制某個傳遞依賴使用特定版本（通常為修補漏洞）
- **THEN** 於 root `package.json` 的 `pnpm.overrides` 宣告，並在安裝後驗證實際安裝版本符合預期

#### Scenario: 驗證覆寫是否生效

- **WHEN** 新增或修改任一 override
- **THEN** 以 `pnpm why <pkg>` 或檢查 `node_modules/.pnpm` 確認實際版本，不可只憑宣告認定已生效
