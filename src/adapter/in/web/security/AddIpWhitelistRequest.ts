import { z } from 'zod';

export const addIpWhitelistSchema = z.object({
  ip: z.string().min(1, 'IP 不可為空'),
  description: z.string().optional(),
});

export type AddIpWhitelistRequest = z.infer<typeof addIpWhitelistSchema>;
