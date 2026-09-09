import { z } from 'zod';

export const frontResetPasswordSchema = z.object({
  token: z.string().min(1, 'Token 不可為空'),
  newPassword: z.string().min(1, '新密碼不可為空'),
});

export type FrontResetPasswordRequest = z.infer<
  typeof frontResetPasswordSchema
>;
