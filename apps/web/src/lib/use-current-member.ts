import { useApiQuery } from '@/api/client'

/**
 * 取得目前登入的會員資料（含 permissions、sub、roleCode 等）。
 * 用 staleTime 5 分鐘避免每次 mount 都打 /me；後端有 MemberContext 快取，亦不會壓力。
 */
export const useCurrentMember = () => {
  const query = useApiQuery('GET', '/me', undefined, {
    staleTime: 5 * 60 * 1000,
  })

  return {
    member: query.data,
    permissions: query.data?.permissionCodes ?? [],
    sub: query.data?.id,
    isLoading: query.isLoading,
  }
}
