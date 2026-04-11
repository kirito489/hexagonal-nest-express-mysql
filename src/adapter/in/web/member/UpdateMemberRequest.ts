import { z } from 'zod';

export const updateMemberSchema = z.object({
  email: z
    .string()
    .trim()
    .email('請輸入有效的 Email')
    .max(255, 'Email 最多 255 字元'),
  member: z.string().trim().min(1, '名稱為必填').max(100, '名稱最多 100 字元'),
  password: z
    .union([
      z.string().min(8, '密碼至少 8 字元').max(30, '密碼最多 30 字元'),
      z.literal('').transform(() => undefined),
    ])
    .optional(),
  roleId: z.string().uuid('請指定有效的角色 ID'),
  status: z.boolean(),
});

export type UpdateMemberRequest = z.infer<typeof updateMemberSchema>;
