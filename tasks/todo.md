# TODO

_Tasks and cross-module items tracked across sessions._

---

## 完成項目

---

## 待處理

- [ ] **帳號鎖定管理 CRUD（add-account-lock-management）** — `add-security-ip-list-management` 的 Non-Goals 預留。後端：`GET /api/security/locks`（list 已鎖帳號 + 分頁 + 搜尋）/ `POST /api/security/locks`（手動鎖定）/ `DELETE /api/security/locks/:id`（手動解鎖）。前端：`/security/account-locks` 列表頁，sidebar「安全」group 加第三條。沿用 SUPERADMIN role gate。
