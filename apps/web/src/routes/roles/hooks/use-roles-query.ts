import { useApiQuery } from '@/api/client'

type RolesQueryParams = {
  page?: number
  limit?: number
  name?: string
}

/**
 * 取角色列表。空字串的 name 要剝掉，否則後端會當「找空字串」處理
 */
export const useRolesQuery = (params: RolesQueryParams) => {
  const query: RolesQueryParams = {}
  if (params.page) query.page = params.page
  if (params.limit) query.limit = params.limit
  if (params.name) query.name = params.name

  return useApiQuery('GET', '/roles', { params: { query } })
}
