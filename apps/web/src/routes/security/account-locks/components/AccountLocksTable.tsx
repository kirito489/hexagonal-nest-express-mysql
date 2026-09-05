import { useMemo } from 'react';
import { LockOpen } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';

import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/data-table/DataTable';
import { formatRelativeTime } from '@/lib/format-relative-time';

export type AccountLockRow = {
  id?: string;
  email?: string;
  member?: string;
  lockedAt?: string;
  unlocksAt?: string;
  failedLoginCount?: number;
  status?: 'locked' | 'expired';
};

type AccountLocksTableProps = {
  data: AccountLockRow[];
  isLoading?: boolean;
  /** 帳號鎖定功能是否啟用；決定空狀態說的是「沒有」還是「不會有」 */
  lockEnabled: boolean;
  unlockingEmail?: string | null;
  onUnlock: (row: AccountLockRow) => void;
};

export const AccountLocksTable = ({
  data,
  isLoading,
  lockEnabled,
  unlockingEmail,
  onUnlock,
}: AccountLocksTableProps) => {
  const columns = useMemo<ColumnDef<AccountLockRow>[]>(
    () => [
      {
        accessorKey: 'email',
        header: 'Email',
        cell: ({ row }) => (
          <span className="font-mono text-sm">{row.original.email ?? '—'}</span>
        ),
      },
      {
        accessorKey: 'member',
        header: '名稱',
        cell: ({ row }) => row.original.member ?? '—',
      },
      {
        accessorKey: 'status',
        header: '狀態',
        cell: ({ row }) => {
          const expired = row.original.status === 'expired';
          return (
            <span
              className={
                expired
                  ? 'text-muted-foreground rounded border px-2 py-0.5 text-xs'
                  : 'rounded border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200'
              }
            >
              {expired ? '已到期' : '鎖定中'}
            </span>
          );
        },
      },
      {
        accessorKey: 'failedLoginCount',
        header: '失敗次數',
        cell: ({ row }) => row.original.failedLoginCount ?? 0,
      },
      {
        accessorKey: 'lockedAt',
        header: '鎖定時間',
        cell: ({ row }) =>
          row.original.lockedAt
            ? formatRelativeTime(row.original.lockedAt)
            : '—',
      },
      {
        accessorKey: 'unlocksAt',
        header: '解鎖時間',
        cell: ({ row }) => {
          // 已到期的列講「還要等多久」沒有意義，直接說它已經可以登入
          if (row.original.status === 'expired')
            return <span className="text-muted-foreground">已自動解鎖</span>;
          return row.original.unlocksAt
            ? formatRelativeTime(row.original.unlocksAt)
            : '—';
        },
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <div className="flex justify-end">
            {/*
              已到期的列**同樣可按**：本專案的解鎖服務只拒絕「從未鎖定」，
              而列表只列有 lockedAt 的帳號——每一列的解鎖都會成功，
              作用是清掉殘留的 lockedAt 與失敗計數
            */}
            <Button
              variant="outline"
              size="sm"
              disabled={unlockingEmail === row.original.email}
              onClick={() => onUnlock(row.original)}
            >
              <LockOpen />
              解鎖
            </Button>
          </div>
        ),
      },
    ],
    [onUnlock, unlockingEmail],
  );

  return (
    <DataTable
      columns={columns}
      data={data}
      isLoading={isLoading}
      emptyMessage={
        lockEnabled
          ? '目前沒有帳號被鎖定'
          : '帳號鎖定功能已停用，系統不會產生鎖定紀錄'
      }
    />
  );
};
