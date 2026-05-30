# TODO

_跨 session 追蹤的待辦與跨模組事項。待處理依優先序在上，完成的歸到下方並按日期分組。_

---

## 待處理

### 安全強化（專案審查延伸）

- [ ] **全域 JwtAuthGuard（預設拒絕）** `審查#7` — 將 `JwtAuthGuard` 從各 controller 的 `@UseGuards` 提升為 `APP_GUARD`，並以 `@Public()` decorator 白名單標記 login / refresh / forgot-password 等公開路由，改成「預設拒絕、明示放行」，避免未來新 controller 漏掛認證即裸奔。需同步調整全部 e2e（公開路由標 `@Public`）。
- [ ] **refresh token 重用連坐撤銷** `審查#10` — rotation 偵測到「已黑名單 refresh 又被使用」時，除拒絕該次外應撤銷該使用者所有 session。需在 schema 加 `tokenVersion` 欄位（migration）並於簽發 / 驗證帶入比對。

### 功能

- [ ] **帳號鎖定管理 CRUD（add-account-lock-management）** — `add-security-ip-list-management` 的 Non-Goals 預留。後端 `GET/POST /api/security/locks`、`DELETE /api/security/locks/:id`（list 已鎖帳號 + 分頁 + 搜尋 / 手動鎖定 / 手動解鎖）；前端 `/security/account-locks` 列表頁，sidebar「安全」group 加第三條。沿用 SUPERADMIN role gate。

---

## 完成項目

### 2026-05-30

- [x] **專案審查問題修補** — `/review-project` 發現的 15 項安全 / 健壯性問題，typecheck / lint / test / e2e(111) 全綠：
  - 密碼重設 token 改存 sha256；forgot / reset 加 `@Throttle` 並改回 `204`；forgot log 不再寫 email。
  - 新增 `TRUST_PROXY` env 並在 `main.ts` 設定；IP 黑名單取不到來源改 fail-closed。
  - 帳號鎖定 adapter 全 path 補 `deletedAt: null`（`isLocked` 改 `findFirst`）。
  - 外部服務（recaptcha / mail / s3 / firebase）+ Redis 連線加 timeout（Redis 另加 `pingInterval` 偵測 half-open）。
  - JWT 簽發 / 驗證加 issuer / audience（env `JWT_ISSUER` / `JWT_AUDIENCE`），`JwtPayload.type` 改必填。
  - Permission repo 改 `select` + interactive transaction；`findDefaultRoleId` 轉 `DefaultRoleNotFoundException`。
  - 前端 `api/client.ts` refresh 重發後仍 401 改導向登入。

- [x] **初始包基礎建設補強** — 安全與品質四項，typecheck / lint / test 全綠：
  - Helmet HTTP 安全標頭（`main.ts`，關 CSP 以相容 Swagger UI）。
  - 健康檢查升級 liveness `/health` + readiness `/health/ready`（@nestjs/terminus 探 DB `SELECT 1` + Redis `ping()`），含 Swagger 與 e2e。
  - 可觀測性：Sentry 錯誤追蹤 + Prometheus `/api/metrics`，皆 feature flag 預設關閉。
  - 測試覆蓋：後端 30.86% → 86.77%（補 17 個 spec），前端建 jsdom + coverage 基建並補元件 / hook 測試；前後端設保守 coverage 門檻。
