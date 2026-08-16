> 每一塊（`##` 標題）須能獨立通過驗證鏈：
> `pnpm typecheck && pnpm lint && pnpm test`
> 綠燈後給 commit 指令，由使用者手動執行，再進下一塊。
>
> **塊 1 為追認**：程式碼在本 change 建立前就已完成、驗證並待 commit
> （第四輪 review 修復），故標 `[x]`。塊 2 是本 change 實際執行的工作。
> 兩塊互相獨立。

## 1. 已完成的實作（追認，非本次執行）

- [x] 1.1 授權守則比對前去註解；class 層級只取 `@Controller(` 至 `export class` 之間
- [x] 1.2 觸發條件由 `@Param(` 放寬為 `@Param(` / `@Body(` / `@Query(`
- [x] 1.3 handler 切塊往前納入連續裝飾器行——放寬觸發條件後才浮現的既有 bug：
      `@Public()` 寫在 `@Post()` 上方時被歸給前一個 handler，造成前一支漏報、本支誤報
- [x] 1.4 加入自我範圍豁免（`@CurrentMember(` 且無 `@Param(`），並註明知情缺口
- [x] 1.5 判定邏輯抽成純函式 `auditAuthorization()`，加七組合成輸入的自我測試
- [x] 1.6 `ForgotPasswordService` 寄信改 fire-and-forget，補「不等待寄信」測試
- [x] 1.7 **反向驗證**：拿掉真 `@Roles` 只留註解 → 修復前全綠、修復後變紅；
      改回 `await` 寄信 → 新測試變紅。兩者皆確認還原後 `git diff` 乾淨

## 2. 補登 spec（本次執行）

- [x] 2.1 `platform-engineering-guardrails` 的「授權裝飾器覆蓋檢查」改寫為 MODIFIED，
      補上三條實作約束（去註解、class 區段、切塊方向）與知情缺口
- [x] 2.2 機器比對確認 MODIFIED 未遺失既有 scenario（3 → 7，零遺失）
- [x] 2.3 `api-auth` 補上「寄信不得阻塞回應」——sync 時 `openspec-spec-format`
      擋下原本的獨立需求（點名 endpoint 卻無回應契約），改併回既有的忘記密碼需求
- [x] 2.4 ~~把守則的其餘實作細節一併寫進 spec~~ —— **不做**：只寫「寫錯會讓規則
      靜默失效」的那幾條。判準是失效模式，不是「是不是實作細節」，理由見 `design.md`
- [x] 2.5 `openspec validate` 通過

## 3. 收尾

- [x] 3.1 跑完整驗證鏈並貼出實際輸出
- [x] 3.2 archive 本 change，delta 已併入 master
