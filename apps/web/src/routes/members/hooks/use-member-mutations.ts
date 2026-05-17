import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { useApiMutation } from '@/api/client'

/**
 * Create / Update / Delete 三個 mutation 集中管理。
 * onSuccess 統一 invalidate `['GET', '/members']` prefix 讓 list 重抓；
 * onError 統一 toast 紅字回饋（hook factory 取的 Error.message 已含後端 message）
 */
export const useMemberMutations = () => {
  const queryClient = useQueryClient()
  const invalidateList = () =>
    queryClient.invalidateQueries({ queryKey: ['GET', '/members'] })

  const create = useApiMutation('POST', '/members', {
    onSuccess: () => {
      toast.success('會員已新增')
      void invalidateList()
    },
    onError: (err) => {
      toast.error(err.message || '新增失敗')
    },
  })

  const update = useApiMutation('PATCH', '/members/{id}', {
    onSuccess: () => {
      toast.success('會員已更新')
      void invalidateList()
    },
    onError: (err) => {
      toast.error(err.message || '更新失敗')
    },
  })

  const remove = useApiMutation('DELETE', '/members/{id}', {
    onSuccess: () => {
      toast.success('會員已刪除')
      void invalidateList()
    },
    onError: (err) => {
      toast.error(err.message || '刪除失敗')
    },
  })

  return { create, update, remove }
}
