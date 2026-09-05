import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { useApiMutation } from '@/api/client';

/**
 * 解鎖沿用既有的 `POST /security/unlock-account`（以 email）。
 *
 * **刻意不新增 `DELETE /locks/:id`**：兩支做同一件事的端點會各自演化
 * （一支加了稽核、另一支沒有），而呼叫端要選一個，選錯了不會有人發現。
 */
export const useAccountLocksMutations = () => {
  const queryClient = useQueryClient();

  const unlock = useApiMutation('POST', '/security/unlock-account', {
    onSuccess: () => {
      toast.success('帳號已解鎖');
      void queryClient.invalidateQueries({
        queryKey: ['GET', '/security/locks'],
      });
    },
    onError: (err) => {
      toast.error(err.message || '解鎖失敗');
    },
  });

  return { unlock };
};
