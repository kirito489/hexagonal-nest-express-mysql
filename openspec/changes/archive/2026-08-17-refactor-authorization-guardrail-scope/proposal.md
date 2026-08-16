## Why

第四輪審查實測出授權守則的兩個盲區，程式碼已修，但 spec 停在舊行為：

- 「授權裝飾器覆蓋檢查」仍寫「任何 handler 若含 `@Param(`」，實際已放寬到
  `@Param` / `@Body` / `@Query`；且完全沒提**比對前必須去註解**——那才是本輪的核心發現，
  實測拿掉真的 `@Roles` 只留檔頭註解，守則照樣全綠。
- 忘記密碼的需求只寫了節流「壓低時間差可被利用的次數」，但寄信已改為不阻塞回應
  （SMTP 連不上會走滿 10 秒的 connectionTimeout，讓「帳號存在」慢兩個數量級），
  這是新的硬性要求而非既有描述的細節。

不補的話，下一個依 spec 判斷行為的人會拿到過時的前提——上一輪就是這樣累積出 10 條缺口。

## What Changes

- **MODIFIED** `platform-engineering-guardrails` 的「授權裝飾器覆蓋檢查」：
  觸發條件放寬、補上「去註解」與「切塊須往前吃裝飾器」兩條實作約束、
  補上自我範圍豁免與其知情缺口、要求守則自身須有合成輸入的測試。
- **MODIFIED** `api-auth` 的「忘記密碼（防帳號列舉）」：補上「寄信不得阻塞回應」。
- **無程式碼變更**——本 change 描述的行為都已實作並有測試守著。

## Capabilities

### Modified Capabilities

- `platform-engineering-guardrails`：改寫「授權裝飾器覆蓋檢查」一條需求。
- `api-auth`：既有的忘記密碼需求補上「寄信不得阻塞回應」與兩個 scenario。

## Impact

- 僅影響 `openspec/specs/`，不動 `apps/` 與 `packages/`。
- 無需 migration、無需改 `.env`。
