import { z } from 'zod';

export const listRolesQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
  name: z.string().trim().optional(),
});

export type ListRolesQuery = z.infer<typeof listRolesQuerySchema>;
