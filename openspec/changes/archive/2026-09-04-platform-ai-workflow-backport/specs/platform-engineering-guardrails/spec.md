## MODIFIED Requirements

### Requirement: openspec 自訂 schema 的執行路徑檢查

系統 SHALL 確保專案的 openspec 格式規範真的會生效：自訂 schema 與四份模板存在、
`schema.yaml` 可解析且四個 artifact 齊全、`openspec/config.yaml` 存在且指定該 schema、
建立 change 的指令一律帶 `--schema spec-driven-custom`、進行中的 change 皆使用該 schema、
且 `.claude/commands/opsx/*` 維持轉呼叫 skill 的薄殼。

專案預設 schema 由**進版控的 `openspec/config.yaml`** 承載（`schema: spec-driven-custom`）。
CLI 的 `openspec config` 指令只支援 global scope，但設定檔本身是專案層的——
兩者是不同的東西，早期把指令的限制誤述為整體限制，導致這個可以進版控的預設值一直沒被設。

設定檔與旗標 SHALL **並存**，不擇一。兩者失效的方式不同：設定檔失效是靜默的
（被刪或值改錯就落回內建 schema），旗標失效是顯性的（守則紅）。
只留旗標會讓終端機手打 `openspec new change` 完全沒有防線；
只留設定檔則失去那道會出聲的檢查。

#### Scenario: 專案設定檔缺失或指向別的 schema

- **WHEN** `openspec/config.yaml` 不存在，或其 `schema:` 不是 `spec-driven-custom`
- **THEN** 檢查失敗——手打的建立指令會靜默落回內建 schema

#### Scenario: 建立指令漏帶旗標

- **WHEN** `.claude/` 底下任一份文件的 `openspec new change` 未帶 `--schema`
- **THEN** 檢查失敗並指出該檔案

#### Scenario: opsx 指令重新抄回完整流程

- **WHEN** 某支 opsx 指令檔超過 40 行或不再轉呼叫 skill
- **THEN** 檢查失敗——流程只能有一份真相
