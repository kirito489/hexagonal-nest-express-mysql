## Why

從衍生專案回補四條守則，其中兩條**立刻抓出模板現存的缺陷**——這正是回補它們的理由：

**角色權限改了，成員的快取沒清。** `UpdateRoleService` 呼叫 `updateWithPermissions` 之後不做任何事，而 `MemberContext`（含 `permissions`）快取在 Redis，TTL 由 `PERMISSION_CACHE_TTL` 控制（預設 300 秒）。也就是說**撤銷一個權限最多五分鐘後才生效**，而畫面與資料庫都顯示已經撤銷了。`backend-runtime.md` 的「快取一致性」只列了 member 層級的變更（`status` / `roleId` / 密碼），漏掉「角色的權限變了會影響該角色的每一個成員」。

**文件裡寫死的守則數量全部過期。** `CLAUDE.md` 兩處寫「11 rule files / 32 assertions」、`README.md` 寫「19 支規則檔 / 68 項斷言」、`testing.md` 寫「19 支 / 68 項斷言」——實際是 **22 支 / 69 項**。那個數字的用途是讓未來的自己判斷「守則有沒有被誤刪」，一旦落後，真正的減少就會躲在誤差裡看起來正常。**錯誤的基準值比沒有基準值更糟**，而它壞掉的方式是安靜地失去用途。

另外補一條 C2 收尾時親自踩到的缺口：`envSchema` 與 `.env.example` 之間**沒有任何檢查**。C2 新增 `SWAGGER_ENABLED=`（留空）時，因為空字串不是 `undefined`，任何照抄範例檔的部署都會啟動失敗——而單元測試、e2e、本機啟動全部正常。同一次比對還抓出四個長期缺漏的變數。

## What Changes

- 新增 `guardrail-inventory.spec.ts`：守則檔數量不得低於基準、文件不得寫死守則數量、`testing.md` 的規則表必須涵蓋每一支守則
- 修正四處過期的寫死數字，改為不帶數字的描述
- 新增 `env-example-sync.spec.ts`：`envSchema` 宣告的變數與 `apps/api/env.example` 的鍵集合必須完全相等，且範例檔實際餵進 `envSchema` 必須通過
- 新增 `public-surface.spec.ts`：`main.ts` 以 `app.use()` 掛載的路徑會**繞過全域 `JwtAuthGuard`**（框架的 guard 只作用於框架路由），每一個都必須列入豁免清單並註明理由
- 新增 `role-permission-cache.spec.ts`：改動角色授權的 service 必須清除該角色全體成員的 `MemberContext` 快取
- **修復**：`UpdateRoleService` 補上清快取；`MemberContextCachePort` 加 `clearMany`；`LoadMemberPort` 加「依角色查成員 ID」
- `stripComments` 從各守則各自實作改為集中在 `helpers.ts`

不做的事：`session-revocation.spec.ts`（守的是停用帳號時撤銷 WebSocket 連線，模板沒有 WS 層）、`permission-catalog-sync.spec.ts`（同步前後端權限碼常數，模板前端還沒有 `lib/permission-codes.ts`，屬 C6b）、`infra-endpoint` 裝飾器機制（衍生專案用來讓 Prometheus 繞過 IP 存取控制，模板的 Prometheus 在 feature flag 後且預設關閉，現在加是為不存在的問題建設施）。

## Capabilities

### Modified Capabilities

- `platform-engineering-guardrails`：新增四條守則需求（守則清單自我維護、環境變數範例檔一致性、公開掛載面申報、角色授權變更的快取一致性），並補上「守則的規模不得寫死在文件裡」這條後設規則。
- `api-role-management`：「更新角色」需求——授權變更後必須清除受影響成員的 `MemberContext` 快取，否則撤銷的權限在快取效期內仍然有效。

## Impact

- **新增檔案**：`test/architecture/{guardrail-inventory,env-example-sync,public-surface,role-permission-cache}.spec.ts`
- **修改檔案**：`UpdateRoleService.ts`、`MemberContextCachePort.ts`、`LoadMemberPort.ts` 與其 adapter、`RedisMemberContextCacheAdapter.ts`、`role.module.ts`、`test/architecture/helpers.ts`、`allowlist.ts`、`CLAUDE.md`、`README.md`、`openspec/project/testing.md`、`openspec/project/backend-runtime.md`
- **無 migration、無 env 變更、無新增相依套件**
- **行為變更**：更新角色權限後，該角色全體成員的下一個請求即反映新權限（原本最多延遲 `PERMISSION_CACHE_TTL` 秒）。**沒有反向的破壞性**——清快取只會讓資料更新鮮
