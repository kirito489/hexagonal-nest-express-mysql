# 測試結構與品質門檻

> 單元／e2e／架構守則三層測試的分工、覆蓋率門檻，以及如何新增一條架構守則。

> 本檔為 `openspec/project.md` 的一部分，導覽見該檔。

---

### 測試結構

```
apps/api/src/
├── domain/{model,value-object}/*.spec.ts
├── application/service/*.spec.ts
└── adapter/in/web/{guard,filter,interceptor}/*.spec.ts

apps/api/test/
├── test-app.ts            # createE2EApp()（注入真 PrismaService）、createMockRedis() 工廠
├── setup-env.ts           # e2e 環境變數：DB_DATABASE=*_test、關限流（超大 rate limit）
├── jest.arch.config.js    # 架構守則測試專用設定（rootDir 為 apps/api，不載 setupFiles）
├── architecture/          # 架構守則測試：靜態掃描原始碼，不連 DB / Redis / HTTP
│   ├── helpers.ts         # 收檔、逐行比對、違規報告組裝
│   ├── allowlist.ts       # 豁免清單（PERMANENT / TEMPORARY）
│   └── *.spec.ts          # 各條規則一檔
├── helpers/db.ts          # 測試庫 reset / seed helper（跨 spec 共用）
├── helpers/assertions.ts  # e2e 共用斷言 + describeUnauthorized 產生器
├── global-setup.ts        # 守門（僅 *_test 庫）→ 建庫 + migrate deploy + seed baseline
├── global-teardown.ts     # 收尾（disconnect）
├── auth.e2e-spec.ts
├── member.e2e-spec.ts
├── role.e2e-spec.ts
├── security.e2e-spec.ts
└── serve-static.e2e-spec.ts   # 單一埠：服務前端 dist + SPA fallback + /api 不被攔截（forceServeStatic）
```

E2E 走**真正的 test 資料庫**（非 mock Prisma），只 mock Redis：

- **專用測試庫**：`test/setup-env.ts` 把 `DB_DATABASE` 覆寫成 `*_test`（本專案 Prisma 走 object-config `PrismaMariaDb`、非 `DATABASE_URL`，故以資料庫「名稱」隔離）；`createE2EApp` 用**真 `PrismaService`** 連該庫。
- **globalSetup 守門**：目標 DB 名稱不是 `*_test` 就中止（絕不誤 migrate / 清空 dev / prod 庫）；通過才建庫 + `prisma migrate deploy` + seed baseline。腳本內跑 prisma 一律 `pnpm exec`（不用 `npx`，否則噴 pnpm `Unknown env config` warn）。
- **序列執行**：`test:e2e` 用 `--runInBand`（等同 `maxWorkers:1`）——所有 spec 共用同一測試庫，平行會互相 `deleteMany` race（`AUTH_UNAUTHENTICATED` / `P2025` 間歇失敗）。
- **關限流**：`setup-env.ts` 設超大 rate limit env 關掉全域 `APP_GUARD ThrottlerGuard`——序列連跑會跨 spec 累計觸發 429；且 `.overrideGuard(ThrottlerGuard)` 對「經 `APP_GUARD` 註冊的全域 guard」**無效**（NestJS 已知坑），只能走 env。
- **每 spec 自理狀態**：`beforeEach` 用 `helpers/db.ts` reset（`deleteMany` 相關表）+ seed 該 spec 需要的資料。
- Redis 仍以 `createMockRedis()` 注入（本次只把 persistence 拉成真 DB）。

> 為何走真 DB：provider 建構子副作用（如 `S3FileStorage` 於建構子建 client）、env 空字串、adapter 即時計算的欄位等，**只有接真 DI + 真 DB 的 e2e 抓得到**，mock 版看不到。

#### e2e 共用斷言

`test/helpers/assertions.ts`，新增 endpoint 時優先用現成的，不要再手寫 `expect(res.status).toBe(...)`：

