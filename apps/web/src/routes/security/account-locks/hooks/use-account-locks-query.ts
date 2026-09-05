import type { paths } from '@app/api-client';

import { useApiQuery } from '@/api/client';
import type { LockStatusFilter } from './use-account-locks-url-state';

type AccountLocksQueryParams = {
  page?: number;
  limit?: number;
  search?: string;
  status: LockStatusFilter;
};

type ApiQuery = NonNullable<
  paths['/security/locks']['get']['parameters']['query']
>;

export const useAccountLocksQuery = (params: AccountLocksQueryParams) => {
  const query: ApiQuery = { status: params.status };
  if (params.page) query.page = params.page;
  if (params.limit) query.limit = params.limit;
  if (params.search) query.search = params.search;

  return useApiQuery('GET', '/security/locks', {
    params: { query },
  });
};
