import { useApiQuery } from '@/api/client'

/**
 * 角色下拉選項，給 form 的 Select 用。staleTime 10 分鐘避免每次開 dialog 都打
 */
export const useRoleOptionsQuery = () => {
  return useApiQuery('GET', '/members/role/options', undefined, {
    staleTime: 10 * 60 * 1000,
  })
}