| Helper | 用途 |
| --- | --- |
| `expectApiError(res, status, ResponseCodes.X)` | 業務錯誤：同時斷言 status 與 body 的 `code`。code 型別是 `ResponseCode`，錯誤碼改名時 **typecheck 階段**就紅 |
| `expectUnauthorized(res)` / `expectForbidden(res)` | 401 / 403：由 NestJS `HttpException` 產生，code 是 class name 推導的 `UNAUTHORIZED` / `FORBIDDEN`，**不在 `ResponseCodes` 中**，故與業務錯誤分開 |
| `describeUnauthorized(() => app, 'get', '/api/admin/xxx')` | 一行產生「未帶 token → 401」測試。收 app **getter** 而非實例——app 在 `beforeAll` 才建立，describe 收集階段傳實例會拿到 `undefined` |

> 400（Zod 驗證）、429（限流）、未知路由 404 屬框架層、沒有業務 code，維持只斷言 status。

### 覆蓋率門檻

門檻只涵蓋**邏輯層**，wiring / 宣告 / 已由 e2e 涵蓋的部分排除在分母外——納入只會稀釋數字，並逼著為 DI 配線寫無意義的測試。

- **後端**（jest）：`coveragePathIgnorePatterns` 排除 `*.module.ts`、`main.ts`、`*Controller.ts`、`*Request.ts`、`*Query.ts`、`port/`、`facade/`、`adapter/out/`、`validate-env.ts`；門檻 70/60/70/70。
- **前端**（vitest）：coverage `include` 只列 `src/lib` 與 `src/components`，排除需 Router / api-client context 的組合層（pages、與 `/me` 整合的 hooks）；門檻 75/75/60/75。

門檻只有 `test:cov` 會執行（`test` 不帶 coverage，供開發時快速回饋）。

### 架構守則測試

把 `CLAUDE.md` 的 Hard Rules 從「文字約束」變成「會失敗的檢查」。純靜態掃描原始碼，不連 DB / Redis / HTTP，全部跑完約 0.2 秒。

```bash
pnpm --filter @app/api test:arch   # 只跑架構守則
pnpm --filter @app/api test        # 單元測試 + 架構守則（串接執行）
```

現有規則：

| 檔案 | 守住的 Hard Rule |
| --- | --- |
| `no-native-error.spec.ts` | `src/**` 不得 `throw new Error`（業務錯誤一律 domain exception） |
| `layering.spec.ts` | controller 不得 import Prisma / persistence / `*Repository` |
| `side-isolation.spec.ts` | 路徑含 `/admin/` 與 `/front/` 的檔案不得互相 import |
| `response-codes.spec.ts` | domain exception 不得寫字面值 code；`ResponseCodes` 不得有死碼 |
| `env-schema.spec.ts` | 每個 `process.env.X` 都必須宣告於 `envSchema` |

**新增一條規則的作法**（三步缺一不可）：

1. 用 `helpers.ts` 的 `collectSourceFiles` / `findViolations` 寫規則，失敗訊息用 `violationReport(violations, '繁中修正指引')` 組裝——輸出會帶每筆 `檔案:行號`。
2. 加一支「掃描範圍有效」測試（`expect(files.length).toBeGreaterThan(0)`）。**沒有這道檢查，目錄改名或命名慣例不同就會掃到 0 個檔案並靜默全綠**（實例：controller 命名是 `XxxController.ts` 而非 `xxx.controller.ts`）。
3. **反向驗證**：插一個違規探針 → 親眼看它變紅 → 移除探針 → `git diff` 確認乾淨。沒看過紅的架構測試等於沒證明任何事。

**豁免機制**（`allowlist.ts`）：`PERMANENT` 需附理由（如「SMTP 未初始化屬環境設定錯誤，回 500 語意正確」）；`TEMPORARY` 需指名負責清除它的 change。每條規則都會驗證「豁免項目在原始碼中確實仍存在」，違規修掉卻忘了刪豁免會**失敗**，避免白名單單向膨脹。

**與 eslint 的分工**：單檔就能判定的 import 邊界交給 `eslint.config.mjs` 的 `@typescript-eslint/no-restricted-imports`（快、IDE 即時）；跨檔語意（錯誤碼註冊、死碼、env 宣告）交給架構測試。⚠️ flat config 中同名規則**後蓋前、不合併 patterns**，重疊的檔案範圍（如 admin 下的 controller）必須各自列齊完整限制。
