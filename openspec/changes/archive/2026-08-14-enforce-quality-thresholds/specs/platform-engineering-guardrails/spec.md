## ADDED Requirements

### Requirement: 前端分層邊界

`apps/web` SHALL 以 eslint `no-restricted-imports` 表達分層方向，違規 MUST 在 lint 期被攔截。

#### Scenario: 下層反向相依上層

- **WHEN** `src/lib`、`src/hooks` 或 `src/components` 之下的檔案 import `src/routes` 的模組
- **THEN** lint 失敗，訊息指出應由上層傳入而非反向相依

#### Scenario: 路由之間互相相依

- **WHEN** 某個 route 目錄下的檔案 import 另一個 route 目錄的模組
- **THEN** lint 失敗，訊息指出共用邏輯應下沉至 `lib` 或 `components`

#### Scenario: UI 原子元件相依業務層

- **WHEN** `src/components/ui`（shadcn 生成）之下的檔案 import API 或業務模組
- **THEN** lint 失敗，維持原子元件的可重用性
