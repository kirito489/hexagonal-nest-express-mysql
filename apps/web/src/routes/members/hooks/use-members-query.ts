import { useApiQuery } from '@/api/client'

type MembersQueryParams = {
  page?: number
  limit?: number
  name?: string
  email?: string
}

/**
 * 取會員列表。空字串的搜尋參數要剝掉，否則後端會當「找空字串」處理
 */
export const useMembersQuery = (params: MembersQueryParams) => {
  const query: MembersQueryParams = {}
  if (params.page) query.page = params.page
  if (params.limit) query.limit = params.limit
  if (params.name) query.name = params.name
  if (params.email) query.email = params.email

  return useApiQuery('GET', '/members', { params: { query } })
}
