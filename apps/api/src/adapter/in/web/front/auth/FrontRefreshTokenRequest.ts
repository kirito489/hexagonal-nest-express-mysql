import { z } from 'zod';

export const frontRefreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh Token 必填'),
});

export type FrontRefreshTokenRequest = z.infer<typeof frontRefreshTokenSchema>;
