import { z } from 'zod';

/**
 * 帳號鎖定列表 query schema：page / limit / search（email contains）/ status。
 *
 * `status` 預設 `locked`：打開這一頁的人問的是「現在有誰被鎖著」。
 * 保留 `expired` 與 `all` 的理由是系統沒有鎖定歷史表——`lockedAt` 要到下次登入
 * 或解鎖時才被清除，在那之前「這個人今天被鎖過」只能從這裡看到。
 */
export const listAccountLocksQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
  search: z.string().trim().optional(),
  status: z.enum(['locked', 'expired', 'all']).default('locked'),
});

export type ListAccountLocksQuery = z.infer<typeof listAccountLocksQuerySchema>;
