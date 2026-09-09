import { z } from 'zod';

/** 重發驗證信與忘記密碼共用：兩者都只收一個 email */
export const frontEmailOnlySchema = z.object({
  email: z.string().email('請輸入有效的電子郵件'),
});

export type FrontEmailOnlyRequest = z.infer<typeof frontEmailOnlySchema>;
