import { z } from 'zod';

export const addIpBlacklistSchema = z.object({
  ip: z.string().min(1, 'IP 不可為空'),
  reason: z.string().optional(),
});

export type AddIpBlacklistRequest = z.infer<typeof addIpBlacklistSchema>;
