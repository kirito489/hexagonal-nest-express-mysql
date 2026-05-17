import { useEffect, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { DataTablePagination } from '@/components/data-table/DataTablePagination'
import { useApiQuery } from '@/api/client'
import { useCurrentMember } from '@/lib/use-current-member'
import { useHasPermission } from '@/lib/use-has-permission'
import { useMembersQuery } from './hooks/use-members-query'
import { useMembersUrlState } from './hooks/use-members-url-state'
import { useMemberMutations } from './hooks/use-member-mutations'
import { MembersSearchBar } from './components/MembersSearchBar'
import { MembersTable, type MemberRow } from './components/MembersTable'
import { MemberFormDialog } from './components/MemberFormDialog'
import { DeleteMemberDialog } from './components/DeleteMemberDialog'
import type { CreateMemberForm } from './lib/member-form-schema'

const PERM_VIEW = 'BACKEND:ACCOUNT:VIEW'
const PERM_EDIT = 'BACKEND:ACCOUNT:EDIT'

export const MembersPage = () => {
  // 所有 hook 都先 unconditional 呼叫，再做條件 return（守 react-hooks/rules-of-hooks）
  const canView = useHasPermission(PERM_VIEW)
  const canEdit = useHasPermission(PERM_EDIT)
  const { sub, isLoading: meLoading } = useCurrentMember()
  const queryClient = useQueryClient()

  const url = useMembersUrlState()
  const membersQuery = useMembersQuery({
    page: url.page,
    limit: url.limit,
    name: url.name,
    email: url.email,
  })
  const mutations = useMemberMutations()

  const [createOpen, setCreateOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<MemberRow | null>(null)

  // 編輯 dialog 由 URL ?edit=<uuid> 控制，重整能恢復
  const editEnabled = Boolean(url.edit)
  const editQuery = useApiQuery(
    'GET',
    '/members/{id}',
    { params: { path: { id: url.edit ?? '' } } },
    { enabled: editEnabled },
  )

  // edit GET 失敗（404 / 403）→ 關閉 dialog + toast；放 useEffect 避免 render 階段 setState
  useEffect(() => {
    if (editEnabled && editQuery.isError) {
      toast.error('找不到該會員或無權限存取')
      url.closeEdit()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editEnabled, editQuery.isError])

  const editInitialValues = useMemo(() => {
    const d = editQuery.data
    if (!d) return undefined
    return {
      email: d.email ?? '',
      member: d.member ?? '',
      password: '',
      roleId: d.roleId ?? '',
      status: d.status ?? true,
    }
  }, [editQuery.data])

  // 條件 return 放在所有 hook 之後
  if (!canView && !meLoading) {
    return <Navigate to="/" replace />
  }

  const list: MemberRow[] = membersQuery.data?.list ?? []
  const meta = membersQuery.data?.meta ?? {
    page: url.page,
    limit: url.limit,
    total: 0,
    totalPages: 1,
  }

  const handleToggleStatus = async (member: MemberRow, nextStatus: boolean) => {
    if (!member.id) return
    // optimistic：把所有 GET /members 變體中對應 row 的 status 翻轉
    queryClient.setQueriesData<MembersData>(
      { queryKey: ['GET', '/members'] },
      (old) => mutateRowStatus(old, member.id!, nextStatus),
    )
    try {
      await mutations.update.mutateAsync({
        params: { path: { id: member.id } },
        body: {
          email: member.email ?? '',
          member: member.member ?? '',
          roleId: member.roleId ?? '',
          status: nextStatus,
        },
      })
    } catch {
      // mutation hook 自己已 toast.error；invalidate 重抓回正確狀態
      void queryClient.invalidateQueries({ queryKey: ['GET', '/members'] })
    }
  }

  const handleCreateSubmit = async (values: CreateMemberForm) => {
    await mutations.create.mutateAsync({ body: values })
    setCreateOpen(false)
  }

  const handleUpdateSubmit = async (values: CreateMemberForm) => {
    if (!url.edit) return
    // 編輯時 password 為空字串 → 不送，避免後端把空字串當新密碼存
    const body: Partial<CreateMemberForm> = { ...values }
    if (!body.password) delete body.password
    await mutations.update.mutateAsync({
      params: { path: { id: url.edit } },
      body: body as CreateMemberForm,
    })
    url.closeEdit()
  }

  const handleConfirmDelete = async (member: MemberRow) => {
    if (!member.id) return
    try {
      await mutations.remove.mutateAsync({
        params: { path: { id: member.id } },
      })
      setDeleteTarget(null)
    } catch {
      // mutation hook 已 toast.error；dialog 留著讓使用者看到狀態
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">會員管理</h1>
          <p className="text-muted-foreground text-sm">
            管理後台帳號、角色指派與啟用狀態
          </p>
        </div>
        <Button
          disabled={!canEdit}
          onClick={() => setCreateOpen(true)}
        >
          <Plus />
          新增會員
        </Button>
      </header>

      <MembersSearchBar
        initialName={url.name}
        initialEmail={url.email}
        onSearch={url.setSearch}
      />

      <MembersTable
        data={list}
        isLoading={membersQuery.isLoading}
        currentSub={sub}
        canEdit={canEdit}
        onEdit={(m) => m.id && url.openEdit(m.id)}
        onDelete={(m) => setDeleteTarget(m)}
        onToggleStatus={handleToggleStatus}
      />

      <DataTablePagination
        page={meta.page ?? url.page}
        limit={meta.limit ?? url.limit}
        total={meta.total ?? 0}
        onPageChange={url.setPage}
        onLimitChange={url.setLimit}
      />

      <MemberFormDialog
        open={createOpen}
        mode="create"
        isSubmitting={mutations.create.isPending}
        onClose={() => setCreateOpen(false)}
        onSubmit={handleCreateSubmit}
      />

      <MemberFormDialog
        open={editEnabled && !editQuery.isLoading && !!editInitialValues}
        mode="edit"
        initialValues={editInitialValues}
        isSubmitting={mutations.update.isPending}
        onClose={url.closeEdit}
        onSubmit={handleUpdateSubmit}
      />

      <DeleteMemberDialog
        member={deleteTarget}
        isDeleting={mutations.remove.isPending}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
      />
    </div>
  )
}

type MembersData = {
  list?: Array<{ id?: string; status?: boolean; [k: string]: unknown }>
  meta?: unknown
} | undefined

const mutateRowStatus = (
  data: MembersData,
  id: string,
  nextStatus: boolean,
): MembersData => {
  if (!data?.list) return data
  return {
    ...data,
    list: data.list.map((row) =>
      row.id === id ? { ...row, status: nextStatus } : row,
    ),
  }
}
