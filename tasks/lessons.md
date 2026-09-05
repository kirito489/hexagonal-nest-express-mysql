# Lessons 踩坑紀錄

> 只記**踩過的坑**：非顯而易見、有具體現象與根因、下次還會再踩的。新 session 開工前先讀；被糾正或踩到坑時立即記錄。

## 撰寫格式

**三類東西不屬於這裡**，寫進來只會稀釋真正重要的內容：

| 不收 | 該去哪 |
| --- | --- |
| 官方文件查得到的基本知識 | 刪掉（如「改 schema 後要 `prisma generate`」） |
| 專案慣例與架構決策 | `openspec/project.md`（**先搬再刪**，不要弄丟資訊） |
| 已被護欄自動擋住的 | 刪掉——機器在守就不需要人記得 |

**條目累積後要定期回頭整理**，不是只增不減：2026-08-14 一次整理從 102 條降到 69 條，砍掉的全是上表三類。沒整理的 lessons 會變成沒人讀的雜訊。

**依主題分組**（Prisma / JWT / NestJS…）而非日期流水——同主題聚在一起才找得到。

每條 lesson 都要涵蓋三件事：**踩到什麼**（現象 / 錯誤訊息 / 做錯了什麼）、**Why**（根因：哪個工具的哪個行為造成）、**How to apply**（下次怎麼避免 / 怎麼套用）。依複雜度選格式：

**短規則**（一兩句話講得完）維持單行 bullet：

```markdown
- **規則**：機制 + 套用方式。
```

**複雜教訓**（有具體現象、需要解釋根因）用三段式，標題帶日期：

```markdown
### YYYY-MM-DD — 一句話標題

**踩到什麼**：現象 / 錯誤訊息 / 做錯了什麼。

**Why**：根因 — 哪個工具的哪個行為、哪個慣例造成。

**How to apply**：下次遇到怎麼避免。
```

判準：**寫出來超過三行就改用三段式**。長 bullet 塞五百字讀不動，也找不到重點。

## 工作流程 / 驗證方法

### 2026-08-14 — 「設定寫了但沒有執行路徑」是本專案最常見的缺陷型態

**踩到什麼**：一輪稽核抓到**七個**同型問題——`eslint.config.mjs` 的 `test/**` 區塊不在 lint glob 內、PostToolUse hook 跑的 `npx tsc` 在 root 根本跑不起來、CI 完全不跑 test/lint/typecheck、四個覆蓋率門檻沒有任何指令帶 `--coverage`、兩個 `.js` 設定檔不在任何檢查範圍、`gen:module` 產出物不符合新護欄、`overrides` 宣告在 pnpm 根本不讀的位置。

**Why**：加設定的當下只想「規則內容對不對」，沒問「哪個指令會執行它」。這類缺陷**沒有任何工具會警告**，而且「看起來有保護」比完全沒有保護更危險——它讓人停止懷疑。

**How to apply**：新增任何門檻 / 規則 / hook 時，明確寫出「哪個指令、哪個 job 會執行它」，並**插探針驗證它真的會失敗**。審查既有設定時，優先查執行路徑而非設定內容。三個高頻盲區：`.js` 設定檔（tsc 不掃、lint glob 常漏）、產生器產出物（架構測試掃不到「還沒產生的程式碼」）、文件裡的路徑與指令（重構後無人通知）。

### 2026-08-14 — 反向驗證的還原步驟本身也要驗證

**踩到什麼**：插探針驗證規則會不會紅，之後用 `cp backup.js target.js` 還原，指令跑完顯示 `overwrite? (y/n [n]) not overwritten`——**檔案根本沒還原**，是後續跑測試才發現。

**Why**：多數環境把 `cp` alias 成 `cp -i`，非互動情境下互動提示會靜默變成「不覆寫」。**`mv` 與 `rm` 同樣中招**（2026-09-04 的 `platform-ai-workflow-backport` 一次踩到兩支：`mv` 讓 `config.yaml` 停在壞掉的值上、`rm` 讓舊的 MR 模板沒被刪掉），而它們的提示混在其他輸出裡很容易看漏。

**How to apply**：還原一律用 python 字串替換、`git checkout --`，或在腳本裡用 `command mv -f` / `command cp -f` / `rm -f` 繞過 alias。還原後**實際驗證**（跑一次該檔的載入或測試，或直接 `grep` 那一行）。

反向驗證的完整循環是「插探針 → 親眼看它紅 → 還原 → **親眼看它綠** → 確認 `git status` 乾淨」。**「破壞後會紅」單獨不成立**——那個條件對假測試也成立；要連「還原後會綠」一起看到，兩個 exit code 都要出現過。最後一步不能省。

### 2026-08-16 — 「測試全綠」不等於「改動被驗證過」，要先確認有測試載入那段程式碼

**踩到什麼**：驗證 path alias 可行性時，把一支檔案的 import 改成 `@app/*`，跑 `pnpm test` 得到 234 全綠，一度判定「ts-jest 開箱支援 alias」。實際上**沒有任何單元測試會載入那支檔案**——另寫一支探針 spec 直接 import 它，才看到 ts-jest 根本解析不了 `@app/*`，需要 `moduleNameMapper`。

**Why**：測試套件的綠燈只覆蓋「被執行到的程式碼」。改動落在測試沒觸及的檔案時，全綠是**無資訊**而非正面證據，但它在心理上和真正的驗證完全一樣，會直接中止追查。

**How to apply**：驗證某個機制可不可行時，不要用「跑既有測試看有沒有紅」當判準——**寫一支直接觸發該機制的探針**，看它由紅轉綠。判斷既有測試有沒有覆蓋到，最快的方式是把改動處故意改壞，若測試仍全綠就代表沒人載入它。

- **用 grep 判斷「還有沒有人在用」會漏多行寫法**：移除 `TestAppOverrides.prisma` 前用 `grep "createE2EApp({" | grep prisma` 判定「0 處在用」，實際上 `serve-static.e2e-spec.ts` 是多行寫法（`createE2EApp({\n  prisma: …`），grep 抓不到，最後是 typecheck 攔下的。作法：判斷「是否還有呼叫端」時，**優先移除後跑 typecheck**（編譯器天生跨行），grep 只當快速預覽；真要用 grep 就搭配 `-A3` 或直接搜屬性名而非整個呼叫式。

- **文件裡的路徑與指令要用機器驗證**：重構改了目錄或 script 名，文件不會有任何工具通知。作法：(1) regex 抓出文件所有 `` `apps/**` `` 路徑逐一 `exists()`；(2) 抓出提到的 `pnpm` script 逐一比對 `package.json`。一次就抓出 4 處過時（含存在一個月的 Swagger 網址）。
- **JSDoc 裡不要寫含 `*/` 的 glob**（如 `test/**/*`）：`*/` 提前終止註解，整個檔案語法爆掉；若在 `.js` 設定檔更致命——`typecheck`／`lint` 都不掃，只有實際執行才炸。
- **regex 的 `\s` 包含換行**：`/^(\s*)ANCHOR$/m` 的 `^` 可能匹配到前一空行行首，`\s*` 跨行吃掉換行，`$1` 就夾帶了換行。只想抓行首縮排時用 `[ \t]*`。
- **完成當下就更新 `todo.md`**：曾有兩條安全待辦早已實作完成卻掛著近一個月，讓人誤判專案現況。收尾時**先 grep 原始碼再更新**，不要憑印象。

### 2026-08-16 — 改動的「接縫」比功能內部更容易出事，尤其是向後相容那一行

**踩到什麼**：把 token 黑名單從 boolean 改成 reason 時，adapter 對舊格式的值回 `null`。註解寫「舊格式當成非遭竊處理」——方向對，但 `null` 在呼叫端的語意是「不在黑名單」，於是連拒絕都跳過，既存的已登出 token 全部復活。同一輪還有三個同型問題：fail-closed 的決定沒傳達到文件、compose 合併沒帶到 `docker/` 的註解、`.dockerignore` 與守則測試各自合理卻相衝。

**Why**：每個決定**單獨看都是對的**，錯在交界處沒有人負責。而且這類問題 CI 全綠——上層邏輯的測試涵蓋不到翻譯層的語意錯誤（service 收到任何 truthy 值都會正確拒絕，問題是 adapter 根本沒給它 truthy 值）。

**How to apply**：(1) 改變某個回傳型別的語意時，**逐一列出所有可能值與呼叫端的解讀**，特別注意「查無資料」與「有資料但無法解析」是否被壓成同一個值；(2) 向後相容的分支**必須有測試**，而且測試要下在**做翻譯的那一層**，不是上層；(3) 改了某個決定（fail-open → fail-closed、合併檔案、改名）後，搜尋所有描述舊行為的文件與註解——它們不會有任何工具提醒。

### 2026-08-16 — 「檢查應存在而不存在」的規則最難想到，卻擋得住最嚴重的問題

**踩到什麼**：`AttachmentController` 兩支端點一個授權裝飾器都沒有，任何已登入者可刪任何人的附件。它**通過了當時全部 18 支守則、260 支單元測試與 e2e**——因為每一條既有規則它都遵守，只是少了沒有規則要求它有的東西。三輪審查都沒掃到，因為前兩輪的授權檢查對象都是「有標註的 controller」。

