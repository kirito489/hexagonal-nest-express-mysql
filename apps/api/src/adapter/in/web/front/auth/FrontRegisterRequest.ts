import { z } from 'zod';

export const frontRegisterSchema = z.object({
  email: z
    .string()
    .email('請輸入有效的電子郵件')
    .max(255, 'Email 最多 255 字元'),
  // 長度與複雜度由 PasswordPolicyService 依設定檢查，這裡只擋空值
  password: z.string().min(1, '密碼不可為空'),
  displayName: z
    .string()
    .trim()
    .min(1, '暱稱為必填')
    .max(50, '暱稱最多 50 字元'),
});

export type FrontRegisterRequest = z.infer<typeof frontRegisterSchema>;
