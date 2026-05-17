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
} => {
  const [searchParams, setSearchParams] = useSearchParams()

  const state: MembersUrlState = {
    page: parseInt(searchParams.get('page'), DEFAULT_PAGE),
    limit: parseInt(searchParams.get('limit'), DEFAULT_LIMIT),
    name: searchParams.get('name') ?? '',
    email: searchParams.get('email') ?? '',
    edit: searchParams.get('edit') ?? undefined,
  }

  /**
   * 寫入 query string 時保留現有其他參數；空值 / 預設值會被剝掉讓 URL 乾淨
   */
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
          return next
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )

  return {
    ...state,
    setPage: (page) => update({ page }),
    setLimit: (limit) => update({ limit, page: DEFAULT_PAGE }),
    setSearch: (name, email) => update({ name, email, page: DEFAULT_PAGE }),
    openEdit: (id) => update({ edit: id }),
    closeEdit: () => update({ edit: undefined }),
  }
}
