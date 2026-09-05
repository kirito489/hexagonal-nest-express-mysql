import { Home, Shield, LockKeyhole,
  ShieldBan, ShieldCheck, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { ROLE_CODE, type RoleCode } from '@/lib/role-codes';
import { PERMISSION_CODE, type PermissionCode } from '@/lib/permission-codes';

export type NavItem = {
  label: string;
  path: string;
  icon: LucideIcon;
  /** 屬於哪個 sidebar group（如「使用者與權限」「安全」）；未指定為「無 group」固定放最上 */
  group?: string;
  /**
   * 需要的權限代碼；undefined 表示所有登入者都看得到。
   *
   * 型別收緊為 `PermissionCode` 而非 `string`：打錯一個字會讓這個項目
   * 對所有人消失（含 SUPERADMIN），而不會有任何東西失敗。
   */
  requiredPermission?: PermissionCode;
  /** 粗粒度 role gate（與 requiredPermission 並用，兩者皆通才顯示） */
  requiredRoleCode?: RoleCode;
};

/**
 * Sidebar 導航項目宣告。新增模組時加一筆即可：
 * - Layout 會依 requiredPermission + requiredRoleCode 過濾可見項目
 * - 依 group 分塊渲染（整組空就不渲染整個 group）
 */
export const NAV_ITEMS: NavItem[] = [
  // 無 group → 獨立排在最上方
  { label: '首頁', path: '/', icon: Home },

  // 使用者與權限
  {
    label: '會員管理',
    path: '/members',
    icon: Users,
    group: '使用者與權限',
    requiredPermission: PERMISSION_CODE.ACCOUNT_VIEW,
  },
  {
    label: '角色管理',
    path: '/roles',
    icon: Shield,
    group: '使用者與權限',
    requiredPermission: PERMISSION_CODE.ROLE_VIEW,
  },

  // 安全（SUPERADMIN-only）
  {
    label: 'IP 白名單',
    path: '/security/ip-whitelist',
    icon: ShieldCheck,
    group: '安全',
    requiredRoleCode: ROLE_CODE.SUPERADMIN,
  },
  {
    label: 'IP 黑名單',
    path: '/security/ip-blacklist',
    icon: ShieldBan,
    group: '安全',
    requiredRoleCode: ROLE_CODE.SUPERADMIN,
  },
  {
    label: '帳號鎖定',
    path: '/security/account-locks',
    icon: LockKeyhole,
    group: '安全',
    requiredRoleCode: ROLE_CODE.SUPERADMIN,
  },
];
