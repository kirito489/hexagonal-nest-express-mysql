# OpenSpec 慣例

> 自訂 schema 的機制與它的兩道防線、change 命名。格式規則本身不在這裡。

> 本檔為 `openspec/project.md` 的一部分，導覽見該檔。

---

## 格式規則的正本在 schema，不在這裡

專案的 proposal / spec / design / tasks 格式規範**一律住在**：

```
openspec/schemas/spec-driven-custom/
├── schema.yaml              # 各 artifact 的 instruction（openspec instructions 餵給 AI 的內容）
└── templates/               # 產出檔案的骨架
    ├── proposal.md  ├── spec.md  ├── design.md  └── tasks.md
```

**本檔不重述那些規則。** 能力命名前綴、`api-*` 的請求／回應四段式、delta 操作、
塊式切分、design 的寫作要求、驗收條件可證偽、反向驗證、範圍變化的記法——
全部去讀 `schema.yaml`，或直接跑：

```bash
openspec instructions <artifact-id> --change "<name>" --json
```

**為什麼不在這裡也寫一份**：同一條規則放兩個地方，改一處另一處就變成假的。
`schema.yaml` 是被 `openspec instructions` 在產出當下餵給 AI 的那一份，
而且有 `openspec-schema.spec.ts` 釘住，所以它是正本。

**流程與行為規則**（commit 粒度、分支命名、change 生命週期、openspec 與 superpowers
的分工、bug 要不要開 change、memory 規則）的正本在 `CLAUDE.md`，那份每個 session
都會載入。schema 與本檔都不重述它們。

---

## 自訂 schema 的兩道防線

**建立 change 一律要帶旗標**：

```bash
openspec new change "<name>" --schema spec-driven-custom
```

落回內建 schema 的話，schema 裡所有規範一條都不會生效。防線有**兩道，並存而非擇一**：

| 防線 | 涵蓋 | 失效方式 |
| --- | --- | --- |
| `openspec/config.yaml`（`schema: spec-driven-custom`） | **所有**建立途徑，含在終端機手打 | 被刪或值改錯就**靜默**落回內建 schema |
| `--schema` 旗標 | `.claude/` 底下的 skill 與指令 | 漏帶時 `openspec-schema.spec.ts` **顯性**變紅 |

只留旗標的話，手打的那條路徑完全沒有防線；只留設定檔的話，就失去那道會出聲的檢查。
`openspec-propose` skill 已內建旗標，守則同時檢查設定檔與旗標。

> ⚠️ **`openspec config` 指令只支援 global scope，但設定檔是專案層的**——兩者是不同的東西。
> 早期把指令的限制誤述成「專案預設進不了版控」，導致 `config.yaml` 長期沒被建立。

---

## change 命名

`<動詞>-<目標>`，kebab-case。動詞用既有的這幾個，不要自創：
`add-`（新增能力）、`fix-`（修錯）、`refactor-`（不改行為的重整）、
`enforce-`（把既有規則變成會失敗的檢查）、`improve-`（既有能力的增強）。

封存後路徑為 `openspec/changes/archive/<YYYY-MM-DD>-<name>/`。

（分支怎麼命名是**另一件事**，見 `CLAUDE.md` 的 Change lifecycle——
分支是交付單位，不跟 change 名綁定。）

---

## 守則怎麼查

`openspec-spec-format.spec.ts` 檢查命名前綴、標題行與目錄名一致、
`api-*` 的 endpoint 需求有無缺 Request/Response、以及 `ui-*` / `platform-*`
有沒有誤寫回應區塊。規則的內容見 schema，這裡只記「哪支守則在守」。
