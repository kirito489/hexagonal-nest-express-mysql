import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { useApiMutation } from '@/api/client'

/**
 * Create / Update / Delete / Toggle status 四個 mutation 集中管理。
 * - onSuccess 統一 invalidate `['GET', '/roles']` 讓列表重抓
 * - 新增 / 編輯後另外 invalidate `['GET', '/members/role/options']`，
 *   讓會員頁角色 select 反映最新角色
 * - onError 用 sonner 顯示後端回的 message
 */
export const useRoleMutations = () => {
  const queryClient = useQueryClient()

  const invalidateList = () =>
    queryClient.invalidateQueries({ queryKey: ['GET', '/roles'] })

  const invalidateRoleOptions = () =>
    queryClient.invalidateQueries({
      queryKey: ['GET', '/members/role/options'],
    })

  const create = useApiMutation('POST', '/roles', {
    onSuccess: () => {
      toast.success('角色已新增')
      void invalidateList()
      void invalidateRoleOptions()
    },
    onError: (err) => {
      toast.error(err.message || '新增失敗')
    },
  })

  const update = useApiMutation('PATCH', '/roles/{id}', {
    onSuccess: () => {
      toast.success('角色已更新')
      void invalidateList()
      void invalidateRoleOptions()
    },
    onError: (err) => {
      toast.error(err.message || '更新失敗')
    },
  })

  const remove = useApiMutation('DELETE', '/roles/{id}', {
    onSuccess: () => {
      toast.success('角色已刪除')
      void invalidateList()
      void invalidateRoleOptions()
    },
    onError: (err) => {
      toast.error(err.message || '刪除失敗')
    },
  })

  /**
   * 列上 Switch 觸發的 status 切換：body 只送 { status }，不影響 name / permissions。
   * 失敗訊息與 update 區隔，方便 toast 文案精準
   */
  const toggleStatus = useApiMutation('PATCH', '/roles/{id}', {
    onSuccess: () => {
      toast.success('角色狀態已更新')
      void invalidateList()
      void invalidateRoleOptions()
    },
    onError: (err) => {
      toast.error(err.message || '狀態切換失敗')
      void invalidateList()
    },
  })

  return { create, update, remove, toggleStatus }
}
