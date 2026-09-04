> 每一塊（`##` 標題）須能獨立通過驗證鏈：`pnpm typecheck && pnpm lint && pnpm test`。
> 本 change 不動 controller / 路由 / module 接線 / swagger yaml，因此**不需要** `test:e2e`、`build`、`swagger:bundle`。
> 綠燈後給 commit 指令，由使用者手動執行，再進下一塊。
>
> **塊的依賴**：塊 1（openspec 設定 + 守則）與塊 2（pre-push）互相獨立，順序可換。
> **塊 3 必須先於塊 4**——`pr-body` skill 讀 `.github/PULL_REQUEST_TEMPLATE.md`，模板不在就等於搬進一支指向空檔案的 skill。
> 塊 5（教訓合併）與前四塊獨立，但排在最後，因為前面幾塊實作過程中踩到的東西要一起寫進去。
>
> 沒有 characterization test 塊：本 change 唯一動到的既有 production code 是
> `openspec-schema.spec.ts`（守則本身），而它的現行行為由塊 1 的反向驗證直接釘住。

## 1. openspec 專案設定進版控

- [x] 1.1 新增 `openspec/config.yaml`，內容為 `schema: spec-driven-custom`
- [x] 1.2 驗證它真的生效：以**不帶 `--schema`** 的 `openspec new change` 建一支測試用 change，確認產出的 `.openspec.yaml` 是 `spec-driven-custom` 而非內建 schema；確認後刪除該測試 change 並確認 `git status` 乾淨
      —— 另確認 `openspec config list --scope global` **沒有 `schema` 鍵**，排除「是全域預設造成的」這個替代解釋。少了這一步，1.2 什麼都沒證明
- [x] 1.3 `openspec-schema.spec.ts` 新增一則檢查：`openspec/config.yaml` 存在、可解析、且 `schema` 欄位為 `spec-driven-custom`。**既有的旗標檢查不動**——兩道並存是 design 的 D1
- [x] 1.4 修正該 spec 檔頂端 TSDoc 中「`openspec config` 只支援 global scope，專案預設 schema 進不了版控」的敘述：限制屬於 CLI 指令，設定檔本身是專案層的
- [x] 1.5 同步修正 `CLAUDE.md`「AI Development Workflow → Phase 2」段中同一句誤述，並補上「設定檔與旗標並存」的理由
- [x] 1.6 同步修正 `openspec/project/openspec-conventions.md` 中對應敘述
- [x] 1.6b `.claude/skills/openspec-propose/SKILL.md` 也寫著同一句誤述 —— **計畫時漏掉的第四處**，在 1.5 grep 誤述字串時才浮現。順帶補上「別因為有了 config 就省掉旗標」的理由，因為這支 skill 正是每次建立 change 的入口
- [x] 1.7 **反向驗證**：(a) `schema` 值改成 `spec-driven` → 新檢查紅、其餘五則綠；(b) 檔案移走 → 同一則紅、其餘綠；(c) 拿掉 skill 的 `--schema` → **既有那則**紅、新檢查仍綠（證明新增檢查沒頂替掉舊的）。三項逐一還原，`git status` 只剩本 change 的預期改動
      —— ⚠️ (a) 的還原**失敗過一次**：`mv` 被 alias 成 `mv -i`，非互動下靜默不覆寫，檔案停在壞掉的值上。是還原後的 `grep` 抓到的。後續改用 `command mv -f`。`lessons.md` 已有這條（原文寫 `cp`），這次換成 `mv` 又踩一次
- [x] 1.8 跑 `pnpm --filter @app/api test:arch`，貼出實際輸出 —— 守則 **19 支 / 69 項**（新增前 68），單元測試 48 支 / 281 項，`pnpm typecheck` 與 `pnpm lint` 皆綠

## 2. push 前的完整驗證

