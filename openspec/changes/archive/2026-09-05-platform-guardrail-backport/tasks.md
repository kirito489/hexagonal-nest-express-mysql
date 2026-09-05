> 每一塊（`##` 標題）須能獨立通過驗證鏈：`pnpm typecheck && pnpm lint && pnpm test`。
> 塊 3 動到角色更新的服務與 module 接線，需加 `pnpm --filter @app/api test:e2e` 與 `pnpm build`
> （**加新的注入相依時 build 與單元測試都抓不到 DI 沒接線，只有 e2e 抓得到**）。
> 不動 swagger yaml，因此不需要 `swagger:bundle`。
> 全部完成後給**一個** commit 指令，由使用者手動執行。
>
> **塊的依賴**：
> - 塊 0（`stripComments` 集中）先做，塊 3 的守則會用到它。
> - 塊 1、2、4 互相獨立，順序可換。塊 1 與 4 預期立刻紅（它們抓到真的東西），塊 2 預期直接綠。
> - **塊 3 是本 change 唯一動到 production code 的地方**，且它與塊 4 的守則同進同出——
>   守則沒有修復就進不去（會是紅的），修復沒有守則就會再退化。

## 0. `stripComments` 集中到 helpers

- [x] 0.1 把 `authorization-coverage.spec.ts` 內部的 `stripComments` 移到 `test/architecture/helpers.ts` 並匯出
- [x] 0.2 `authorization-coverage.spec.ts` 改為 import；確認該檔既有的 9 條斷言全綠（它有合成輸入的自我測試，行為改變會立刻顯現）

## 1. 守則清單的自我維護

- [x] 1.1 新增 `guardrail-inventory.spec.ts`：`MINIMUM_GUARDRAIL_FILES` 下限、文件不得寫死數量、`testing.md` 規則表須涵蓋每一支守則
- [x] 1.2 掃描範圍含 `openspec/project/**`、`CLAUDE.md`、`README.md`——**不是只掃 openspec 目錄**。README 一開始沒被掃到時，同一種漂移會原封不動留在那裡
- [x] 1.3 規則自帶合成輸入的自我測試（`11 rule files / 32 assertions`、`19 支規則檔 / 68 項斷言` → 應命中；`架構守則（數量見輸出）`、`共 11 支 e2e 測試` → 不應命中）
- [x] 1.4 **此刻它必須是紅的**：四處寫死的數字全部過期。貼出紅燈輸出當作缺陷存在的證據
- [x] 1.5 修正四處，改為不帶數字的描述：`CLAUDE.md` ×2（「11 rule files / 32 assertions」）、`README.md` ×1、`testing.md` ×1（後兩者皆為「19 支 / 68 項斷言」）。
      ⚠️ **提案階段說「實際 22 支」是錯的**——那是 `ls` 目錄的項數，含 `helpers.ts` / `allowlist.ts` / `swagger-helpers.ts` 三支非 spec 檔。
      本 change 之前的真實數字是 **19 支 / 69 項**，所以 `README.md` 與 `testing.md` 只差 1 項斷言、`CLAUDE.md` 才是嚴重過期。
      **數錯的方向剛好會誇大問題**，而那正是這條守則要消滅的東西（憑印象寫數字）。修法不受影響：三處都是拿掉數字
- [x] 1.6 `MINIMUM_GUARDRAIL_FILES` 分兩次設定：塊 1 當下設 20（讓該塊能獨立通過），收尾時本 change 的四支都落地後調到 23。
      **調高是刻意的動作**，符合這條規則自己的設計（只擋變少、新增不必回頭改）
- [x] 1.7 **反向驗證**：(a) 在任一受檢文件塞回「20 個規則檔」→ 對應那條紅；(b) 把 `testing.md` 表格刪掉一列 → 涵蓋率那條紅並指出檔名。逐一還原

## 2. 環境變數範例檔一致性

- [x] 2.1 新增 `env-example-sync.spec.ts`：從 `validate-env.ts` 取出 `envSchema` 宣告的鍵，與 `apps/api/env.example` 的鍵集合比對，要求完全相等
- [x] 2.2 第二條檢查：把範例檔 parse 出來、**必填且無預設值者補測試用假值**，餵進 `envSchema` 驗證必須通過。**這條才是重點**——C2 踩到的缺陷是「鍵在兩邊都有但值的形狀不被接受」，只比對鍵名抓不到
- [x] 2.3 補假值的判定由推導產生（範例檔留空 + schema 無預設值），**不維護手寫的必填清單**
- [x] 2.4 預期直接綠（C2 收尾時已手動修完 95 對 95）。若紅則代表又漂移了，先查清楚再說
- [x] 2.5 **反向驗證**：(a) 從範例檔刪一行 → 鍵集合那條紅；(b) 把 `SWAGGER_ENABLED` 的 schema 改回純 `.optional()` → 第二條紅（重現 C2 的缺陷）。逐一還原