**Why**：既有守則驗證的是「**有標的標對了**」，漏洞出在「**該標的標了沒**」——檢查方向是反的。全域 guard「沒標註就放行」的設計本身正確（讓全域註冊不影響未標註路由），但它的前提是「該標的都標了」，而沒有任何東西在守這個前提。

**How to apply**：寫守則時除了問「這條規則怎麼寫」，要多問一句「**什麼東西的缺席才是問題**」。這類 negative-space 規則的判準通常很簡單（本例：收 `@Param` 且非 `@Public` 就必須有授權裝飾器），難的是意識到要寫。新增 controller、新增需要授權的端點時，在補守則之前這是 review 必須人工確認的項目。

### 2026-08-17 — 字串比對型的守則必須先去註解，否則說明文字會把規則餵飽

**踩到什麼**：`authorization-coverage.spec.ts` 用 `classHeader.includes('@Roles(')` 判斷 class 有沒有授權裝飾器，而 `classHeader` 取的是 `export class` 之前的全部內容——**包含檔頭 TSDoc**。`SecurityController` 的註解寫著「刻意用 RolesGuard + @Roles(SUPERADMIN) 粗粒度 role gate」，於是實測把真的 `@Roles` 裝飾器刪掉、只留註解，守則照樣 61 全綠。

**Why**：靜態掃描把註解與程式碼一視同仁。而**說明某個裝飾器**的註解，恰好最常出現在「有那個裝飾器」的檔案裡——偽陰性因此特別容易發生在「本來就正確」的地方，等到有人重構移除裝飾器（先改 code、註解晚點再說）才顯形，且不會有任何徵兆。

**How to apply**：任何用字串比對找裝飾器 / 關鍵字的守則，比對前一律 `stripComments`。判斷 class 層級時再進一步只取 `@Controller(` 到 `export class` 之間——那段不可能夾註解。另外兩個同批踩到的切割錯誤：(1) handler 切塊要**往前**吃掉連續的裝飾器行，否則寫在 `@Post()` 上方的 `@Public()` 會被歸給前一個 handler，造成前一支漏報、本支誤報；(2) 守則本身要有**合成輸入的自我測試**——守則出錯是靜默的，而給偽陰性的守則比沒有守則更危險，它會讓人停止人工檢查。

### 2026-09-02 — 反向驗證只看整體 exit code，會被「別支守則的紅燈」冒名頂替

**踩到什麼**：新寫了一支守則斷言某個 controller 仍有 `@Roles(RoleCode.SUPERADMIN)`。反向驗證時把該裝飾器註解掉、跑 `test:arch`、得到 `exit=1`，就判定守則有效。實際上紅的是既有的 `authorization-coverage.spec.ts`（它也在檢查同一個裝飾器），**新寫的那支從頭到尾都是綠的**——因為正規式沒去註解，`// @Roles(...)` 照樣被比中。

**Why**：一次破壞可能同時踩到多支守則，而 exit code 是整包的。「破壞後紅」這個條件對假守則也成立，所以它證明不了任何事。

**How to apply**：反向驗證要看**失敗的測試名稱**，不是 exit code——用 `pnpm --filter @app/api test:arch 2>&1 | grep -E "✓|✕"` 之類的方式看清單，確認變紅的正是你剛寫的那一支、而且**其餘的仍然是綠的**。另外**每支新守則至少要試兩種破壞方式**（如「註解掉」與「整行刪掉」）：只試一種時，正好避開自己實作缺陷的機率不低。

（去註解本身的規則見上一條，`stripComments` 目前實作在 `test/architecture/authorization-coverage.spec.ts`。本條記的是**驗證方法**的缺陷，不是規則寫法。）

### 2026-08-20 — 描述規則的 spec 會被自己的規則抓出來

**踩到什麼**：新增「某類 spec 不得使用某個區塊標籤」的守則後，封存時把該規則寫進 `platform-engineering-guardrails` 的 spec，守則立刻紅——**被抓出來的正是那份描述規則的 spec**。因為它的 scenario 寫著「WHEN … 出現 `**Success Response**`」，而判斷式是 `body.includes('**Success Response**')`。

**Why**：與「註解冒充裝飾器」同型但不同處——那次是註解，這次是**規則自身的文件**。而且這個缺陷早就存在（`includes` 一直是這樣寫的），只是先前沒有任何 spec 提到過那個字串，所以從未觸發。**規則越是被完整記載，越容易踩到自己。**

**How to apply**：字串比對要能區分「使用」與「提及」。Markdown 的區塊標籤在**實際使用時一律在行首**，在行文中提及則是夾在句子裡的行內程式碼。改用 `/^\s*<escaped>/m` 判斷即可分開兩者。凡是「規則本身會被寫進 spec / 文件」的檢查，都要先問一句：**這條規則描述自己的時候會不會違反自己？**

### 2026-09 — 靠自律維護的清單一定會漂移，即使寫它的人就是加東西的人

**踩到什麼**（衍生專案案例）：`openspec/project/testing.md` 有一張「每支守則守住什麼」的表，列 19 支而實際 29 支。**漏掉的 10 支裡有好幾支是同一個人前幾個 change 剛加的**——加的時候完全沒想到要回頭補表。

**Why**：那張表沒有任何機制檢查完整性，而「新增守則」與「更新那張表」是兩個分開的動作，中間沒有東西把它們綁在一起。

**How to apply**：清單型的文件要由機器檢查完整性——例如一條「每一支 `test/architecture/*.spec.ts` 都必須出現在 `testing.md` 裡」的守則，沒補就紅。判準：**如果一份文件的正確性取決於「有人記得更新」，那它遲早會錯**，而唯一會被記得的時機是 CI 變紅的那一刻。同理，文件裡寫死的規模數字（「N 支規則檔 / M 項斷言」）也是這類清單。

> 本專案的 `guardrail-inventory.spec.ts` 排在 `platform-guardrail-backport`（C3）。在它落地之前，`CLAUDE.md` 與 `README.md` 寫的守則數量都是過期的（實測 19 支 / 69 項，文件寫 11 支 / 32 項）。

### 2026-09 — design 裡列為「風險」的東西，實作後要回頭確認它發生了沒

**踩到什麼**（衍生專案案例）：首頁設計了一張「快速入口」卡，design 的 Risks 有一條「快速入口與 Sidebar 顯示同一批東西，可能顯得重複」，緩解寫的是「真的覺得吵時該調的是呈現密度」。實作完看畫面——**它就是重複的**，正確答案是整張拿掉，不是調密度。

**Why**：版面的重複**只有看到畫面才判斷得出來**。寫 design 時能想到那個風險，但想不出它的嚴重程度；而「緩解措施」是在還沒看到東西時寫的，所以它猜錯了方向。

**How to apply**：Risks 不是寫完就結案的清單。**實作完要逐條回去問「這個發生了嗎」**，發生了就處理，並把結論寫回 design——那比原本的預測有價值得多。順帶：功能拿掉之後，**為它抽出的抽象也要收回**，沒有第二個呼叫端的抽象不該存在。

### 2026-09-02 — 寫「實測 N 秒」之前要真的量，否則那個數字會被後人當成依據

**踩到什麼**（衍生專案案例）：給 api 容器加 healthcheck 時，在註解裡寫「實測容器內首次 `nest build` 約 40–60 秒」並據此設 `start_period: 90s`。**那個數字是憑印象寫的。** 實際量（刪掉 `dist/` 與 `.tsbuildinfo` 後重啟）是 **6 秒**。

**Why**：帶「實測」兩個字的數字會被下一個人當成不必再驗證的事實，於是錯誤的依據會一直傳下去——而且它擋住了「這個值是不是太保守」這個該被問的問題（`start_period` 太長時，應用真的壞掉也要等滿才會失敗）。

**How to apply**：註解裡的數字要分兩種寫法——**量到的**要寫出量測條件（「熱機器、映像已建好、node_modules volume 已填充」），**沒量到的**要明說是餘裕並寫出代價。反向驗證同理：若試著改壞某個值想看它變紅、結果沒紅，那代表**沒能構造出失敗案例**，就該照實記，而不是當成驗過了。

### 2026-09 — 人工驗收步驟如果每次都要重跑，就該寫成測試

**踩到什麼**（衍生專案案例）：tasks 寫「用兩種權限的帳號各登入一次看畫面」。實際做的時候發現 seed 只有一個 SUPERADMIN——要驗低權限得先開帳號、指派角色、再登入一次，**而那個流程每次驗證都要重跑一遍**。

**Why**：把驗證寫成人工步驟時，很容易只想到「這次怎麼驗」，沒想到「每次都要這樣驗」。一個需要五分鐘前置的人工步驟，第二次就不會有人做了。

**How to apply**：人工驗收留給**只有人眼判斷得出來的東西**（版面、文案、體感）。「有權限看得到、沒權限看不到」是**邏輯**，寫成元件測試每次 `pnpm test` 都跑，比點兩次可靠。

## Prisma / 資料庫

- **軟刪除 model 的所有 read path 都要加 `deletedAt: null`**：`findUnique` 只接受 unique 欄位，要過濾軟刪得改用 `findFirst({ where: { id, deletedAt: null } })`。`count` 用於「是否還有相關紀錄」判斷時（如阻擋刪除有成員的角色）也要排除軟刪，否則永遠刪不掉。例外是「恢復」場景才用 `loadIncludingDeleted` 顯式 opt-in。

