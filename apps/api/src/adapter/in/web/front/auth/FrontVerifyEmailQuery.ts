import { z } from 'zod';

export const frontVerifyEmailQuerySchema = z.object({
  token: z.string().min(1, 'Token 不可為空'),
});

export type FrontVerifyEmailQuery = z.infer<typeof frontVerifyEmailQuerySchema>;
