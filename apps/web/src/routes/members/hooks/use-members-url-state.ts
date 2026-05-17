import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'

const DEFAULT_PAGE = 1
const DEFAULT_LIMIT = 10

export type MembersUrlState = {
  page: number
  limit: number
  name: string
  email: string
  /** 編輯中 member 的 uuid；undefined 表示 dialog 關閉 */
  edit: string | undefined
  /** 檢視中 member 的 uuid（唯讀 dialog）；與 edit 互斥 */
  view: string | undefined
}

const parseInt = (v: string | null, fallback: number): number => {
  if (!v) return fallback
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

/**
 * 列表頁的 URL state hook：page / limit / name / email / edit 都同步到 query string
 */
export const useMembersUrlState = (): MembersUrlState & {
  setPage: (page: number) => void
  setLimit: (limit: number) => void
  setSearch: (name: string, email: string) => void
  openEdit: (id: string) => void
  closeEdit: () => void
  openView: (id: string) => void
  closeView: () => void
} => {
  const [searchParams, setSearchParams] = useSearchParams()

  const state: MembersUrlState = {
    page: parseInt(searchParams.get('page'), DEFAULT_PAGE),
    limit: parseInt(searchParams.get('limit'), DEFAULT_LIMIT),
    name: searchParams.get('name') ?? '',
    email: searchParams.get('email') ?? '',
    edit: searchParams.get('edit') ?? undefined,
    view: searchParams.get('view') ?? undefined,
  }

  const update = useCallback(
    (mut: Partial<MembersUrlState>) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          const apply = (
            key: keyof MembersUrlState,
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
          if ('email' in mut) apply('email', mut.email, () => false)
          if ('edit' in mut) apply('edit', mut.edit, () => false)
          if ('view' in mut) apply('view', mut.view, () => false)
          return next
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )

  // setter 一律包 useCallback：給呼叫端的 useEffect deps 用，避免被迫 disable exhaustive-deps
  const setPage = useCallback((page: number) => update({ page }), [update])
  const setLimit = useCallback(
    (limit: number) => update({ limit, page: DEFAULT_PAGE }),
    [update],
  )
  const setSearch = useCallback(
    (name: string, email: string) =>
      update({ name, email, page: DEFAULT_PAGE }),
    [update],
  )
  // edit / view 互斥：開一個就關掉另一個，避免 dialog 疊在一起
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
    openEdit,
    closeEdit,
    openView,
    closeView,
  }
}