- [x] 2.1 新增 `.husky/pre-push`：沿用 `pre-commit` 既有的 nvm PATH 補救區塊，之後執行 `pnpm typecheck && pnpm lint && pnpm test:cov`
- [x] 2.2 檔內以繁體中文註解寫明它與 `pre-commit` 的分工（一個只 lint 改動檔、一個跑完整鏈）、以及它擋不住 `--no-verify`
- [x] 2.3 ~~確認檔案有執行權限（`chmod +x`）~~ —— **不需要，且刻意設回 644**：husky v9 的 `.husky/_/h` 是用 `sh -e "$s"` 呼叫，執行位元無關（既有的 `pre-commit` 就是 644 且正常運作）。給 755 只會讓 git 記錄一個無謂的 mode 差異
      —— `git config --get core.hooksPath` 的查詢被權限設定擋下，改由旁證確認：`.husky/_/` 底下 18 支 shim 齊全（含 `pre-push`），而 `pre-commit` 一直有在運作，代表 `core.hooksPath` 有值。仍列入 6.4 請使用者自行確認
- [x] 2.4 實機驗證：在 `pagination.ts` 植入一行型別錯誤 → `sh -e .husky/pre-push` 於 typecheck 階段報 `TS2322` 並以 exit 2 中止；還原後 `git diff` 為空、同一指令 `exit=0`。**兩個方向都驗**（只驗「破壞後會紅」不夠）
- [x] 2.5 `openspec/project/tooling.md` 補上兩層 hook 的分工說明，含 husky 失效時不報錯的診斷方式與「為何不加 `bash -n` 守則」的理由

## 3. PR / MR 模板單一真相

- [x] 3.1 新增 `.github/PULL_REQUEST_TEMPLATE.md`（繁體中文，五個章節 + 三項核取方塊）作為實體檔
- [x] 3.2 刪除 `.gitlab/merge_request_templates/Default.md` 的既有英文樣板內容——它含 `@Jack, @Charlie` 兩個與本專案無關的寫死審查者
- [x] 3.3 `.gitlab/merge_request_templates/Default.md` 改為指向 `.github/PULL_REQUEST_TEMPLATE.md` 的 symlink，**檔名維持大寫 `Default.md`**（改名會讓既有 MR 選單失效）
- [x] 3.4 確認 symlink 進得了版控：`git ls-files -s` 顯示 mode `120000`（實體檔 `100644`），不是被展開成副本

## 4. 三支自訂 skill

- [x] 4.1 搬入 `.claude/skills/grill-me/SKILL.md`，frontmatter 的 `metadata.author` 由 `nexus` 改為 `hexagonal-nest-express-mysql`，其餘內容不動
- [x] 4.2 搬入 `.claude/skills/pr-body/SKILL.md`，同上；它引用的 `.github/PULL_REQUEST_TEMPLATE.md` 正是塊 3 的實體檔位置，**一個字都不用改**
- [x] 4.3 搬入 `.claude/skills/tidy-todo/SKILL.md`，同上
- [x] 4.4 逐支確認無衍生專案專屬內容殘留（掃 `nexus` / `chat` / `websocket` / `postgres` / 聊天 / 檢舉 / 房間 / moderation，零命中）
- [x] 4.5 確認三支都沒有觸發既有守則：不含 `openspec new change`、不含日文字元
- [x] 4.6 跑 `pnpm test` —— 單元 48 支 / 281 項、守則 19 支 / 69 項全綠。三支 skill 已被 harness 載入並出現在可用清單中

## 5. 教訓合併

