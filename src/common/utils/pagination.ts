export type PaginationInput = {
  limit: number;
  page: number;
};

export type PaginatedResult<T> = {
  items: T[];
  limit: number;
  page: number;
  total: number;
  totalPages: number;
};

export const buildPaginatedResult = <T>(
  items: T[],
  total: number,
  pagination: PaginationInput
): PaginatedResult<T> => ({
  items,
  limit: pagination.limit,
  page: pagination.page,
  total,
  totalPages: Math.max(1, Math.ceil(total / pagination.limit))
});
