import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

import { useListUrlState } from '@/lib/use-list-url-state';

type SearchKey = 'search';

export type LockStatusFilter = 'locked' | 'expired' | 'all';

const isLockStatus = (value: string | null): value is LockStatusFilter =>
  value === 'locked' || value === 'expired' || value === 'all';

/**
 * 帳號鎖定列表頁 URL state。
 *
 * 在 `useListUrlState` 之外多帶一個 `status`——它要進網址列，
 * 否則「已到期」的查詢結果無法分享也無法重新整理。
 */
export const useAccountLocksUrlState = () => {
  const core = useListUrlState<SearchKey>({ searchKeys: ['search'] });
  const [params, setParams] = useSearchParams();

  // 不能用 [core] 當 dep — core 是新 object，會讓 setSearch 每 render 變新參考，
  // 觸發呼叫端 SearchBar useEffect 無限迴圈
  const coreSetSearch = core.setSearch;
  const setSearch = useCallback(
    (search: string) => coreSetSearch('search', search),
    [coreSetSearch],
  );

  const rawStatus = params.get('status');
  const status: LockStatusFilter = isLockStatus(rawStatus)
    ? rawStatus
    : 'locked';

  const setStatus = useCallback(
    (next: LockStatusFilter) => {
      setParams(
        (prev) => {
          const merged = new URLSearchParams(prev);
          // 預設值不寫進網址，避免每個連結都掛著一個沒有資訊的參數
          if (next === 'locked') merged.delete('status');
          else merged.set('status', next);
          // 換過濾條件等於換了結果集，停在第 3 頁會看到空白
          merged.delete('page');
          return merged;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  return {
    page: core.page,
    limit: core.limit,
    search: core.searches.search,
    status,
    setPage: core.setPage,
    setLimit: core.setLimit,
    setSearch,
    setStatus,
  };
};