- **一次性 token 要原子 claim**：`validateToken + markUsed` 兩步驟之間有 bcrypt 雜湊，併發請求可雙雙通過。改用 Prisma extended where 在單一 UPDATE 同時檢查條件 + 標記使用（`update({ where: { token, usedAt: null, expiresAt: { gt: now } } })`），找不到 record 會丟 P2025。

- **P2002 要在 Repository 層轉成 domain exception**：`findByEmail + create` 存在競態。Repository 的 `create` 外層 try/catch，`err.code === 'P2002'` 時丟 domain exception；Service 層不該感知 Prisma 錯誤。

- **MySQL 9 本機開發要設 `allowPublicKeyRetrieval: true`**：MySQL 9 預設 `caching_sha2_password`，非 TLS 連線冷快取下首次認證需向 server 取 RSA 公鑰，取不到會 `ER_CANNOT_RETRIEVE_RSA_KEY`。生產走 TLS 時此選項無作用。

- **Docker MySQL 剛啟動的前幾秒會 pool timeout**：容器要 5–30 秒才完整 ready，這段期間 Prisma adapter 建不起連線（`pool timeout after 10000ms`），但 mysql2 直連正常。等 10 秒重試即可。

### 2026-08-20 — Prisma 的 `///` 註解不會進資料庫，只進 Client 的 JSDoc

**踩到什麼**：以為在 `schema.prisma` 的欄位上加 `///` 描述、重跑 `prisma migrate dev` 就會把描述寫進資料庫。實際上 migration 的 SQL **一個字都不會變**，直接查資料庫什麼也看不到。

**Why**：`///` 是 Prisma 的 documentation comment，只流向產生的 Prisma Client `.d.ts`（成為 JSDoc）與 DMMF。Prisma **從不產生資料庫端的欄位註解**，那完全不在它的職責範圍內。兩者是各自獨立的機制，不是同一份資料的兩種呈現。

**How to apply**：先確認你要的是哪一層——只要 IDE hover 看得到就 `///` 就夠了。若要資料庫端也看得到（`SHOW FULL COLUMNS`、DBeaver、直接查庫的人），得在 migration 裡手寫 MySQL 的 `ALTER TABLE … MODIFY COLUMN … COMMENT '…'`，而那是**第二份需要同步維護的真相**——沒有工具會告訴你兩邊不一致。除非真的有人直接查庫，否則不建議開這個坑。

### 2026-08-20 — Prisma 7 的 CLI 移除了數個常用旗標，且非 TTY 下會靜默卡住

**踩到什麼**：`prisma migrate dev --skip-generate` 報 `unknown or unexpected option`；`prisma migrate reset --force --skip-seed` 直接以 status 130 結束，錯誤輸出被 ts-node 的堆疊蓋掉，看起來像當掉。

**Why**：Prisma 7 精簡了 migrate 子指令的旗標（`--skip-generate` 已不存在）。而偵測到 drift 時 `migrate dev` 會要求互動確認，在非 TTY（腳本、CI、agent）環境下拿不到輸入就以 130 收場——那是 SIGINT 的退出碼，不是「壞掉」。

**How to apply**：先用 `prisma <cmd> --help` 確認旗標存在。要在非互動環境重建資料庫，與其跟 `migrate reset` 的提示搏鬥，不如用專案既有的 `scripts/drop-database.ts` + `create-database.ts` 砍掉重建再 `migrate dev`——沒有 drift 就不會有提示。管線加 `< /dev/null` 可讓它立刻失敗而不是掛著等輸入。

## JWT / 認證

- **簽 token 時必須帶 `type: 'access'`**：`JwtAuthGuard` 有 `payload.type !== 'access'` 檢查，缺這個欄位會拒絕所有請求。`JwtPayload.type` 設為必填 union。

- **`REFRESH_SECRET` 必填且不可與 `ACCESS_SECRET` 相同**：optional 化會 fallback 到 JwtModule 的 default secret（= ACCESS_SECRET），雙 secret 失去意義（access 洩漏 = refresh 也洩漏）。

- **`@nestjs/jwt` 的 `sign`/`verify` 會 merge module 的 options**：`issuer`/`audience` 在 `jwt.module` 設一次即可，各呼叫點即使帶 per-call options（`secret`、`expiresIn`）也會套用同一組 iss/aud。注意**改 iss/aud 屬破壞性變更**——既有 token 全部失效，部署後所有人要重新登入。

- **`JwtAuthGuard` 的快取命中與 DB 查詢兩條路徑都要檢查 `member.status`**：只檢查一條的話，停用帳號的舊 JWT 在自然過期前仍可通行。

- **`/auth/forgot-password` 的時間差列舉是已知殘留風險**：email 不存在立刻 return（~10ms），存在則要寫 DB + 寄信（~100ms-1s），可被用來列舉註冊 email。已緩解：per-route `@Throttle({ limit: 3, ttl: 60s })`、回 204 不帶 message、log 不寫 email。要根除得引入 queue 或固定 delay，成本不划算。

## NestJS / HTTP 層

### 2026-07 — Express 5 的 Request augmentation 用 `declare module` 會 silent fail

**踩到什麼**：要幫 `Request` 擴 `member` 欄位，照慣例寫 `declare module 'express-serve-static-core' { interface Request { … } }`。typecheck **通過**，但取用 `request.member` 仍報 `TS2339`。

**Why**：Express 5 的型別把 `Request` 宣告在 `declare global { namespace Express { … } }` 之內，**不是 module export**。對 module 做 augmentation 找不到目標介面，TS 不報錯、只是靜默無效。

**How to apply**：改用 global namespace 形式，檔尾加 `export {}` 讓 TS 視為 module，放在 `src/types/*-augment.d.ts`：

```ts
declare global {
  namespace Express {
    interface Request { member?: MemberContext }
  }
}
export {};
```

- **Express 5 下 literal 路由會被 `:id` 吃掉**：`@Patch('bulk-status')` 即使宣告在 `@Patch(':id')` 之前仍可能被後者先匹配。解法：用兩段式路徑（`bulk/status`），`:id` 只匹配單一 segment。

### 2026-08 — DI 接線壞掉時，typecheck / lint / test / build 四個全綠，只有 e2e 抓得到

**踩到什麼**（衍生專案案例，兩次同型）：(1) 替既有 adapter 加了一個 `@Inject(SOME_PORT)` 相依，四個指令全綠，跑 e2e 才炸 `Nest can't resolve dependencies ... at index [2]`，10 支 suite 一起紅。(2) 把一個 token 搬到新模組後，原模組改成 `imports: [NewModule]` 但 `exports` 還留著那個 token，同樣四綠，e2e **409 支全紅**：`Nest cannot export a provider/module that is not a part of the currently processed module`。

**Why**：DI 的接線在**執行期**才解析。單元測試是自己 `new` 出來的（繞過容器），`nest build` 只做編譯與 emit，兩者都碰不到 module graph。第二種還有個額外規則：`exports` 只能列「本模組自己 provide 的 token」或「自己 import 的 module」——要把 import 來的 token 傳下去必須 re-export **模組**而不是 token。

**How to apply**：**動到 module 接線或替既有 provider 加注入相依，一定要跑 e2e**，`pnpm build` 不算數——它只證明編譯得出來，不證明 DI 組得起來。加相依前先確認提供該 token 的模組是不是 `@Global()`；不是的話，找出所有 provide 該 class 的模組逐一補 `imports`。搬移 provider 時先問「還有誰需要從這裡拿？」——答案常常是沒有，`exports` 直接清空比 re-export 模組更乾淨。

## Domain Exception / 錯誤處理

- **型別能保證的完整性，不要退回用測試檢查**：錯誤碼與訊息表用 `as const satisfies Record<ResponseCode, …>` 約束，新增 code 忘了補訊息當場 `TS1360`，回饋即時出現在編輯器。用 `satisfies` 而非型別註記（後者會把動態訊息的參數型別抹成 `never[]`）；「靜態／動態」的分類也從表推導，不要手工維護第二份清單。架構測試只做型別擋不住的部分。

- **建構子重載可以把「哪些情況必須傳參數」寫進型別**：`DomainException` 兩個重載讓靜態訊息只傳 `(code, kind)`，需要參數的訊息漏傳直接 `TS2345`，不會出現「函式被當成訊息字串」的執行期怪象。實作簽名的 fallback 分支雖不可達也別留空字串（取 code 本身較安全）；重載寫完務必用探針驗證「該擋的擋、該過的過」。

- **value object 要分 `of()` 與 `trusted()` 兩條路徑**：`of()` 驗證新輸入並拋 `INVALID`（400）；`trusted()` 不驗證，供 `reconstitute()` 從 DB 還原使用。還原路徑若重跑驗證，**資料損毀會被回報成 400**（客戶端輸入錯誤），但客戶端根本沒做錯——那是 500 的情境。改這類設計時注意既有測試可能正在保護舊行為。

## 測試

### 2026-07 — 物件組態的 Prisma 跑真 DB e2e：runtime 與 migrate CLI 吃的組態不是同一套

