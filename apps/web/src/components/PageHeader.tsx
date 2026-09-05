import type { ReactNode } from 'react';

type PageHeaderProps = {
  title: string;
  /** 副標；說明這一頁管的是什麼，不重複標題 */
  description?: ReactNode;
  /** 右側的動作區（新增按鈕等）；沒有時排版會自動改為單欄 */
  children?: ReactNode;
};

/**
 * 列表頁的頁首。
 *
 * **存在的理由是「照抄前一頁」會在第 N 頁抄歪。** 四個列表頁原本各自手寫這段結構，
 * 目前逐字相同——而衍生專案同樣的結構寫到第八頁時，新加的那頁三處都偏了
 * （多了內距、頁首用 `<div>` 而非 `<header>`、標題字重不同），
 * **typecheck / lint / 測試全綠**，是用眼睛看出來的。
 *
 * 有無動作區的排版差異也收進來：沒有 `children` 時不套水平排版。
 * 留給呼叫端決定的話，「這一頁忘了加 flex」不會有任何東西擋得住——
 * 那正是下一個分歧的來源。
 *
 * 刻意**不加架構守則**擋「頁首必須用本元件」：明細頁、登入頁、首頁本來就沒有
 * 這層結構，規則放寬到能容納它們之後就抓不到真正的偏差了，
 * 而會誤報的守則會被繞過（把檔案加進白名單，規則從此空轉）。
 * **用元件取代規則——沒有可以寫歪的地方，就不需要有人記得寫對。**
 */
export const PageHeader = ({
  title,
  description,
  children,
}: PageHeaderProps) => (
  <header
    className={
      children ? 'flex flex-wrap items-center justify-between gap-3' : undefined
    }
  >
    <div>
      <h1 className="text-2xl font-semibold">{title}</h1>
      {description && (
        <p className="text-muted-foreground text-sm">{description}</p>
      )}
    </div>
    {children}
  </header>
);
