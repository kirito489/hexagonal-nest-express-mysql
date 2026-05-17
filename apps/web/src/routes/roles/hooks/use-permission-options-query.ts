import { useApiQuery } from '@/api/client'

/**
 * 取得可指派的 permission 清單，給 RoleFormDialog 的 PermissionsField 用
 * 變化頻率極低，staleTime 設 30 分鐘
 */
export const usePermissionOptionsQuery = () => {
  return useApiQuery('GET', '/roles/permissions', undefined, {
    staleTime: 30 * 60 * 1000,
  })
}
