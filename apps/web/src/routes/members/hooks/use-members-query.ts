import { useApiQuery } from '@/api/client'

type MembersQueryParams = {
  page?: number
  limit?: number
  name?: string
  email?: string
  /** URL state 用字串，呼叫端傳 'true' / 'false' / undefined；hook 內轉成 boolean */
  status?: 'true' | 'false' | undefined
}

type ApiQuery = {
  page?: number
  limit?: number
  name?: string
  email?: string
  status?: true | false
}

/**
 * 取會員列表。空字串的搜尋參數要剝掉，否則後端會當「找空字串」處理；
 * status 字串轉 boolean 對應後端 enum query
 */
export const useMembersQuery = (params: MembersQueryParams) => {
  const query: ApiQuery = {}
  if (params.page) query.page = params.page
  if (params.limit) query.limit = params.limit
  if (params.name) query.name = params.name
  if (params.email) query.email = params.email
  if (params.status === 'true') query.status = true
  if (params.status === 'false') query.status = false

  return useApiQuery('GET', '/members', { params: { query } })
}
