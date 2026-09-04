# platform-ai-collaboration Specification

## Purpose

定義 AI 協作流程本身的契約：自訂 skill 的職責邊界與可攜性要求、PR 描述的產出方式，
以及兩份記憶檔（`tasks/lessons.md` 與 `tasks/todo.md`）該收什麼、該排除什麼、何時更新。

與 `platform-engineering-guardrails` 的分工是**誰在執行**：那份規範機器守得住的規則
（型別、lint、架構測試、CI），這份規範的對象是流程本身——多數條目沒有守則能擋，
寫成需求是為了讓它們至少有一份可對照的依據，而不是散在 `CLAUDE.md` 的行為規則裡。

收錄判準是**可攜**：這裡的東西要能跟著模板 fork 出去仍然成立，
因此不寫任何綁定單一專案的路徑、模組名或人名。

## Requirements
### Requirement: 自訂 skill 的職責邊界

`.claude/skills/` SHALL 只放**流程知識**——把一件反覆做的事寫成可依循的步驟與判斷準則。每支 skill MUST 是該流程的單一真相，`.claude/commands/` 底下的同名指令只負責轉呼叫，不得再抄一份流程。

skill 的內容 MUST 帶得走：不得寫入只在單一衍生專案成立的路徑、模組名或人名。frontmatter 的 `description` MUST 寫清楚**什麼時候該用它**，因為那是它被選中的唯一依據。

模板 SHALL 提供下列三支通用 skill：

| skill | 職責 |
| --- | --- |
| `grill-me` | 對一份計畫或設計逐個分支追問，直到每個決策點都有答案 |
| `pr-body` | 讀 PR 模板與該分支的 openspec change，產出可直接貼上的描述 |
| `tidy-todo` | change 收尾時逐節核對 `tasks/todo.md`，修掉被這次改動放過期的條目 |

#### Scenario: skill 寫入衍生專案專屬內容

- **WHEN** 某支 skill 提到只在特定衍生專案存在的模組、路徑或人名
- **THEN** 該內容 MUST 改寫為模板通用敘述，或整條移除

#### Scenario: 指令檔重新抄回流程

- **WHEN** `.claude/commands/` 底下的指令不再只是轉呼叫而是自帶完整流程
- **THEN** 視為違規——由 `platform-engineering-guardrails` 的薄殼檢查攔截

### Requirement: PR 描述的產出方式

專案 SHALL 提供單一份 PR / MR 模板，GitLab 與 GitHub 兩側 MUST 指向同一份內容，不得各自維護。

`pr-body` skill SHALL 從模板檔與該分支的 openspec change 取材，MUST NOT 要求使用者貼上模板。產出 MUST 為繁體中文。

skill MUST 遵守下列三條，因為它們各自對應一種實際發生過的失真：

- **「背景與取捨」寫被否決的選項與理由**，不得複述 proposal 的 Why——審查者要看的是還考慮過什麼、為什麼沒選。
- **「怎麼驗證」不重複 CI 已涵蓋的檢查**（`typecheck` / `lint` / `test:cov` / `e2e`），只寫 CI 驗不到、需人工確認的部分。
- **未勾的核取方塊 MUST 註明原因**。「不適用」「刻意延後」「跑了但失敗」三者在空白方框上長得一模一樣，而其中只有一種是可以接受的。

skill MUST NOT 執行 `gh pr create` / `gh pr edit`——產出交給使用者張貼。

#### Scenario: 分支沒有對應的 openspec change

- **WHEN** 該分支找不到 `openspec/changes/<name>/` 也找不到對應的封存資料夾
- **THEN** 依 commit 與 diff 撰寫，並明講理由來源受限，MUST NOT 自行編造動機

#### Scenario: 勾選未實際執行的檢查

- **WHEN** 某項核取方塊對應的指令並未真的跑過
- **THEN** MUST NOT 勾選——勾選等於宣稱一次沒有發生的執行

### Requirement: 教訓檔的收錄與排除規則

`tasks/lessons.md` SHALL 只收**真正的陷阱**：踩過之後才知道、而且下次還會再踩的東西。每條 MUST 說明踩到什麼、為什麼會這樣、以及下次怎麼套用。

下列三類 MUST NOT 留在教訓檔：

| 類別 | 處置 |
| --- | --- |
| 只是複述官方文件的知識 | 刪除 |
| 專案慣例與架構決策 | **先移到 `openspec/project.md`，再從教訓檔刪除**——不得直接丟棄 |
| 已有守則擋著的規則 | 刪除——機器抓得到的事不需要人記得 |

教訓檔 SHALL 定期修剪而非只增不減。從衍生專案回補教訓時，每條 MUST 能對應到模板現存的程式碼或流程；對不上的不收。

#### Scenario: 收錄綁定衍生專案技術棧的教訓

- **WHEN** 某條教訓建立在模板沒有的元件上（如 WebSocket 連線層、PostgreSQL 專屬語法）
- **THEN** MUST NOT 收錄；若其機制與該元件無關，則改寫成只講機制後收錄

#### Scenario: 教訓所述的缺陷尚未修復

- **WHEN** 某條教訓對應的問題在模板中仍然存在，修復排在後續 change
- **THEN** 該教訓 SHALL 先行收錄並註明現況，因為在修復之前踩到的人需要它

### Requirement: 待辦檔的更新時機

`tasks/todo.md` SHALL 在四個時機更新：開工前記下要做什麼、完工後把已完成項移到已完成區、發現跨 change 的副作用時立即記錄、因外部相依而延後時記下原因與解除條件。

**完成當下就回頭勾掉** MUST 被遵守——本專案曾有兩條早已完成的待辦掛了近一個月，讓人誤判專案現況。

#### Scenario: change 收尾時待辦與事實不符

- **WHEN** 某支 change 封存時，`todo.md` 仍有條目描述已完成或已失效的工作
- **THEN** 收尾流程 SHALL 逐節核對並修正，不得憑印象打勾

