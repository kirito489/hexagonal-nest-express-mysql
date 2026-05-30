# TODO

_Tasks and cross-module items tracked across sessions._

---

## 完成項目

- [x] **初始包基礎建設補強（2026-05-30）** — 安全與品質四項，皆已 typecheck/lint/test 全綠：
  - Helmet HTTP 安全標頭（`main.ts`，關 CSP 以相容 Swagger UI）。
  - 健康檢查升級 liveness `/health` + readiness `/health/ready`（@nestjs/terminus 探 DB `SELECT 1` + Redis `ping()`），含 Swagger 與 e2e。
  - 可觀測性：Sentry 錯誤追蹤（`instrument.ts`，僅報未預期 500）+ Prometheus `/api/metrics`，皆 feature flag 預設關閉。
  - 測試覆蓋：後端 30.86%→86.77%（補 17 個 service/guard/infra spec），前端建 jsdom+coverage 基建並補元件/hook 測試；前後端皆設保守 coverage 門檻。

---

## 待處理

- [ ] **帳號鎖定管理 CRUD（add-account-lock-management）** — `add-security-ip-list-management` 的 Non-Goals 預留。後端：`GET /api/security/locks`（list 已鎖帳號 + 分頁 + 搜尋）/ `POST /api/security/locks`（手動鎖定）/ `DELETE /api/security/locks/:id`（手動解鎖）。前端：`/security/account-locks` 列表頁，sidebar「安全」group 加第三條。沿用 SUPERADMIN role gate。