**踩到什麼**：runtime 用 `PrismaMariaDb({ host, user, password, database })` 物件組態（無 `DATABASE_URL`），但 e2e 的 `global-setup` 要跑 `prisma migrate deploy` 建測試庫的表——**CLI 只吃 `DATABASE_URL`**。

**Why**：Prisma 7 的 driver adapter 與 CLI 是兩條路徑，adapter 走程式碼傳入的物件、CLI 走環境變數，互不相通。

**How to apply**：(1) `helpers/e2e-env.ts` 從真 `.env` 載帳密；(2) **守門**：斷言 `DB_TEST_DATABASE` 名稱含 `test`，不含就 throw（防打到正式庫），通過才覆寫 `DB_DATABASE`；(3) `global-setup.ts` 建庫後 `execSync('pnpm exec prisma migrate deploy', { env: { …, DATABASE_URL: '…' } })` 現組 URL 給 CLI。用 **`pnpm exec` 而非 `npx`**（monorepo 下 npx 抓不到 workspace bin）。帳密只在 runtime 從 `.env` 讀，絕不寫進任何檔案。

### 2026-07 — e2e 過不了 `@Roles(SUPERADMIN)`：JWT payload 裡根本沒有 roleCode

**踩到什麼**：`SecurityController` 掛 `@Roles('SUPERADMIN')`，e2e 用 admin 帳號登入卻一直 403。

**Why**：`JwtPayload` 刻意輕量只存 `sub`，`request.member.roleCode` 是 `JwtAuthGuard` **每個 request 從 DB 撈的**。seed 的 role 沒設 `roleCode`，guard 撈到的自然不是 `SUPERADMIN`。

**How to apply**：`seedMember` / `seedRole` 開 `roleCode?` 參數。注意 **roleName（顯示名「管理者」）與 roleCode（權限碼）是兩回事**，gate 比對的是後者。

### 2026-08-16 — 測排序時，fixture 的插入順序必須與期望排序相反

**踩到什麼**：6 處 `orderBy`（member / role / permission / ip 名單）**全部拿掉，138 支 e2e 依然全綠**——排序行為完全沒有測試保護。`security.e2e-spec.ts` 雖有 `list[0].ipAddress` 這種依賴順序的斷言，但 seed 資料太少，刪掉 `orderBy` 也照樣過。

**Why**：少了 `ORDER BY` 時資料庫回傳順序是**未定義**的（實務上是插入順序、索引順序或主鍵順序）。若 fixture 的插入順序剛好等於期望順序，測試就分辨不出「真的照 orderBy 排」還是「碰巧照插入順序回傳」。

**How to apply**：讓插入順序與期望排序**相反**——測 `desc` 就按舊→新插入、測 `asc` 就按新→舊插入。另外**筆數決定反向驗證的可靠度**：主鍵是 uuid 時回傳順序近乎隨機，n 筆有 `1/n!` 機率碰巧命中，3 筆是 1/6（實測真的碰到過一次假綠，重跑 3 次才紅），4 筆降到 1/24。範本見 `test/ordering.e2e-spec.ts`。

### 2026-08-14 — 靜態掃描型的架構測試有兩種「假綠」

**踩到什麼**：(1) 規則寫好跑起來全綠，實際上因為 controller 命名是 `XxxController.ts` 而非 `xxx.controller.ts`，glob 掃到 **0 個檔案**；(2) 違規修掉後豁免清單忘了刪，白名單單向膨脹成無人維護的例外清冊。

**Why**：「沒有違規」與「沒有掃到東西」在斷言上長得一模一樣。

**How to apply**：每條規則加 `expect(files.length).toBeGreaterThan(0)`，並驗證每筆豁免在原始碼中**確實仍存在**。新增規則後一律「插違規探針 → 親眼看它紅 → 移除 → 確認 `git diff` 乾淨」。

**已知盲區**：靜態掃描看不到**套件動態註冊的路由**（如 `/api/metrics` 由條件註冊的 `PrometheusModule` 提供、沒有 controller 檔）。所以「架構測試會抓出所有未寫文件的路由」這個預期並不成立。

- **掃字元的規則會掃到自己**：禁用某組字元的守則，其定義檔必然寫著那些字元，掃自己一定紅。把規則檔自身排除並在註解寫明理由（不是豁免，是自我指涉）。同理，review 報告會逐字引用問題碼，`pr/` 之類的目錄也該排除。
- **掃描原始碼的規則要先剝註解**：以「引號 + 中文字元」偵測硬編文案時，TSDoc 裡的 markdown 反引號（`` `code` `` 後接中文）會被當成字串字面值，一次誤判 4 處。**OpenAPI yaml 更是完全不能用 regex 解析**——多行 `description: |` 區塊裡的文字會被當成 path / method 節點，曾得出「35 條路由全部不同步」的荒謬結果（**極端結果本身就是 bug 的訊號**）。yaml 一律用 `js-yaml`。
- **架構測試與 lint 的分工判準是「eslint 表達得了嗎」**：單檔即可判定的 import 邊界交給 eslint（快、IDE 即時）；跨檔語意（錯誤碼註冊、死碼、env 宣告）交給架構測試。**型別能保證的完整性兩者都不用寫**（如「用到不存在的常數」TypeScript 已免費擋掉）。
- **寫 spec 前先 Read 受測檔的真實簽章，不要憑模式猜**：常見誤判——`execute({ id })` 其實是 `execute(id)`、repo 回 `{ list, meta }` 其實是 `{ data, total }`（轉換在 service）、建構子參數順序。動筆前先讀「受測 class + 它呼叫的 port interface + in-port Command 型別」三者。同理，Guard 邏輯或 Port 介面變更後，既有 spec 的 mock payload / mock 物件要同步更新，否則錯誤訊息會誤導排查方向。
- **`jest.clearAllMocks()` 不清 mock implementation**：`mockImplementation(() => { throw … })` 設的錯誤會洩漏到後續測試。一次性行為用 `mockImplementationOnce` / `mockResolvedValueOnce`，或改用 `mockReset()`。因此 spec 的 `beforeEach` 常有一份「逐一重設各 mock 預設回傳」的清單——**新增 mock 方法時務必同步加進去**，否則某支測試設的 `mockResolvedValue` 會洩漏到下一支。實例：`getBlacklistReason` 漏加，一支測試設的 `'rotated'` 讓後面的「帳號停用 → 403」變成 401，錯誤訊息完全指不到原因。
- **`mockResolvedValueOnce` 佇列沒被消費完也會洩漏**：`clearAllMocks()` 不清 once 佇列。改了 SUT 的查詢方法（`findUnique` → `findFirst`）後，原本餵的 once 值變孤兒，會被「下一個剛好呼叫該方法的測試」吃掉，症狀是莫名 500 或狀態碼錯亂。改查詢方法時全文搜尋相關的 `*Once` 確認都會被消費。
- **mock 斷言的 spec 轉真 DB 後會變短也變真**：`toHaveBeenCalledWith(...)` → 先 seed、呼叫 API、再查庫驗證**落庫值**；「更新不存在 → P2025 → 404」不必手動 `setPrototypeOf` 偽造錯誤，真庫直接 PATCH 一個不存在的 UUID 即可。每個 spec `beforeEach` 先 `resetDb`（依 FK 序）再 seed，序列執行避免 race。
- **Zod v4 的 `z.string().uuid()` 嚴格檢查 RFC 4122**：測試 fixture 用 `00000000-0000-0000-0000-000000000001` 這種會被拒（version nibble 不合法），要用 `…-4000-8000-…` 這類合法值。
- **往 port 加方法時，e2e 的假實作要一起補**：新增 `TokenBlacklistPort.getBlacklistReason` 後，單元測試（自帶 mock）與 `typecheck`（介面有宣告）全綠，但 `createMockRedis` 少了那個方法，e2e 一跑就 500。**只有 e2e 跑真的 DI 容器，這類「介面對了但假實作沒跟上」只有它抓得到**——改動 port 之後別跳過 e2e。
- **e2e 跑完 Jest worker 卡住 → `forceExit: true`**：Nest app 關閉後仍有 handle 未釋放（Redis mock、Prisma 連線池）。
- **Redis 仍 mock 時，限流與黑名單在真 DB e2e 中不會誤觸**：`throttleIncrement` 回固定值，序列連跑不會累計到 429；改成真 Redis 時要重新評估。

### 2026-09-02 — 驗競態的測試如果是循序呼叫的，它驗不到競態

**踩到什麼**（衍生專案案例）：修一個 TOCTOU（改成「寫入後回讀 + 決定性排名」），寫了三支測試，反向驗證時**三種破壞方式全部仍然綠**。三次都是**測試的問題不是程式的問題**，而三個各自不同的原因根因同一個——測試建構出來的狀態不是那條規則要處理的狀態：

- 「只比較總數」驗不到：測試寫成 `await f(A); await f(B);` 是**循序**的，而 TOCTOU 是交錯的（兩條都先寫入、才各自回讀）。循序時正確與錯誤的判定式給出同樣的答案。
- 「拿掉排序次鍵」驗不到：mock 依插入順序回傳，而 **JS 的 `sort` 是穩定的**，於是次鍵永遠不會被用到。真實情況是 Redis hash 的欄位順序不保證。
- 「拿掉回滾」驗不到：那支測試的狀態已達上限，被**快路徑**（寫入前的預先檢查）攔下，需要回滾的那段根本沒跑。