## 3. 角色授權變更的快取清除（唯一動到 production code 的塊）

- [x] 3.1 `ClearMemberContextPort` 加 `clearMany(memberIds: string[]): Promise<void>`；TSDoc 寫明「失敗不得吞掉」的理由
- [x] 3.2 ~~兩個實作該 port 的 adapter~~ —— **實際只有一個**：`ClearMemberContextPort` 只由 `RedisTokenBlacklistAdapter` 實作（`RedisMemberContextCacheAdapter` 實作的是另一支 `MemberContextCachePort`，只有讀寫沒有清除）。撰寫 tasks 時憑檔名推測而沒查 `implements`
- [x] 3.3 `LoadMemberPort` 加「依角色查成員 ID」的方法與其 Prisma 實作（記得 `deletedAt: null`）
- [x] 3.4 `UpdateRoleService` 在 `updateWithPermissions` 之後查出該角色成員並呼叫 `clearMany`；**一律清、不判斷這次改的是不是授權**；清除失敗**不 catch**
- [x] 3.5 ~~`role.module.ts` 補上新的注入相依~~ —— **不用改**：`RedisModule` 是 `@Global()` 且 export 了 `CLEAR_MEMBER_CONTEXT_PORT`，`MemberModule` export 了 `LOAD_MEMBER_PORT` 而 `RoleModule` 本來就 import 它。
      **但仍然跑了 e2e 確認**——這正是「四個指令都抓不到 DI 沒接線」的情境，不能因為讀了 module 就當作驗過
- [x] 3.6 `UpdateRoleService.spec.ts` 補測試：有呼叫 `clearMany` 且帶到該角色全體成員、清除失敗時整個操作失敗（不得靜默成功）
- [x] 3.7 e2e 補一條：改角色權限 → 該角色成員的下一個請求即反映新權限。**這條要用 stateful 的 Redis mock**——預設的 `createMockRedis()` 的 `get` 永遠回 `null`，快取永遠不命中，於是「有沒有清快取」沒有可觀察的差別，測試會是空的

## 4. 公開掛載面申報 + 角色快取守則

- [x] 4.1 `allowlist.ts` 新增 `PUBLIC_MOUNT_EXEMPTIONS`。
      ⚠️ **鍵改成「第一個引數的原始碼文字」而非解析後的路徑**：`main.ts` 的路徑多半是運算出來的（`` `${basePath}/docs` ``、`env.LOCAL_MEDIA_BASE_URL`），靜態解析不出字面值。用原始碼文字當鍵是精確的，且改了那個表達式就會需要重新申報——那正是該重新想一次的時機
- [x] 4.2 新增 `public-surface.spec.ts`：`main.ts` 的每個帶路徑的 `app.use()` 都要在清單內；清單中已不存在於 `main.ts` 的項目要失敗（防豁免清冊自我膨脹）
- [x] 4.3 新增 `role-permission-cache.spec.ts`：呼叫更新授權的 repository 方法者必須同時呼叫快取清除；**只注入不呼叫不算**
- [x] 4.4 兩支都要先去註解再比對（用塊 0 的 `stripComments`），並加「掃描數 > 0」的自我檢查
- [x] 4.5 **反向驗證**：(a) `main.ts` 加一個未申報的 `app.use('/probe', ...)` → 申報那條紅；(b) 把 `UpdateRoleService` 的 `clearMany` 呼叫註解掉（保留注入）→ 快取那條紅，**證明「只注入不呼叫不算」真的成立**。逐一還原

## 5. 文件

- [x] 5.1 `openspec/project/testing.md` 的規則表補上本次新增的四支
- [x] 5.2 `openspec/project/backend-runtime.md` 的「快取一致性」補上「角色的權限 / 名稱 / 狀態變更 → 清該角色全體成員」這一列，並寫明為何一律清而不判斷

## 6. 收尾

- [x] 6.1 完整驗證鏈實際輸出：

      ```
      typecheck   api / web / api-client 皆 Done
      lint        api / web 皆 Done
      test:cov    api  單元 53 suites / 349 tests
                       守則 23 suites / 102 tests（本 change 前 19 / 69）
                       All files 87.36 | 64.65 | 78.85 | 87（門檻 70/60/70/70）
                  web  94 | 96.15 | 87.5 | 92.85（門檻 75/75/60/75）
      test:e2e    12 suites / 165 tests（本 change 前 162）
      build       api nest build 通過；web ✓ built
      ```
- [x] 6.2 更新 `tasks/todo.md`：勾掉 C3，並把「守則應涵蓋 `.env.example`」那條標為已完成
- [x] 6.3 新踩到的坑寫進 `tasks/lessons.md`
