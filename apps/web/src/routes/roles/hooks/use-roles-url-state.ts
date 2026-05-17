import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'

import { parseStatusParam, type StatusFilter } from '@/lib/status-filter'

const DEFAULT_PAGE = 1
const DEFAULT_LIMIT = 10

export type RolesUrlState = {
  page: number
  limit: number
  name: string
  status: StatusFilter
  /** 編輯中 role 的 uuid；undefined 表示 dialog 關閉 */
  edit: string | undefined
  /** 檢視中 role 的 uuid（唯讀 dialog）；與 edit 互斥 */
  view: string | undefined
}

const parseInt = (v: string | null, fallback: number): number => {
  if (!v) return fallback
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

/**
 * 角色列表頁的 URL state：page / limit / name / edit 全部同步到 query string
 * 與 members 的版本一致，只是少一個 email 欄位
 */
export const useRolesUrlState = (): RolesUrlState & {
  setPage: (page: number) => void
  setLimit: (limit: number) => void
  setSearch: (name: string) => void
  setStatus: (status: StatusFilter) => void
  openEdit: (id: string) => void
  closeEdit: () => void
  openView: (id: string) => void
  closeView: () => void
} => {
  const [searchParams, setSearchParams] = useSearchParams()

  // edit / view 互斥：使用者可能手動編 URL 同時帶兩者，state 推導端就解掉，
  // 呼叫端不必再寫 `&& !editEnabled` 兜底
  const editParam = searchParams.get('edit') ?? undefined
  const state: RolesUrlState = {
    page: parseInt(searchParams.get('page'), DEFAULT_PAGE),
    limit: parseInt(searchParams.get('limit'), DEFAULT_LIMIT),
    name: searchParams.get('name') ?? '',
    status: parseStatusParam(searchParams.get('status')),
    edit: editParam,
    view: editParam ? undefined : (searchParams.get('view') ?? undefined),
  }

  const update = useCallback(
    (mut: Partial<RolesUrlState>) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          const apply = (
            key: keyof RolesUrlState,
            value: string | number | undefined,
            isDefault: (v: string | number | undefined) => boolean,
          ) => {
            if (value === undefined || value === '' || isDefault(value)) {
              next.delete(key)
            } else {
              next.set(key, String(value))
            }
          }
          if ('page' in mut)
            apply('page', mut.page, (v) => v === DEFAULT_PAGE)
          if ('limit' in mut)
            apply('limit', mut.limit, (v) => v === DEFAULT_LIMIT)
          if ('name' in mut) apply('name', mut.name, () => false)
          if ('status' in mut) apply('status', mut.status, () => false)
          if ('edit' in mut) apply('edit', mut.edit, () => false)
          if ('view' in mut) apply('view', mut.view, () => false)
          return next
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )

  const setPage = useCallback((page: number) => update({ page }), [update])
  const setLimit = useCallback(
    (limit: number) => update({ limit, page: DEFAULT_PAGE }),
    [update],
  )
  const setSearch = useCallback(
    (name: string) => update({ name, page: DEFAULT_PAGE }),
    [update],
  )
  const setStatus = useCallback(
    (status: StatusFilter) => update({ status, page: DEFAULT_PAGE }),
    [update],
  )
  // edit / view 互斥
  const openEdit = useCallback(
    (id: string) => update({ edit: id, view: undefined }),
    [update],
  )
  const closeEdit = useCallback(() => update({ edit: undefined }), [update])
  const openView = useCallback(
    (id: string) => update({ view: id, edit: undefined }),
    [update],
  )
  const closeView = useCallback(() => update({ view: undefined }), [update])

  return {
    ...state,
    setPage,
    setLimit,
    setSearch,
    setStatus,
    openEdit,
    closeEdit,
    openView,
    closeView,
  }
}
