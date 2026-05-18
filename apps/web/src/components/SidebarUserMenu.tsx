import { LogOut, Settings, User } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { tokenStorage } from '@/lib/storage'
import { useCurrentMember } from '@/lib/use-current-member'

/**
 * Sidebar 底部使用者選單：頭像 + 名稱 + email + dropdown（個人設定 / 登出）
 * 取代原本只有「登出」按鈕的設計
 */
export const SidebarUserMenu = () => {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { member } = useCurrentMember()

  const handleLogout = () => {
    tokenStorage.clear()
    queryClient.clear()
    navigate('/login', { replace: true })
  }

  const displayName = member?.member ?? '使用者'
  const displayEmail = member?.email ?? ''

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg" className="h-12">
              <User className="size-8 shrink-0 rounded-md bg-muted p-1.5" />
              <div className="flex min-w-0 flex-1 flex-col items-start text-left">
                <span className="truncate text-sm font-medium leading-tight">
                  {displayName}
                </span>
                {displayEmail ? (
                  <span className="text-muted-foreground truncate text-xs">
                    {displayEmail}
                  </span>
                ) : null}
              </div>
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right" align="end" className="w-48">
            <DropdownMenuLabel className="truncate">
              {displayName}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="block">
                  <DropdownMenuItem disabled>
                    <Settings />
                    個人設定
                  </DropdownMenuItem>
                </span>
              </TooltipTrigger>
              <TooltipContent side="left">下一版提供</TooltipContent>
            </Tooltip>
            <DropdownMenuItem onSelect={handleLogout}>
              <LogOut />
              登出
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
