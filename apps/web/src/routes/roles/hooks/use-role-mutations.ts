import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { useApiMutation } from '@/api/client'

/**
 * Create / Update / Delete 三個 mutation 集中管理。
 * - onSuccess 統一 invalidate `['GET', '/roles']` 讓列表重抓
 * - 新增 / 編輯後另外 invalidate `['GET', '/members/role/options']`，
 *   讓會員頁角色 select 反映最新角色
 * - onError 用 sonner 顯示後端回的 message + invalidate（讓 optimistic 變動回到真實狀態）
 *
 * 注意：列上 Switch 觸發的 status 切換也走 `update`，body 只送 `{ status }`。
 * toast 文案統一用「角色已更新 / 更新失敗」，與 form 編輯共用。
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
      void invalidateList()
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

  return { create, update, remove }
}
