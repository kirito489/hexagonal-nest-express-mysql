import { useCallback, useState } from 'react';
import { TriangleAlert } from 'lucide-react';

import { PageHeader } from '@/components/PageHeader';
import { DataTablePagination } from '@/components/data-table/DataTablePagination';
import { DeleteConfirmDialog } from '@/components/DeleteConfirmDialog';
import { useAccountLocksQuery } from './hooks/use-account-locks-query';
import { useAccountLocksUrlState } from './hooks/use-account-locks-url-state';
import { useAccountLocksMutations } from './hooks/use-account-locks-mutations';
import { AccountLocksSearchBar } from './components/AccountLocksSearchBar';
import {
  AccountLocksTable,
  type AccountLockRow,
} from './components/AccountLocksTable';

export const AccountLocksPage = () => {
  const url = useAccountLocksUrlState();
  const listQuery = useAccountLocksQuery({
    page: url.page,
    limit: url.limit,
    search: url.search,
    status: url.status,
  });
  const { unlock } = useAccountLocksMutations();

  const [unlockTarget, setUnlockTarget] = useState<AccountLockRow | null>(null);

  const handleUnlockRequest = useCallback((row: AccountLockRow) => {
    setUnlockTarget(row);
  }, []);

  const handleConfirmUnlock = async () => {
    if (!unlockTarget?.email) return;
    try {
      await unlock.mutateAsync({ body: { email: unlockTarget.email } });
      setUnlockTarget(null);
    } catch {
      // mutation hook 已 toast.error
    }
  };

  const list: AccountLockRow[] = listQuery.data?.list ?? [];
  const meta = listQuery.data?.meta ?? {
    page: url.page,
    limit: url.limit,
    total: 0,
    totalPages: 1,
  };

  // 尚未載入完成時不預設為 false，否則會閃一下「功能已停用」的提示
  const lockEnabled = listQuery.data?.lockEnabled !== false;

  return (
    <div className="flex flex-col gap-4">
      {/*
        副標描述的是**啟用後**的行為，所以功能關閉時不能用現在式陳述——
        「連續登入失敗會自動鎖定」與底下的停用提示會直接互相矛盾，
        而使用者只會讀到其中一句。關閉時改成中性的說明，狀態交給提示區講
      */}
      <PageHeader
        title="帳號鎖定"
        description={
          lockEnabled
            ? '連續登入失敗達門檻時自動鎖定；時效到期會自動解開，也可以在這裡提前解鎖'
            : '列出目前有鎖定紀錄的後台帳號'
        }
      />

      {!lockEnabled && (
        <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <p>
            帳號鎖定功能目前為<strong>停用</strong>狀態 （
            <code className="font-mono">APPLICATION_ACCOUNT_LOCK_ENABLED</code>
            ）。 系統不會因連續登入失敗而鎖定任何帳號，因此這份清單將一直是空的
            ——這不代表「目前沒有人被鎖」。
          </p>
        </div>
      )}

      <AccountLocksSearchBar
        initialSearch={url.search}
        status={url.status}
        onSearch={url.setSearch}
        onStatusChange={url.setStatus}
      />

      <AccountLocksTable
        data={list}
        isLoading={listQuery.isLoading}
        lockEnabled={lockEnabled}
        unlockingEmail={unlock.isPending ? unlockTarget?.email : null}
        onUnlock={handleUnlockRequest}
      />

      <DataTablePagination
        page={meta.page ?? url.page}
        limit={meta.limit ?? url.limit}
        total={meta.total ?? 0}
        onPageChange={url.setPage}
        onLimitChange={url.setLimit}
      />

      <DeleteConfirmDialog
        open={!!unlockTarget}
        title="確認解鎖帳號"
        description={
          <>
            即將解鎖
            <span className="text-foreground font-mono">
              {' '}
              {unlockTarget?.email ?? '—'}{' '}
            </span>
            ，並清除其失敗登入計數。
            {unlockTarget?.status === 'expired' &&
              '（此帳號的鎖定已到期、目前已可登入，解鎖只是清除殘留紀錄。）'}
            確認繼續嗎？
          </>
        }
        isDeleting={unlock.isPending}
        onCancel={() => setUnlockTarget(null)}
        onConfirm={handleConfirmUnlock}
      />
    </div>
  );
};