- [x] 5.1 判斷清單（衍生專案有、模板沒有的 24 條）：

      **收（17 條）**：husky 壞掉不報錯、反向驗證只看 exit code、描述規則的 spec 抓到自己、openspec MODIFIED 靠標題字串、靠自律的清單會漂移、design 風險要回頭確認、寫「實測 N 秒」前要真的量、人工驗收該寫成測試、驗競態不能循序呼叫、無狀態 Redis mock、極大值 mock 限流、`createE2EApp` 不套原生中介層、characterization test 機制無關、`advanceTimersByTimeAsync`、UI 驗收只看一種資料、feature flag 與空狀態、jsdom 缺的 DOM API

      **改寫後收（5 條）**：Prisma `///`（移除 `gen:comments` 與 PG `COMMENT ON`，改成 MySQL 的 `MODIFY COLUMN … COMMENT` 並加上「不建議開這個坑」的判準）、Prisma 7 CLI（`psql DROP SCHEMA` → 專案既有的 `drop-database.ts`）、DI 沒接線（`METRICS_PORT` 在模板不存在 → 改寫成通用敘述，並與「Nest 不能 re-export 沒 provide 的 token」**併為同一條**，兩者根因相同）、`down -v`（加註模板現況）、清單漂移（加註守則排在 C3）

      **不收（4 條）**：`NestFactory.create()` 不跑 `onModuleInit`、關閉 HTTP server ≠ `kill -9`、Socket.IO 不在 globalPrefix、PostgreSQL 專屬四則（`DELETE` 無 `LIMIT`、`pg_isready`、`postgres-verify` 的 tmpfs、PG healthcheck）——模板無對應元件

      ⚠️ **核對時修正了三條原本的判斷**：`METRICS_PORT` 與寄信限流（`EMAIL_SEND_RATE_LIMIT`）在模板**都不存在**，`stripComments` 也不在獨立檔而是在 `authorization-coverage.spec.ts` 裡。「共用計數器的兩種限流」因為模板沒有第二種限流而**不單獨收**，其通用判準（「問這個斷言在功能被拿掉之後還會綠嗎」）併進「極大值 mock」那條
- [x] 5.2 排除聊天 / WebSocket 專屬條目
- [x] 5.3 改寫後收錄「Prisma 的 `///` 註解不會進資料庫」
- [x] 5.4 收錄「`docker compose down -v` 的 `-v` 是專案的所有 volume」，加註記標明 `scripts/verify-ci.sh` 正踩著它、修復排在 C4
- [x] 5.5 依既有分節歸位；**新增一個 `## 容器 / Docker` 分節**——三條容器教訓在既有分節都無處可放（`單一埠部署 / ServeStatic` 講的是別件事）
- [x] 5.6 修剪：刪掉「改動 member context 後必須清快取」——與 `backend-runtime.md:14` **逐字重複**，屬「專案慣例，已在 project.md」那類。另把既有的「Husky pre-commit 在 nvm 環境找不到 pnpm」擴為涵蓋兩支 hook
- [x] 5.7 `traditional-chinese.spec.ts` 與 `project-docs.spec.ts` 皆通過；日文字元掃描零命中。288 行 → 473 行，分節 16 → 17

## 6. 收尾

- [x] 6.1 完整驗證鏈實際輸出：

      ```
      typecheck   api Done / web Done
      lint        api Done / web Done
      test:cov    api  單元 48 suites / 281 tests；守則 19 suites / 69 tests
                       All files 86.29 | 64.38 | 77.69 | 85.98（門檻 70/60/70/70）
                  web  All files 94 | 96.15 | 87.5 | 92.85（門檻 75/75/60/75）
      ```

      `test:cov` 是 CI 跑的那支，覆蓋率門檻一併通過
- [x] 6.2 更新 `tasks/todo.md`：勾掉 C1，並在 C4 條目加上「`verify:ci` 現在會清掉開發 volume」的警告——那是 C1 寫進 lessons 但要 C4 才修的東西
- [x] 6.3 本 change 新踩到的坑已寫進 `tasks/lessons.md`：alias 干擾那條從 `cp` 擴充到 `mv` / `rm`（今天一次踩到兩支），並補上「破壞後紅」單獨不成立、要連「還原後綠」一起看
- [x] 6.4 **需要使用者手動執行**：
      - 跑一次 `pnpm install`，讓 husky 的 `prepare` 確保 `.husky/_/` 與 `core.hooksPath` 就緒（`.husky/_/` 不進版控）
      - 確認 `git config --get core.hooksPath` 有值（此指令在 AI 的權限設定中被拒絕，無法代為確認）
      - 下次開 PR / MR 時確認模板真的被帶出來，GitLab 側是 symlink，若該平台不跟隨 symlink 需改回實體檔