**How to apply**：**要驗的規則若只在某個中間狀態下才生效，就直接建構那個狀態**，不要指望走完整流程會經過它——走完整流程時它多半被更早的檢查攔掉了，或被語言的實作細節（穩定排序）遮蔽。解法是把判定抽成可直接呼叫的函式、餵進交錯後的輸入。另外還有一次是**測試設錯而非程式錯**——反向驗證變紅時，先確認紅的原因是不是自己預期的那個。

### 2026-08 — 無狀態的 Redis mock 會讓「快取過時了嗎」的測試變成空的

**踩到什麼**（衍生專案案例）：要驗「改完角色權限，既有 token 的下一個請求就被擋」，照既有 e2e 的寫法用 `createMockRedis()`——測試綠了，但**把修正整段拿掉它照樣綠**。

**Why**：`createMockRedis()` 的 `get` 永遠 `mockResolvedValue(null)`，MemberContext 快取因此**永遠不命中**，每個請求都重新查 DB。「快取有沒有被清掉」在這個 mock 之下沒有可觀察的差別——測的其實只有「DB 寫進去了嗎」，而那本來就會過。

**How to apply**：驗快取失效行為時必須讓寫進去的值讀得回來——另開一個 Map-backed 的 stateful mock，**不要改 `createMockRedis()`**，其他 spec 依賴它「每次都重查 DB」的無狀態行為。判準通用：**mock 掉的東西如果正是被測行為的載體，測試就是空的**——寫完先把修正拿掉跑一次，紅了才算數。

### 2026-09-06 — 規則與樣本一起長大時，沒有任何樣本能證偽那條規則

**踩到什麼**：「EDIT 權限必須搭配同模組的 VIEW」被實作成無條件的字串推導（`X:Y:EDIT` → 要求 `X:Y:VIEW`）。後來加入 `BACKEND:ATTACHMENT:EDIT`——附件刻意只有 EDIT，上傳與刪除都是寫入操作，沒有「只能看」的場景。結果：**該權限對任何角色都不可能被指派**，連「全選」都會失敗。它在目錄裡、畫得出來、就是存不進去。通過了當時全部的單元測試與 e2e。

**Why**：規則寫下來的當下，所有模組都同時有 VIEW 與 EDIT，字串推導與查目錄的結果完全一致。而**測試樣本也全部取自那批模組**——規則與樣本是同一批人同時長出來的，於是沒有任何樣本能證偽它。新模組打破前提時，沒有東西會發現，因為既有測試驗的仍是舊樣本。

同一條規則在前端還有第二份實作，缺陷更嚴重：它**主動合成**目錄裡不存在的碼送給後端。**兩個各自獨立的擋路者，症狀幾乎一樣**（角色存不起來），只修一邊會以為沒修好。

**How to apply**：寫「凡 A 必須有 B」這類規則時，先問一句「**B 一定存在嗎**」。答案是「目前都存在」就代表這是個會過期的前提——改成查資料來源判斷，而不是從字串推導。判斷依據要來自那份資料本身（本例是權限目錄），這樣新增模組時規則自動跟上，不需要任何人記得。

測試上要補一條**「全集」測試**：把資料來源裡的所有項目一次送進去，斷言它是合法的。「只要目錄本身合法，全選就必須合法」這條會在下一個打破前提的項目加入時自動變紅——那是唯一不依賴「有人想到要測新情況」的防線。

### 2026-09-06 — 單元測試的 mock 照真實目錄過濾，e2e 的真 DB 只有被 seed 的那幾筆

**踩到什麼**：同一個修正，單元測試全綠但 e2e 紅——而且 e2e 回的是 `400` 卻**不是預期的那個錯誤碼**。單元測試的 repo mock 依真實的權限目錄過濾查詢結果，所以附件的碼「存在」；e2e 的測試庫只有 `beforeEach` seed 進去的那幾筆，附件的碼根本不存在，於是擋下它的是「碼不存在」而不是要驗的蘊含規則。

**Why**：兩層的「資料來源」不同——單元測試的來源是程式碼裡的常數，e2e 的來源是資料庫。**驗同一條規則時，兩層對「這個東西存不存在」的答案可以相反**，而錯誤碼相同（都是 400）會讓人誤以為是同一個問題。

**How to apply**：e2e 驗「某個碼 / 某筆資料的行為」之前，先確認**測試庫裡真的有它**（本例是先呼叫 `ensurePermissions`）。斷言不要只看狀態碼——**連錯誤碼一起斷言**，否則「被別的原因擋下」與「被要驗的規則擋下」在測試裡長得一模一樣。

### 2026-09-05 — `.env` 裡「留空」不是 undefined，`.optional()` 會拒絕它

**踩到什麼**：新增 `SWAGGER_ENABLED: z.enum(['true','false']).optional()`，並在範例檔寫 `SWAGGER_ENABLED=`（留空 = 依 `NODE_ENV` 推導）。單元測試全綠、e2e 全綠、應用在開發機也跑得起來——但**任何照抄範例檔的部署都會啟動失敗**：`Invalid option: expected one of "true"|"false"`。

**Why**：dotenv 把 `KEY=` 解析成 `''`（空字串），不是 `undefined`。`.optional()` 只放行「這個 key 不存在」，而空字串是「存在且不合法」。開發機沒事是因為本機 `.env` 根本沒有那一行——**問題只在「照著範例檔設定」的路徑上出現，而那正是所有新部署走的路**。

**How to apply**：任何在範例檔中會留空的變數，schema 都要明確接受空字串並轉成 `undefined`：

```ts
z.enum(['true', 'false']).or(z.literal('')).optional().transform((v) => (v === '' ? undefined : v))
```

本專案的 `SESSION_SECRET` 早就是這樣寫的——**新增變數時先看有沒有同型的既有寫法**。更根本的是：**驗證方式不能只有「跑得起來」**，要真的把範例檔餵進 `envSchema` 跑一次。這次是手動比對 `envSchema` 與範例檔的變數清單時順手做了那一步才發現的，而那個比對本身也抓到四個長期缺漏的變數（`LOG_PURGE_*`、`THROTTLE_FAIL_OPEN`）。

### 2026-09-05 — 同一支方法有兩個呼叫點時，斷言分不出是哪一個在餵它

**踩到什麼**：為「鎖定到期要清失敗計數」寫測試，情境設成**密碼正確**：到期 → 放行 → 斷言 `resetFailedLogin` 被呼叫。反向驗證時把 `EXPIRED` 分支的清除整段拿掉，**測試照樣綠**。

**Why**：`LoginService` 有**兩處**呼叫 `resetFailedLogin`——`EXPIRED` 分支一處，登入成功路徑一處。密碼正確的情境會走到成功路徑，於是斷言被那一處餵飽了，與要驗的分支完全無關。`toHaveBeenCalledWith` 只問「有沒有被呼叫過」，不問「是誰呼叫的」。

**How to apply**：斷言某支方法被呼叫之前，先數**它在被測程式碼裡有幾個呼叫點**。超過一個就要挑一條「只有目標那個呼叫點會執行到」的路徑——本例是改用**密碼錯誤**的情境，那條路走不到成功時的清除。挑不出這種路徑時，改斷言呼叫次數或用 `mock.invocationCallOrder` 定位，不要假裝單一斷言足夠。這是「問這個斷言在功能被拿掉之後還會綠嗎」的一個變形，而它特別隱蔽——因為程式碼與測試單獨看都完全正確。

### 2026-09-05 — 斷言「某個東西不存在」的測試，必須有一條斷言它存在的作對照

**踩到什麼**：驗 CSP 豁免範圍寫了三條——一般路徑有 CSP、`docs-json` 有、`/docs` **沒有**。反向驗證時把 `createE2EApp` 裡整段安全標頭拿掉，前兩條紅了，**第三條仍然綠**。

**Why**：「`/docs` 沒有 CSP」在兩種狀態下都成立——**正確地豁免**，以及**整組安全標頭根本沒掛**。單獨看它永遠是綠的，包含在功能完全失效的時候。

**How to apply**：任何 `toBeUndefined()` / `not.toHaveBeenCalled()` / `toHaveLength(0)` 形態的斷言，都要問「這條在功能整個消失時會不會照樣綠」。會的話它就必須與一條正面斷言成對出現，而且**反向驗證要同時檢查兩條的反應**——只看整組有沒有紅，正好會漏掉這種永遠綠的。

### 2026-09-05 — `@Module` 裝飾器在 import 時求值，spec 檔案本體設的 env 一律太晚

**踩到什麼**：e2e 要開啟預設關閉的帳號鎖定，在 spec 檔案頂端寫 `process.env.APPLICATION_ACCOUNT_LOCK_ENABLED = 'true'`。跑起來鎖定完全沒生效，登入回 200——而錯誤訊息只會告訴你「預期 423 收到 200」，指不到 env。

**Why**：**import 會被提升到所有可執行語句之前**，而 `AppModule` 的 `@Module` 裝飾器在被 import 的當下就求值並呼叫 `getEnv()`，`getEnv()` 又有快取。等到那三行賦值執行時，env 早就以舊值定型了。

