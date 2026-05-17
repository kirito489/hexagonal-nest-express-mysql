import { useNavigate, NavLink, Outlet } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { LogOut } from 'lucide-react'

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import { tokenStorage } from '@/lib/storage'
import { useCurrentMember } from '@/lib/use-current-member'
import { NAV_ITEMS } from './_nav-items'

// 後台共用 layout：左側 Sidebar、右側 main，登入後所有頁面共用
export const Layout = () => {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { permissions } = useCurrentMember()

  const visibleNavItems = NAV_ITEMS.filter(
    (item) =>
      !item.requiredPermission || permissions.includes(item.requiredPermission),
  )

  const handleLogout = () => {
    tokenStorage.clear()
    // 清前一個使用者的 query cache，避免下一個使用者登入前的短暫 race 看到舊資料
    queryClient.clear()
    navigate('/login', { replace: true })
  }

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader>
          <div className="px-2 py-1 text-sm font-semibold">管理後台</div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>主選單</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {visibleNavItems.map((item) => (
                  <SidebarMenuItem key={item.path}>
                    <NavLink to={item.path} end>
                      {({ isActive }) => (
                        <SidebarMenuButton isActive={isActive}>
                          <item.icon />
                          <span>{item.label}</span>
                        </SidebarMenuButton>
                      )}
                    </NavLink>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={handleLogout}>
                <LogOut />
                <span>登出</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="flex h-12 items-center gap-2 border-b px-4">
          <SidebarTrigger />
        </header>
        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
