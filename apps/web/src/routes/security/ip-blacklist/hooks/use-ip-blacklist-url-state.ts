import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'

const DEFAULT_PAGE = 1
const DEFAULT_LIMIT = 10

export type IpBlacklistUrlState = {
  page: number
  limit: number
  search: string
  edit: string | undefined
  view: string | undefined
}

const parseInt = (v: string | null, fallback: number): number => {
  if (!v) return fallback
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

export const useIpBlacklistUrlState = (): IpBlacklistUrlState & {
  setPage: (page: number) => void
  setLimit: (limit: number) => void
  setSearch: (search: string) => void
  openEdit: (id: string) => void
  closeEdit: () => void
  openView: (id: string) => void
  closeView: () => void
} => {
  const [searchParams, setSearchParams] = useSearchParams()

  const editParam = searchParams.get('edit') ?? undefined
  const state: IpBlacklistUrlState = {
    page: parseInt(searchParams.get('page'), DEFAULT_PAGE),
    limit: parseInt(searchParams.get('limit'), DEFAULT_LIMIT),
    search: searchParams.get('search') ?? '',
    edit: editParam,
    view: editParam ? undefined : (searchParams.get('view') ?? undefined),
  }

  const update = useCallback(
    (mut: Partial<IpBlacklistUrlState>) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          const apply = (
            key: keyof IpBlacklistUrlState,
            value: string | number | undefined,
            isDefault: (v: string | number | undefined) => boolean,
          ) => {
            if (value === undefined || value === '' || isDefault(value)) {
              next.delete(key)
            } else {
              next.set(key, String(value))
            }
          }
          if ('page' in mut) apply('page', mut.page, (v) => v === DEFAULT_PAGE)
          if ('limit' in mut)
            apply('limit', mut.limit, (v) => v === DEFAULT_LIMIT)
          if ('search' in mut) apply('search', mut.search, () => false)
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
    (search: string) => update({ search, page: DEFAULT_PAGE }),
    [update],
  )
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
