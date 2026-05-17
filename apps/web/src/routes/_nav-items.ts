import { Home, Shield, Users } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export type NavItem = {
  label: string
  path: string
  icon: LucideIcon
  /** 需要的權限代碼；undefined 表示所有登入者都看得到 */
  requiredPermission?: string
}

/**
 * Sidebar 導航項目宣告。新增模組時加一筆即可，Layout 會依
 * requiredPermission 與 useHasPermission 自動過濾可見項目
 */
export const NAV_ITEMS: NavItem[] = [
  { label: '首頁', path: '/', icon: Home },
  {
    label: '會員管理',
    path: '/members',
    icon: Users,
    requiredPermission: 'BACKEND:ACCOUNT:VIEW',
  },
  {
    label: '角色管理',
    path: '/roles',
    icon: Shield,
    requiredPermission: 'BACKEND:ROLE:VIEW',
  },
]
