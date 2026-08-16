> 每一塊（`##` 標題）須能獨立通過驗證鏈：
> `pnpm typecheck && pnpm lint && pnpm test`
> 綠燈後給 commit 指令，由使用者手動執行，再進下一塊。
>
> **本檔為追認補登。** 塊 1 描述的程式碼在本 change 建立前就已完成、commit 並通過
> 完整驗證鏈（見各 commit 與 `tasks/todo.md` 已完成區），故全部標 `[x]`；
> 留 `[ ]` 只會讓 `openspec status` 顯示錯誤資訊。塊 2 是本 change 實際執行的工作。
>
> 兩塊互相獨立：塊 1 的程式碼已在版控裡，塊 2 純文件。

## 1. 已完成的實作（追認，非本次執行）

- [x] 1.1 守則新增 10 條：openspec schema 執行路徑、master spec 命名與格式、
      `project.md` 連結完整性、swagger 成功狀態碼、e2e spec 位置、opsx 指令薄殼、
      compose 執行路徑與埠號、sanitize 敏感欄位覆蓋、全域 guard 註冊與順序、
      繁體中文掃描、授權裝飾器覆蓋
- [x] 1.2 每條守則皆經反向驗證（插違規探針 → 看它變紅 → 還原 → 確認 `git diff` 乾淨）
- [x] 1.3 容器化：`Dockerfile`（僅 dev target）+ 單一 `compose.yml`（三種用法）
      + `docker/api.container.env`（遮蔽 host 環境檔）
- [x] 1.4 容器化以行為測試驗收：登入打通 web proxy → api → MySQL + Redis；
      熱重載以「改回應內容再打 API」驗證，**不以日誌為準**
- [x] 1.5 護欄 11 支 / 32 項 → 19 支 / 61 項

## 2. 補登 spec（本次執行）

- [x] 2.1 `platform-engineering-guardrails` 補 10 條需求，每條都指得出對應的測試
- [x] 2.2 新增能力 `platform-container-dev`，涵蓋單一 compose 的三種用法、映像定位、
      `node_modules` 遮罩、host 環境檔隔離、前後端熱重載的成立條件
- [x] 2.3 ~~為三輪 review 各補一個 change~~ —— **不做**：實際工作是交錯進行的
      （容器化夾在第一輪與第二輪 review 之間），拆成三個會捏造不存在的開發順序。
      理由寫進 `design.md` 的 Decisions
- [x] 2.4 順帶修掉兩支 master spec 的 `TBD - created by archiving change …` 佔位符
      （`platform-monorepo-workspace`、`platform-api-client-generation`，從未被填）
- [x] 2.5 archive 兩個動詞離群值改名：`setup-monorepo-frontend` → `add-monorepo-frontend`、
      `paginate-member-role-options` → `refactor-member-role-options`
- [x] 2.6 `openspec validate` 通過（14 支 master spec + 本 change）

## 3. 收尾

- [x] 3.1 跑完整驗證鏈並貼出實際輸出
- [x] 3.2 `tasks/todo.md` 補本輪紀錄；`tasks/lessons.md` 補「negative space 規則」的教訓
- [x] 3.3 archive 本 change：delta spec 已併入 master（guardrails 22 → 32 條、新增 platform-container-dev 6 條）

<!--
  本 change 自身暴露的一個缺口，已記入 todo：
  初始命名用了 `record-`，不在專案訂的動詞白名單（add / fix / refactor / enforce / improve）
  ——**第一個使用新 schema 的 change 就違反了自己訂的規範**，且是靠人工發現。
  change 命名目前沒有守則檢查。
-->
