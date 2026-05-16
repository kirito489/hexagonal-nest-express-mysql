import { z } from 'zod';

export const listMembersQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
  name: z.string().trim().optional(),
  email: z.string().trim().optional(),
});

export type ListMembersQuery = z.infer<typeof listMembersQuerySchema>;
