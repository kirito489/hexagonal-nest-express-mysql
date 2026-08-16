> 每一塊（`##` 標題）須能獨立通過驗證鏈：
> `pnpm typecheck && pnpm lint && pnpm test && pnpm --filter @app/api test:e2e && pnpm build && pnpm --filter @app/api swagger:check`
> 綠燈後給 commit 指令，由使用者手動執行，再進下一塊。
>
> 〔檔頭補寫於 2026-08-16 的 openspec 慣例整理。驗證鏈取自本檔各塊當時實際記錄的結果，塊與任務內容維持原樣未改。〕

## 1. 三條規則

- [x] 1.1 `dto-from-zod.spec.ts`：`*{Request,Query}.ts` 必須有 `z.infer`，且不得有 `export class` / `export interface`
- [x] 1.2 `e2e-real-database.spec.ts`：e2e 不得 `overrideProvider(PrismaService)`；`test-app.ts` 不得提供 mock 入口
- [x] 1.3 `commonjs-baseline.spec.ts`：root 與 `apps/api` 的 package.json 不得有 `"type": "module"`（掃描範圍不含 `apps/web`）
- [x] 1.4 三支各加「掃描數 > 0」自我檢查與繁中修正指引

## 2. 清理殘留

- [x] 2.1 移除 `TestAppOverrides.prisma`。**「0 處在用」的判斷是錯的**——grep 只看單行，漏了 `serve-static.e2e-spec.ts` 的多行寫法，是 typecheck 抓到的；該 spec 改用真 PrismaService（與其餘 e2e 一致）
- [x] 2.2 確認 e2e 全綠（144 tests）

## 3. 驗證與收尾

- [x] 3.1 **反向驗證**：手寫 interface DTO → 紅；e2e overrideProvider → 紅；`type: module` 於 **root** → 紅。於 `apps/api` 則讓 **jest 直接無法啟動**（`.js` config 被當 ES module），規則來不及執行——該情境的第一道防線其實是 jest 自己
- [x] 3.2 `CLAUDE.md` 三條的標註由 `自律` 改為 `測試`
- [x] 3.3 完整驗證鏈：typecheck 0 error / lint ✓ / 234+32+29 ✓ / e2e 144 ✓ / build ✓ / swagger:check ✓