**How to apply**：要在單一 spec 覆寫 env，把賦值放進一支獨立模組並讓它成為**第一個 import**（CommonJS 的 require 依原始碼順序執行）。不要放進共用的 `setup-env.*.ts`——那會讓所有 spec 都吃到，而像帳號鎖定這種「累積數次失敗就觸發」的開關，會讓其他 spec 以 423 的形式間歇性失敗。同一個檔案裡也順手把閾值之類的常數 export 出去，spec 就不必重寫字面值。

### 2026-08 — 用「極大值」mock 限流計數器，驗不到額度是多少

**踩到什麼**（衍生專案案例）：既有 e2e 驗節流的寫法是 `throttleIncrement.mockResolvedValue(1_000_000)`。那能驗「有沒有套節流」，但**把額度改成 200（大於全域的 100）照樣會被擋**——測試不會紅，而「端點額度必須明顯小於全域」這個真正的要求沒有被守住。

**Why**：計數大到任何額度都擋得住時，斷言就與額度無關了。

**How to apply**：取一個**介於端點額度與全域額度之間**的計數，「額度小於全域」才變成可驗證的。再加一條**對照組**——同樣的計數打一支只受全域保護的端點，它必須**不**被擋；沒有對照組的話，你分不出擋下來的是哪一層。另外**mock 一個被多處共用的底層操作時要依 key 分流**，不要一律回同一個值——否則斷言寫的是 A 限流、實際擋下來的是共用同一支計數器的 B 限流。通用判準：**問「這個斷言在功能被拿掉之後還會綠嗎」**，而唯一可靠的回答方式是真的把它拿掉跑一次。

### 2026-08 — `createE2EApp` 不套 `main.ts` 的原生中介層，header 斷言會是空的

**踩到什麼**（衍生專案案例）：要驗安全標頭，照既有 e2e 的寫法直接斷言回應 header——但 `createE2EApp` 只做 `setGlobalPrefix('api')` + `init()`，**`main.ts` 裡 `app.use(helmet(...))` 那一整段根本沒跑**。測試會全紅（或改成斷言「不存在」時全綠），兩種都不是在驗真的東西。

**Why**：`bootstrap()` 與 `createE2EApp()` 是兩條各自組裝 app 的路徑。`app.use()` 掛的原生 middleware 只存在於前者；Nest 層的 guard / filter / interceptor 則因為在 `AppModule` 裡而兩邊都有——**差異只在原生中介層**，而那正是安全標頭所在的地方。

**How to apply**：要驗原生中介層的行為，先把它抽成一支共用函式，`main.ts` 與 `createE2EApp` 都呼叫它。**不要在測試裡自己再掛一次 helmet**——那驗的是測試自己掛的那份，不是產品程式碼。同一個判準適用於 CORS、cookie-parser、static 的 `setHeaders`。

### 2026-08 — characterization test 要寫成「機制無關」才擋得住重構

**踩到什麼**（衍生專案案例）：要把逐條呼叫改成批次呼叫，第一版安全網直接斷言批次那支被呼叫——那不是 characterization test，是對著還沒寫的實作寫的測試，改壞了照樣綠。

**Why**：characterization test 的用途是「重構前後行為不變」。斷言綁在**機制**（呼叫哪一支）上時，機制一換測試就得改，而改測試的同時就失去了它要提供的保護。

**How to apply**：斷言寫在**行為**上（「哪些東西被處理了」而非「哪支方法被呼叫」），用一個 helper 同時從新舊兩支 mock 收集結果。這樣同一組測試在改動前後都成立，反向驗證把實作改回舊寫法時它們照樣綠，證明守住的是行為而不是寫法。

- **測 `setInterval` 一律用 `await jest.advanceTimersByTimeAsync(ms)` 一支就好**：`jest.advanceTimersByTime(ms)` 後面再接 `await jest.runOnlyPendingTimersAsync()` 會讓每次觸發跑兩輪——前者先燒掉一次計時器而 interval **會立刻重新排程**，後者看到那個剛排好的又燒一次。疊在 `setTimeout` 上則不會翻倍，所以很容易誤判成程式的問題。

## 建置 / 工具鏈

- **`tsBuildInfoFile` 必須放在 dist 內**：`nest-cli.json` 的 `deleteOutDir: true` 每次 build 刪整個 dist，但 `.tsbuildinfo` 預設在 root 不會被清 → TS 以為「沒變動 = 不用 emit」→ build 完 dist 是空的、啟動失敗。設 `"tsBuildInfoFile": "./dist/.tsbuildinfo"`；遇到「改了 code 卻沒重編」先刪它。
- **`preserveWatchOutput: true`**：否則 `tsc --watch`（含 `nest start --watch`）用 alternate screen buffer，每次重建會吃掉終端 scrollback，先前的 Vite ready URL 等輸出全消失。
- **Husky hook 在 nvm 環境找不到 pnpm**：nvm 的 node/pnpm 只在互動 shell 載入後才進 PATH，git 的子 shell 不一定繼承。`.husky/pre-commit` 與 `.husky/pre-push` 開頭都要加 `command -v pnpm || . "$HOME/.nvm/nvm.sh"`。

### 2026-09-03 — husky 壞掉時不會報錯，commit 照常成功、只是什麼都沒檢查

**踩到什麼**：以為 commit 前有 lint 把關，實際上 `.husky/pre-commit`（跑 `lint-staged`）**根本沒有被觸發**。檔案在、`package.json` 的 `prepare: husky` 在、`lint-staged` 設定也在——斷的是 `.git/config` 裡的 `core.hooksPath`，它不見了。

**Why**：husky v9 的運作方式是把 git 的 hook 目錄指向 `.husky/_`（由 `prepare` 在 `pnpm install` 時設定），而 `.husky/_/` 整個不進版控。那一行消失之後 git 只看 `.git/hooks/`，那裡沒有 `pre-commit`——**git 找不到 hook 不是錯誤，是正常情況**，所以 commit 一路成功。最可能的成因是某次 `pnpm install --ignore-scripts`，或在 `CI=true` 的環境下裝過（husky 會自動跳過註冊）。

**How to apply**：要確認 hook 活著，看的是 `git config --get core.hooksPath` **有沒有值**，不是看 `.husky/` 有沒有檔案。修法就是 `pnpm install`（`prepare` 會重設）。另外**本機 `.git/hooks/` 裡的 hook 不進版控**，換機器或重 clone 就沒了——要跨機器就得放進 `.husky/`。**同一個 hook 名稱不要兩邊都放**：`core.hooksPath` 一設，`.git/hooks/` 整個被忽略，留著的那份會在 hooksPath 又斷掉時悄悄復活，而兩份內容早就漂移了。

這一點**沒有守則擋著，也擋不了**——失效狀態在本機的 `.git/config` 裡，版控看不到。曾考慮把 `hook-scripts.spec.ts` 的 `bash -n` 擴到 `.husky/*`，否決了：那守的是語法，而實際的失效模式是根本沒被觸發，加了只會製造「有被守著」的錯覺。
- **api 的 `lint` 必須先 `db:generate`**：client 未生成時 Prisma 回傳被推成 `any`，`recommendedTypeChecked` 會噴大量假陽性（`no-unsafe-call`、`require-await`）。加 `"prelint": "pnpm db:generate"`。注意 lint-staged 直接呼叫 `eslint --fix` 不走 pre 腳本。
- **Monorepo 共用 ESLint 基底不能含 tseslint 預設集**：api 走 `recommendedTypeChecked`、web 走 `recommended`，兩者都會註冊 `@typescript-eslint` 外掛；基底再帶一組會觸發 `ConfigError: Cannot redefine plugin`。基底只放 `ignores` + `js.configs.recommended` + 家規（家規以 named export 交由各 workspace **在自己的 tseslint 預設之後**最後套用，否則 `no-explicit-any` 會被蓋回 error）。
- **type-aware lint 對 ORM 邊界 / jest mock / seed 腳本要分區關掉 `no-unsafe-*`**：這些地方天生 `any`，全開會爆數百個假訊號淹沒真發現（本專案 524 → 9）。核心層（application / domain / infrastructure）維持全嚴格，floating-promise 這類真問題才浮得出來。
- **`.prettierignore` 相對「執行目錄」解析，不是逐檔就近**（與 `.prettierrc` 不同）：所以 `format` / `format:check` 必須放**根**並從 repo root 跑才吃得到。根 ignore 必排除手寫繁中文件（`**/*.md`，否則 openspec / README 被 reflow）、工具生成檔（`schema.ts`、swagger bundle）、`prisma/migrations`。

### 2026-08-14 — eslint flat config 中同名規則是「後蓋前」，不會合併 patterns

**踩到什麼**：`no-restricted-imports` 拆成多個區塊各給一組 `patterns`，結果 admin 目錄下的 controller 該同時受「不得碰持久層」與「不得相依 front」兩條約束，**實測只有後者生效**，前者靜默失效而 lint 全綠。

**Why**：同時匹配多個區塊的檔案，該規則只吃**最後一個**區塊的設定，先前的整包被覆蓋。

**How to apply**：重疊的檔案範圍必須各自列齊**完整**限制——用 `ignores` 切成互不重疊，重疊者（如 `src/adapter/in/**/admin/**/*Controller.ts`）一次列出所有 pattern。另外用 `@typescript-eslint/no-restricted-imports` 而非 base 版，才涵蓋 `import type`。每加一條邊界規則都要用探針實測「該擋的每一種都真的擋」。

