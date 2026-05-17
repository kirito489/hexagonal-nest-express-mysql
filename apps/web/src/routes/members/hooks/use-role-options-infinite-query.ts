import { useInfiniteQuery } from '@tanstack/react-query'
import { unwrapEnvelope } from '@app/api-client'

import { apiClient } from '@/api/client'

type RoleOptionsPage = {
  list?: Array<{ id?: string; name?: string; isDefault?: boolean }>
  meta?: {
    page?: number
    limit?: number
    total?: number
    totalPages?: number
  }
}

const PAGE_LIMIT = 20
const STALE_TIME = 10 * 60 * 1000

/**
 * 會員 dialog 角色 Combobox 的資料來源。每次 fetchNextPage 拉下一頁 20 筆，
 * search 寫入 queryKey 後 TanStack Query 自動 reset 重抓。
 *
 * 用 `apiClient.GET` 拉資料時要手動 `unwrapEnvelope` 把 { success, data, timestamp }
 * 外殼剝開（useApiQuery 內部會做這步，但 useInfiniteQuery 不走那條路徑）
 */
export const useRoleOptionsInfiniteQuery = (search: string) => {
  return useInfiniteQuery<RoleOptionsPage>({
    queryKey: ['GET', '/members/role/options', search],
    initialPageParam: 1,
    staleTime: STALE_TIME,
    queryFn: async ({ pageParam }) => {
      const { data, error } = await apiClient.GET('/members/role/options', {
        params: {
          query: {
            page: pageParam as number,
            limit: PAGE_LIMIT,
            ...(search ? { search } : {}),
          },
        },
      })
      if (error || !data) throw new Error('載入角色清單失敗')
      return unwrapEnvelope(data) as RoleOptionsPage
    },
    getNextPageParam: (lastPage) => {
      const meta = lastPage?.meta
      if (!meta) return undefined
      const next = (meta.page ?? 1) + 1
      return next <= (meta.totalPages ?? 1) ? next : undefined
    },
  })
}
