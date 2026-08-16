## Why

<!-- Explain the motivation for this change. What problem does this solve? Why now? -->

## What Changes

<!-- Describe what will change. Be specific about new capabilities, modifications, or removals. -->

## Capabilities

### New Capabilities
<!-- 新增的能力，各自產生 specs/<name>/spec.md。
     名稱為 kebab-case 且必須帶前綴，前綴決定 spec 的寫法：
       api-*       後端 endpoint 契約（後台）  例：api-member-management
       api-front-* 前台 endpoint 契約          例：api-front-article
       ui-*        前端畫面行為                例：ui-member-management
       platform-*  跨切面契約與工程規則        例：platform-api-error-response
     同一功能的前後端拆成兩支（api-xxx 與 ui-xxx），驗收方式不同。
     不要為單一 endpoint 開新能力——併進它所屬的既有 spec。 -->
- `<name>`: <這個能力涵蓋什麼>

### Modified Capabilities
<!-- Existing capabilities whose REQUIREMENTS are changing (not just implementation).
     Only list here if spec-level behavior changes. Each needs a delta spec file.
     Use existing spec names from openspec/specs/. Leave empty if no requirement changes. -->
- `<existing-name>`: <what requirement is changing>

## Impact

<!-- Affected code, APIs, dependencies, systems -->