## 容器 / Docker

### 2026-09 — `docker compose down -v` 的 `-v` 是「專案的所有 volume」

**踩到什麼**（衍生專案案例）：容器化 e2e 的收尾寫成 `docker compose --profile e2e down -v`，跑完一次之後開發環境整個消失——五個 `node_modules` volume、資料庫 volume、redis volume 全沒。下一次跑 e2e 的症狀是整批 spec `Cannot find module '.prisma/client/default'`，**完全指不到是收尾那一行造成的**。

**Why**：`--profile X` 只影響「哪些服務被視為啟用」，**不限制 `down` 的作用範圍**。`down` 移除專案的所有容器，`-v` 移除 compose 檔裡宣告的**所有 named volume**。

**How to apply**：只想收自己起的服務就用 `rm -fsv <服務名>`（`-f` 不問、`-s` 先停、`-v` 只移除**該容器的匿名 volume**）。`down -v` 保留給「我真的要重置整個專案」——那正是 `pnpm docker:reset` 的定位。

> ⚠️ **本專案的 `scripts/verify-ci.sh` 目前正踩著這個坑**（`docker compose --profile verify down -v`），也就是說**每跑一次 `pnpm verify:ci` 就清掉開發用的 `mysql-data`、`redis-data` 與五個 `node_modules` volume**。修復排在 `platform-container-single-entry`（C4）；在那之前跑 `verify:ci` 要有心理準備，事後得重跑 `pnpm install` 與 `pnpm docker:init`。

### 2026-09 — 容器跑著的時候在 host 跑 `pnpm build`，會把容器打死

**踩到什麼**（衍生專案案例）：容器全部 healthy，但請求全部 502 / connection refused。api 容器狀態顯示 `Up 33 minutes`，看起來完全正常。真正的錯誤埋在日誌裡：`Cannot find module '/app/apps/api/dist/main'`。

**Why**：`apps/api` 有兩份 nest 設定——`nest-cli.json`（`deleteOutDir: true`）與容器專用的 `nest-cli.docker.json`（`false`）。容器的 watch 用後者，所以 rebuild 不會清空 `dist/`。但**在 host 跑 `pnpm build` 用的是前者**，它會先刪掉整個 `dist/`，而那個目錄是 bind mount——容器裡的 watch 行程在那個空窗期重啟、`MODULE_NOT_FOUND`、然後**放棄不再重試**（"Waiting for file changes before restarting..."）。

**How to apply**：**容器跑著的時候不要在 host 跑 `pnpm build`。** 需要驗證 build 就先 `pnpm docker:down`，或跑完之後 `docker compose restart api` 讓它重新產生 `dist/`。判準通用：**bind mount 的產出目錄有兩個寫入者時，兩邊的清空行為必須一致**——不一致的那一邊會在對方最不預期的時候把它的檔案抽走。

### 2026-09-02 — 「埠關掉了沒」不能用 curl 判斷，要看 `docker compose ps` 的 PORTS 欄

**踩到什麼**（衍生專案案例）：確認 api 的對外埠已移除，`curl http://127.0.0.1:3000/api/health` 預期得到 connection refused，實際回 **404**。差點下結論說「埠沒關成功」。真相是 host 上另一個專案綁在 `*:3000`，回的是它的 404。

**Why**：curl 測的是「這個位址有沒有人應答」，不是「這個容器有沒有發布這個埠」。兩者在單一專案的機器上恰好等價，在同時開好幾個專案的機器上就不等價了——而後者才是常態。macOS 的 IPv6 優先解析讓這件事更容易發生：另一個服務綁 `*:3000`（IPv6 wildcard）與容器綁 `127.0.0.1:3000` 可以並存。

**How to apply**：驗「有沒有對外發布」看 `docker compose ps` 的 PORTS 欄（權威來源，空的就是沒發布）。curl 只能當輔助，而且**得到非預期回應時先查誰在聽**（`lsof -nP -iTCP:<埠> -sTCP:LISTEN` 再 `ps -o command= -p <pid>`），不要直接推論成自己的改動失敗。同理，得到 connection refused 也不保證是自己關的——可能那個服務根本沒起來。

## Monorepo / pnpm

### 2026-08-14 — pnpm 10+ 的 `overrides` 寫在 `package.json` 會被靜默忽略

**踩到什麼**：三條 override 長期完全沒生效——宣告 `@hono/node-server >=1.19.13` 實際裝 1.19.11、宣告 `@tootallnate/once 3.0.1` 實際裝 2.0.1。**沒有任何警告**。

**Why**：雙重錯誤——pnpm 的 overrides 只在 workspace **root** 生效，且 10+ 起又從 `package.json` 搬到 `pnpm-workspace.yaml`（`allowBuilds` 等設定同批搬遷）。

**How to apply**：(1) overrides 一律寫 `pnpm-workspace.yaml`；(2) 改完檢查 `pnpm-lock.yaml` 開頭是否出現 `overrides:` 區塊——**這是 pnpm 有讀到的唯一證據**；(3) 再以 `pnpm why <pkg>` 確認實際版本。range 用 `^` 不要用 `>=`：後者沒有上界，pnpm 會直接拉到最新 major（實測 `@hono/node-server` 跳到 2.1.0）。

- **pnpm 11 預設不執行套件的 build scripts**：Prisma、bcrypt、@nestjs/core 等有 postinstall 的套件會被擋下並警告 `ERR_PNPM_IGNORED_BUILDS`，需在 `pnpm-workspace.yaml` 的 `allowBuilds` 明確核准（`true` 信任 / `false` 明確拒絕，如 telemetry-only 的 `@scarf/scarf`）。
- **Monorepo 下 Prisma client 落在 pnpm 虛擬 store**：生成在 `node_modules/.pnpm/@prisma+client@…/` 而非傳統路徑。搬完 monorepo **必須先跑一次 `db:generate` 再 typecheck**，否則所有 model 型別找不到，會誤導成 strict mode 的問題。

## 外部服務 / 排程

- **所有外部服務呼叫都要設 timeout**：沒 timeout 時單一服務變慢會耗盡連線池 / event loop、拖垮整個 API。recaptcha 用 `AbortSignal.timeout(5000)`；nodemailer 設 `connectionTimeout` / `greetingTimeout` / `socketTimeout`；S3 用 `client.send(cmd, { abortSignal })`；firebase-admin 不支援 AbortSignal，用 `Promise.race`。
- **Redis 要設 `socket.connectTimeout` + `pingInterval`**：`isOpen` 只看連線旗標，偵測不到 half-open（socket 開著卻無回應），指令會 hang 到自己 timeout。token 黑名單採 **fail-closed**（Redis 斷線拋 503，不放行已登出 token）。

### 2026-07 — `@Cron('expr')` 的表達式在「模組載入時」求值，讀不到 `.env`

**踩到什麼**：cron 表達式想從 env 讀，拿到 `undefined`；在 decorator 內呼叫 `getEnv()` 更直接 `process.exit(1)`。

**Why**：import 會 hoist 到檔案最上方，`AppModule`（含排程器）在 `main.ts` 的 `dotenv.config()` **之前**就被 require，decorator 的參數那時已經求值。

**How to apply**：改在 `onModuleInit()`（dotenv 已載入）用 `SchedulerRegistry.addCronJob(name, CronJob.from({ cronTime, onTick, timeZone }))` 動態註冊。`CronJob` 來自 `cron` 套件（`@nestjs/schedule` 沒 re-export），版本要與 schedule 內部相依一致。

## 單一埠部署 / ServeStatic

- **`ServeStaticModule` 用 `forRootAsync` + 執行期偵測，不要在 `@Module` 載入時判斷**：`@Module` 的 imports 在 import 時就 evaluate，那時 e2e fixture 還沒建。`forRootAsync({ useFactory })` 在 `app.init()` 才偵測 `index.html`（前端未 build 時回 `[]` 等同不掛載）。
- **`exclude` 要用 Express 5 / path-to-regexp v8 的 named wildcard `'/api/{*path}'`**：舊式 `/api*`、`/api/*` 都不對；`'/api/*path'` 會漏掉裸 `/api`。漏設會讓 API 的 404 回 `index.html`（HTML）而非 JSON。本機媒體 static 同理要加 `/media/{*path}`，否則被 SPA fallback 攔截。
- **e2e 測 serve-static 要把 `AbstractLoader` override 成 `ExpressLoader`**：loader factory 依 `httpAdapter` 是否存在挑 loader，測試用 `compile()` 在 `createNestApplication` 之前就實例化 → 拿到 **NoopLoader**（靜態檔全 404）。

## 檔案上傳

- **multipart 中文檔名要 latin1→UTF-8 還原**：busboy/multer 預設以 latin1 讀 filename，中文變亂碼。存入前 `Buffer.from(name, 'latin1').toString('utf8')`。
- **multer 2.x 的 `Express.Multer.File` 全域型別解不到**：2.x + @types/multer 2.x 不再穩定擴充全域 namespace，會報 `Namespace 'global.Express' has no exported member 'Multer'`。controller 自定最小型別（只取 `buffer/mimetype/size/originalname`）避開。
- **大小上限要在 service 檢查，不要放 decorator**：decorator 選項在模組載入時求值、讀不到 env（同 `@Cron` 那條）。multer decorator 另設大的靜態硬上限防 OOM 即可。

