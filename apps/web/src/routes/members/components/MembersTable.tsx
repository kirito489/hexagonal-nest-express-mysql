import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import type { ColumnDef } from '@tanstack/react-table'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Switch } from '@/components/ui/switch'
import {
  Tooltip as TooltipPrimitive,
} from 'radix-ui'
import { DataTable } from '@/components/data-table/DataTable'
import { formatRelativeTime } from '@/lib/format-relative-time'

export type MemberRow = {
  id?: string
  email?: string
  member?: string
  roleId?: string
  roleName?: string
  status?: boolean
  isDefault?: boolean
  lastLoginAt?: string | null
  createdAt?: string
  updatedAt?: string
}

type MembersTableProps = {
  data: MemberRow[]
  isLoading?: boolean
  /** 當前登入者的 sub，用於 disable 自己這列的 status Switch */
  currentSub: string | undefined
  /** 是否有 BACKEND:ACCOUNT:EDIT 權限 */
  canEdit: boolean
  onEdit: (member: MemberRow) => void
  onDelete: (member: MemberRow) => void
  onToggleStatus: (member: MemberRow, nextStatus: boolean) => void
}

const Tooltip = TooltipPrimitive.Root
const TooltipTrigger = TooltipPrimitive.Trigger
const TooltipContent = TooltipPrimitive.Content

export const MembersTable = ({
  data,
  isLoading,
  currentSub,
  canEdit,
  onEdit,
  onDelete,
  onToggleStatus,
}: MembersTableProps) => {
  const columns: ColumnDef<MemberRow>[] = [
    {
      accessorKey: 'member',
      header: '名稱',
      cell: ({ row }) => (
        <div className="font-medium">{row.original.member ?? '—'}</div>
      ),
    },
    {
      accessorKey: 'email',
      header: 'Email',
      cell: ({ row }) => (
        <div className="text-muted-foreground">{row.original.email ?? '—'}</div>
      ),
    },
    {
      accessorKey: 'roleName',
      header: '角色',
      cell: ({ row }) => row.original.roleName ?? '—',
    },
    {
      accessorKey: 'status',
      header: '狀態',
      cell: ({ row }) => {
        const isSelf = row.original.id === currentSub
        const disabled = !canEdit || isSelf
        const reason = !canEdit ? '無編輯權限' : isSelf ? '不能停用自己的帳號' : ''
        const switchNode = (
          <Switch
            checked={row.original.status ?? false}
            disabled={disabled}
            onCheckedChange={(v) => onToggleStatus(row.original, v)}
          />
        )
        if (!disabled) return switchNode
        return (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-block">{switchNode}</span>
            </TooltipTrigger>
            <TooltipContent
              side="top"
              className="bg-foreground text-background rounded-md px-2 py-1 text-xs"
            >
              {reason}
            </TooltipContent>
          </Tooltip>
        )
      },
    },
    {
      accessorKey: 'lastLoginAt',
      header: '最後登入',
      cell: ({ row }) => {
        const v = row.original.lastLoginAt
        if (!v) return <span className="text-muted-foreground">—</span>
        return (
          <span title={new Date(v).toISOString()}>{formatRelativeTime(v)}</span>
        )
      },
    },
    {
      id: 'actions',
      header: () => <div className="text-right">操作</div>,
      cell: ({ row }) => {
        if (!canEdit) return null
        return (
          <div className="text-right">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm">
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => onEdit(row.original)}>
                  <Pencil />
                  編輯
                </DropdownMenuItem>
                <DropdownMenuItem
                  variant="destructive"
                  disabled={row.original.isDefault}
                  onSelect={() => onDelete(row.original)}
                >
                  <Trash2 />
                  刪除
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )
      },
    },
  ]

  return (
    <DataTable
      columns={columns}
      data={data}
      isLoading={isLoading}
      emptyMessage="目前沒有會員"
    />
  )
}
