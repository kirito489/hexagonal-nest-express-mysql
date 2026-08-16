## Context

`openspec/specs/` 落後實作約 10 條守則需求，容器化能力完全未涵蓋。成因是近三輪
review 修復與 openspec 慣例整頓都以 block 方式直接改碼並直接編輯 master spec，
繞過了 delta spec → archive 合併的流程。

本 change 不改行為，只補登。因此設計上的問題不是「怎麼做」，而是
**「追認一批已完成的工作時，怎麼寫才不變成造假」**。

## Goals / Non-Goals

**Goals:**

- 讓 `openspec/specs/` 與實作一致，且每條需求都對得上現存的測試。
- 為容器化建立可驗收的契約，而非把 `tooling.md` 的說明複製一份。

**Non-Goals:**

- 不新增、不修改任何程式碼行為。
- 不追認「當時的思考過程」——那是 `tasks/todo.md` 已完成區與 git log 的職責。
- 不回頭補寫前幾輪各自的 change 資料夾。那些工作分散在多個主題上，
  硬拆成數個追認 change 只會製造與實際開發順序不符的假紀錄。

## Decisions

**用單一追認 change，而非為每輪 review 各補一個。**
替代方案是依三輪 review 各開一個 change。否決理由：那會**捏造一個不存在的開發順序**
——實際上這些工作是交錯進行的（容器化夾在第一輪與第二輪 review 之間）。
單一 change 誠實地表達「這是一次補登」，比三個看似規劃過的 change 更接近事實。

**tasks.md 全部標 `[x]` 並在檔頭寫明是追認。**
替代方案是留 `[ ]` 假裝尚未執行。否決理由：那會讓 `openspec status` 顯示未完成，
而實際上程式碼早已在版控裡並通過完整驗證鏈——留下的是錯誤資訊而非待辦。

**容器化開立新能力 `platform-container-dev`，不併入 `platform-monorepo-workspace`。**
後者描述的是 workspace 結構與套件管理，容器化是獨立的部署／開發環境維度，
兩者的變更理由不同。併在一起會讓「改 compose」與「改 workspace 結構」共用一份規格。

**每條新守則需求都必須指得出對應的測試。**
這是避免補登變成憑印象寫作的唯一約束——寫不出對應測試的就不寫進 spec。

## Risks / Trade-offs

- [追認 change 可能被誤讀成「當初就這樣規劃」] → 檔頭與 tasks.md 明確標示為補登，
  並在 proposal 的 Why 說明成因是繞過流程。
- [補登的 spec 與實作再度分歧] → 每條需求對應一支現存測試；守則本身的數量與清單
  已由 `openspec/project/testing.md` 的表格 + 機器比對維持一致。

## Migration Plan

無。純文件變更，archive 時 delta spec 併入 master 即完成。

## Open Questions

- 是否要為「change 命名動詞白名單」補一支守則？本 change 的初始命名
  （`record-`）就違反了自己訂的規範，靠人工發現。已記入 `tasks/todo.md`。