## 前端

- **自訂 hook 回傳的函式若會進 useEffect deps，必須 `useCallback`**：否則每 render 新 instance → effect 每 render 都跑 → 內部 setter 改父 state → 再 render，Chrome 會擋 `Throttling navigation to prevent the browser from hanging`。且 **dep 不能放整個 hook 回傳的 object**（每 render 都是新 reference，等於沒包），要 destructure 出 method 再放。
- **zod v4.1+ 不要用 `zodResolver`，改用 `standardSchemaResolver`**：`@hookform/resolvers/zod` 的 v4 overload 檢查 `_zod.version.minor === 0`，zod 4.1+ 會報 `Type '4' is not assignable to type '0'`。zod v4 原生實作 Standard Schema，換 valibot/arktype 也同一 resolver。
- **react-hook-form 的 schema 不要用 zod `.transform()`**：會讓 input/output 型別分歧，而 `useForm<T>` 把 T 同時套在 defaultValues / control / handleSubmit 三邊。normalize 放 submit handler，schema 只做 validate。
- **`useInfiniteQuery` 不會走 `useApiQuery` 的 envelope unwrap**：自寫 `queryFn` 用 `apiClient.GET` 不經過 unwrap，`lastPage.list` 會是 undefined（實際是 `{ success, data: { list, meta } }`）。從 `@app/api-client` export `unwrapEnvelope` 手動呼叫。
- **shadcn nova preset 的 registry 沒有 `form`**：`shadcn add form` 會 silent fail（只印 "Checking registry"），其他元件正常。自寫 `components/ui/form.tsx`（標準 Controller + Slot + FormItemContext pattern）。
- **TypeScript 6 把 `baseUrl` 標為 deprecated**：tsconfig 只需要 `paths`，其中的相對路徑以 tsconfig 所在位置為基準。shadcn CLI 看的是 `components.json` 的 aliases，不依賴 baseUrl。
- **jsdom 缺的 DOM API 統一補在 `src/test/setup.ts`**：Radix 的 Select / DropdownMenu 依賴 pointer capture 與 `scrollIntoView`，jsdom 都沒有實作，缺了會讓下拉在測試中**永遠打不開**，而錯誤訊息是「找不到 role=option」——指不到真正的原因。

### 2026-09-02 — UI 驗收只看一種資料，等於沒驗到那個元件

**踩到什麼**（衍生專案案例）：權限樹加了「不可指派」區塊，用恆為未勾的 disabled checkbox 呈現。單元測試全綠、守則全綠、也開瀏覽器看過——**但只看了「新增角色」**。合併後使用者第一次打開**超級管理者的唯讀檢視**就發現三項顯示未勾選，而那個角色恰恰做得到那三件事。畫面在陳述假訊息。

**Why**：同一個元件在不同資料下是不同的畫面。「新增角色」的資料是空的，恆為未勾看起來完全正常；「檢視既有角色」才把「這個值是寫死的」暴露出來。只驗一種資料時，驗到的是「元件會渲染」，不是「元件說的話是對的」。

**How to apply**：驗收會依資料改變外觀的元件時，**至少走兩種資料**——空的與滿的、無權限與全權限、新建與既有。挑選的原則是「哪一種資料會讓我寫死的那個值變成錯的」。另外這次的根因不只是驗收不足：**用 checkbox 表達一個不是「勾選狀態」的東西**，本身就保證了某種資料下會說謊。看到「這個 checkbox 永遠 disabled 且永遠不變」時，該問的是它為什麼是 checkbox。

- **功能有 feature flag 時，讀那份資料的畫面要能分辨「沒有」與「不會有」**：「查不到資料」在兩種情況下長得一模一樣——**真的沒有**（好消息），跟**根本不會有**（旗標沒開，壞消息）。畫面不分辨的話，管理員會把後者讀成前者，而那正好是最需要他知道的事。單元測試與 e2e 都不會抓到：它們驗的是「列表正確反映資料」，那是對的；錯的是「資料從哪來」這個前提。作法：讀資料的端點把開關狀態一起回傳，畫面在關閉時明講；**不要為此另建一套 feature flag 的前端基礎設施**，把旗標塞進那支本來就要呼叫的端點就好。

## Zod / 驗證

- **`z.coerce.boolean()` 對字串 `'false'` 會 coerce 成 `true`**：底層走 JS `Boolean()`，非空字串皆 truthy，`?status=false` 會變成 `true`。query 的 boolean filter 一律用 `z.enum(['true','false']).optional().transform(v => v === undefined ? undefined : v === 'true')`。

## 架構慣性

- **`@Roles` / `RolesGuard` 受 feature flag 控制，注意爆炸半徑**：`adminRoleEnabled` 關閉時 RolesGuard 一律放行，所有 `@Roles` 端點（IP 黑白名單、帳號解鎖）對任何已登入者開放。生產由 validate-env 強制開啟守住，但**勿在共用的 dev 環境關閉**。
- **不要讓 Facade 直接呼叫 Out Port、跳過 Service 層**：少了 service，domain 規則（IP 正規化、unlock 前狀態檢查）沒地方放，只能擠進 facade 或 controller。即使動作簡單也保留 service 佔位，未來補 domain rule 零摩擦。
- **同資料但「呼叫情境不同 = 權限模型不同」時，開窄化 endpoint**：Combobox 要顯示不在第一頁的角色名稱，`GET /roles/:id` 看似夠用但需 `BACKEND:ROLE:VIEW`，只有 `BACKEND:ACCOUNT:VIEW` 的會員管理者打不到。開薄的 `GET /members/role/options/:id` 沿用會員管理權限，不要借別模組的 endpoint。

### 2026-07 — 搬整包資料夾深一層 = 兩個正交轉換，可腳本化但 `jest.mock` 會漏

**踩到什麼**：把 flat 結構搬進 `<side>/` 時，typecheck 全綠但 jest 執行期掛掉。

**Why**：兩個轉換是正交的——(1) 把 `<side>/` 段插進「指向 in 側各層」的 import 路徑；(2) 被搬檔案的每個 `../` 各 +1 層。但 **`jest.mock('../…')` 是字串字面量，TS 不當 module 解析**，所以深度 +1 漏掉它時 typecheck 不會報錯。

**How to apply**：兩個轉換先 (1) 後 (2)，且 (2) 必須一併涵蓋 `jest.mock` / `require` 的路徑字串。用 `git mv` 保留歷史（rename 偵測門檻內，內容改太多會顯示成 D+A）。

## OpenSpec workflow

- **propose 階段先核對 API contract，不要假設「list 有的欄位 update 也支援」**：例如 role 的 GET 回應有 `status`，但 `PATCH /roles/:id` 的 DTO 沒處理它，誤判成「純前端 change」會在動工後才發現要連動改後端 + Swagger + api-client + spec + e2e。寫 proposal 前先讀 `{Create,Update}*Request.ts` 與對應 service，把每個前端互動點對應到實際 DTO 欄位。
- **archive 前先把 swagger / api-client / 前端同步完**：這些屬 feat 的尾巴，混進 archive commit 會讓未來 cherry-pick / revert 歸檔時連帶動到 swagger。順序：`swagger:bundle` → `api-client generate` → 驗證鏈 → commit feat → 才 archive。archive 後若 `git status` 還有 swagger / schema.ts 變動，是前面沒做乾淨。

### 2026-08-20 — openspec 的 MODIFIED 靠「標題字串」比對，改標題會讓封存整個中止

**踩到什麼**：delta spec 用 `## MODIFIED Requirements`，把需求標題從「品質檢查必須在 Merge Request 階段執行」改成「…Pull Request…」，內容也一併更新。`openspec validate` **通過**，但 `openspec archive` 失敗：

```
platform-ci-quality-gate MODIFIED failed for header "### Requirement: 品質檢查必須在 Pull Request 階段執行" - not found
Aborted. No files were changed.
```

**Why**：MODIFIED 是拿 delta 的 `### Requirement:` 標題去 master spec 裡找同名那塊來取代。標題一改就找不到目標。而 `validate` 只檢查 delta 自身的格式合不合法，**不會拿去跟 master spec 對照**——所以「validate 綠 + archive 紅」是這個工具的正常行為，不是壞掉。

**How to apply**：需求要改名就用 `## RENAMED Requirements`（`- FROM:` / `- TO:` 各一行，值是完整的 `### Requirement: <名稱>`）。改名**又**改內容時兩段都要寫，MODIFIED 那段用**改名後**的標題。archive 輸出會顯示 `→ 1 renamed` 確認生效。順帶注意改名後的需求會被移到 master spec 的**末尾**，不留在原位置。

**還好的一點**：archive 失敗時是 `Aborted. No files were changed.`——它不會做到一半留下半套的 master spec。
- **archive commit body 要列出新建 / 修改的 master spec**：只有標題的話，未來 `git log` 追不到「某 capability 何時定義 / reqs 何時變動」。reqs 數量用 `grep -c "^### Requirement:" openspec/specs/<spec>/spec.md` 取得。
