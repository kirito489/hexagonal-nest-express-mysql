import type { ReactNode } from 'react';

import { useCurrentMember } from '@/lib/use-current-member';
import type { RoleCode } from '@/lib/role-codes';
import { NoPermissionNotice } from './NoPermissionNotice';

type RequireRoleProps = {
  /** 要求的 roleCode（粗粒度 role gate）；目前只用 SUPERADMIN */
  roleCode: RoleCode;
  children: ReactNode;
};

/**
 * Router 層的粗粒度 role gate：roleCode 不符就顯示「沒有存取權限」。
 *
 * 後端 `RolesGuard` 是真實守門線，這層只負責 UX
 * （避免使用者打到頁面才被 401/403）。me query 載入中時不渲染避免閃爍。
 *
 * **原本是靜默導回首頁，改為就地顯示說明**，與 `RequirePermission` 一致。
 * 代價是洩漏了「這個頁面存在」——但 sidebar 本來就藏著它，
 * 而會手動輸入該網址的人已經知道它存在了。相對地，靜默導頁的失敗模式是
 * 使用者以為自己點錯了，再試一次、再被彈走，而沒有東西告訴他要去要權限。
 */
export const RequireRole = ({ roleCode, children }: RequireRoleProps) => {
  const { roleCode: currentRoleCode, isLoading } = useCurrentMember();

  if (isLoading) return null;
  if (currentRoleCode !== roleCode) {
    return <NoPermissionNotice required={roleCode} />;
  }
  return <>{children}</>;
};
