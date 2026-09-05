## Context

四支列表頁的頁首目前是這個結構，四份逐字相同：

```tsx
<header className="flex flex-wrap items-center justify-between gap-3">
  <div>
    <h1 className="text-2xl font-semibold">標題</h1>
    <p className="text-muted-foreground text-sm">副標</p>
  </div>
  <Button …>動作</Button>
</header>
```

一致是因為每一頁都照抄前一頁——而那個機制在第 N 頁會失效。衍生專案在第八頁失效了，三處偏差全部通過 typecheck / lint / 測試。

模板的下一頁（C6a 的帳號鎖定列表）正是衍生專案抄歪的那一頁。

## Goals / Non-Goals

**Goals:**

- 頁首結構只有一份，沒有可以寫歪的地方
- 把「有無動作區」的排版差異也收進元件
- 四支頁面的 DOM 與 class 維持不變（純重構）

**Non-Goals:**

- **不加守則擋「頁首必須用 PageHeader」**（見 D2）。
- **不動明細頁 / 登入頁 / 首頁**：它們沒有這層結構，硬套只會讓元件長出一堆選項。
- **不順便統一頁面的外層容器**（`<div className="flex flex-col gap-4">`）：那是頁面級的版面，不屬頁首。範圍再擴就變成「重寫版面」而不是「抽一個元件」。

## Decisions

### D1：排版差異收進元件，而不是留給呼叫端

沒有動作區時 `<header>` 不套 flex；有動作區才套 `justify-between`。

不選「一律套 flex」：單欄時 `justify-between` 沒有意義，但它會在只有一個子元素時仍然生效，未來加東西的人會得到意外的排版。

不選「讓呼叫端自己決定要不要傳 className」：**那正是下一個分歧的來源**——衍生專案的八頁裡就有一頁沒加 flex，而沒有任何東西擋得住。元件自己依 `children` 有無決定，呼叫端不需要知道這件事。

這條有測試釘著（「有動作區才套 `justify-between`，沒有就維持單欄」）——它是元件存在理由的一半，不能只靠 `className` 恰好寫對。

### D2：用元件取代守則，刻意不寫架構規則

考慮過寫一條「`routes/*/page.tsx` 的頁首必須用 `PageHeader`」。**否決**。

問題在於例外：明細頁、登入頁、首頁本來就沒有這層結構。規則要放寬到能容納它們，放寬之後就抓不到真正的偏差了——而**會誤報的守則會被繞過**（把檔案加進白名單，規則從此空轉）。

元件解決的是同一件事但沒有這個問題：**沒有可以寫歪的地方，就不需要有人記得寫對**。這與 `guardrail-inventory` 那種「靠自律的清單一定會漂移」是同一個判準的另一面——能用結構消除的，不要用規則去盯。

### D3：`description` 型別用 `ReactNode` 而非 `string`

副標目前四頁都是純文字，但未來可能要放行內連結或強調。用 `ReactNode` 現在不多花成本，之後要改型別則會動到所有呼叫端。

`title` 維持 `string`：它進 `<h1>`，而標題放 JSX 幾乎一定是設計上的問題。

## Risks / Trade-offs

- **[重構可能改到 DOM 或 class]** → 四支頁面的結構逐字相同，抽出時原樣搬移；驗證方式是前端測試 + 實際看畫面。
- **[沒有守則，未來仍可能有人手寫頁首]** → D2 的知情取捨。元件降低了寫歪的機率但沒有消除它；code review 仍是那一層。
- **[元件之後長出過多選項]** → 目前只有三個 prop。要加第四個之前先問「是不是這一頁不該用這個元件」。

## Migration Plan

無 migration、無 API 變更。純前端重構，四支頁面的輸出 DOM 不變。
