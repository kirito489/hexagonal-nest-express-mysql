import { useEffect, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { DataTablePagination } from '@/components/data-table/DataTablePagination'
import { useApiQuery } from '@/api/client'
import { useHasPermission } from '@/lib/use-has-permission'
import { useCurrentMember } from '@/lib/use-current-member'
import { useRolesQuery } from './hooks/use-roles-query'
import { useRolesUrlState } from './hooks/use-roles-url-state'
import { useRoleMutations } from './hooks/use-role-mutations'
import { RolesSearchBar } from './components/RolesSearchBar'
import { RolesTable, type RoleRow } from './components/RolesTable'
import { RoleFormDialog } from './components/RoleFormDialog'
import { DeleteRoleDialog } from './components/DeleteRoleDialog'
import {
  normalizePermissionCodes,
  type RoleFormValues,
} from './lib/role-form-schema'

const PERM_VIEW = 'BACKEND:ROLE:VIEW'
const PERM_EDIT = 'BACKEND:ROLE:EDIT'

export const RolesPage = () => {
  // hook 先 unconditional 呼叫，再做條件 return（守 react-hooks/rules-of-hooks）
  const canView = useHasPermission(PERM_VIEW)
  const canEdit = useHasPermission(PERM_EDIT)
  const { isLoading: meLoading } = useCurrentMember()
  const queryClient = useQueryClient()

  const url = useRolesUrlState()
  const rolesQuery = useRolesQuery({
    page: url.page,
    limit: url.limit,
    name: url.name,
  })
  const mutations = useRoleMutations()

  const [createOpen, setCreateOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<RoleRow | null>(null)

  // 編輯 dialog 由 URL ?edit=<uuid> 控制，重整能恢復
  const editEnabled = Boolean(url.edit)
  const editQuery = useApiQuery(
    'GET',
    '/roles/{id}',
    { params: { path: { id: url.edit ?? '' } } },
    { enabled: editEnabled },
  )

  // edit GET 失敗（404 / 403）→ 關閉 dialog + toast；放 useEffect 避免 render 階段 setState
  useEffect(() => {
    if (editEnabled && editQuery.isError) {
      toast.error('找不到該角色或無權限存取')
      url.closeEdit()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editEnabled, editQuery.isError])

  const editInitialValues = useMemo<RoleFormValues | undefined>(() => {
    const d = editQuery.data
    if (!d) return undefined
    return {
      name: d.name ?? '',
      permissionCodes: d.permissionCodes ?? [],
      status: d.status ?? true,
    }
  }, [editQuery.data])

  // 條件 return 放在所有 hook 之後
  if (!canView && !meLoading) {
    return <Navigate to="/" replace />
  }

  const list: RoleRow[] = rolesQuery.data?.list ?? []
  const meta = rolesQuery.data?.meta ?? {
    page: url.page,
    limit: url.limit,
    total: 0,
    totalPages: 1,
  }

  const handleToggleStatus = async (role: RoleRow, nextStatus: boolean) => {
    if (!role.id) return
    // optimistic：把所有 GET /roles 變體中對應 row 的 status 翻轉
    queryClient.setQueriesData<RolesData>(
      { queryKey: ['GET', '/roles'] },
      (old) => mutateRowStatus(old, role.id!, nextStatus),
    )
    try {
      // 單一 PATCH 只送 status，不影響 name / permissions
      await mutations.toggleStatus.mutateAsync({
        params: { path: { id: role.id } },
        body: { status: nextStatus },
      })
    } catch {
      // mutation hook 自己已 toast.error；invalidate 重抓回正確狀態
      void queryClient.invalidateQueries({ queryKey: ['GET', '/roles'] })
    }
  }

  const handleCreateSubmit = async (values: RoleFormValues) => {
    await mutations.create.mutateAsync({
      body: {
        name: values.name,
        // defense in depth：UI 已強制 EDIT→VIEW，提交前再 normalize 一次（sort + 去重 + 補 VIEW）
        permissionCodes: normalizePermissionCodes(values.permissionCodes),
      },
    })
    setCreateOpen(false)
  }

  const handleUpdateSubmit = async (values: RoleFormValues) => {
    if (!url.edit) return
    await mutations.update.mutateAsync({
      params: { path: { id: url.edit } },
      body: {
        name: values.name,
        permissionCodes: normalizePermissionCodes(values.permissionCodes),
        status: values.status,
      },
    })
    url.closeEdit()
  }

  const handleConfirmDelete = async (role: RoleRow) => {
    if (!role.id) return
    try {
      await mutations.remove.mutateAsync({
        params: { path: { id: role.id } },
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
          <h1 className="text-2xl font-semibold">角色管理</h1>
          <p className="text-muted-foreground text-sm">
            管理後台角色、權限指派與啟用狀態
          </p>
        </div>
        <Button disabled={!canEdit} onClick={() => setCreateOpen(true)}>
          <Plus />
          新增角色
        </Button>
      </header>

      <RolesSearchBar initialName={url.name} onSearch={url.setSearch} />

      <RolesTable
        data={list}
        isLoading={rolesQuery.isLoading}
        canEdit={canEdit}
        onEdit={(r) => r.id && url.openEdit(r.id)}
        onDelete={(r) => setDeleteTarget(r)}
        onToggleStatus={handleToggleStatus}
      />

      <DataTablePagination
        page={meta.page ?? url.page}
        limit={meta.limit ?? url.limit}
        total={meta.total ?? 0}
        onPageChange={url.setPage}
        onLimitChange={url.setLimit}
      />

      <RoleFormDialog
        open={createOpen}
        mode="create"
        isSubmitting={mutations.create.isPending}
        onClose={() => setCreateOpen(false)}
        onSubmit={handleCreateSubmit}
      />

      <RoleFormDialog
        open={editEnabled && !editQuery.isLoading && !!editInitialValues}
        mode="edit"
        initialValues={editInitialValues}
        isSubmitting={mutations.update.isPending}
        onClose={url.closeEdit}
        onSubmit={handleUpdateSubmit}
      />

      <DeleteRoleDialog
        role={deleteTarget}
        isDeleting={mutations.remove.isPending}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
      />
    </div>
  )
}

type RolesData =
  | {
      list?: Array<{ id?: string; status?: boolean; [k: string]: unknown }>
      meta?: unknown
    }
  | undefined

const mutateRowStatus = (
  data: RolesData,
  id: string,
  nextStatus: boolean,
): RolesData => {
  if (!data?.list) return data
  return {
    ...data,
    list: data.list.map((row) =>
      row.id === id ? { ...row, status: nextStatus } : row,
    ),
  }
}
