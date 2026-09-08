// Shared page/limit parsing for list endpoints, so every paginated route
// clamps to the same sane bounds instead of trusting the client's numbers.
export const parsePagination = (query, { defaultLimit = 20, maxLimit = 50 } = {}) => {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || defaultLimit, 1), maxLimit);
  const skip = (page - 1) * limit;
  return { page, limit, skip };
};

export const buildPageMeta = (page, limit, total) => ({
  page,
  limit,
  total,
  totalPages: Math.max(Math.ceil(total / limit), 1),
});
