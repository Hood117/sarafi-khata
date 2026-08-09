function buildListHref(
  pathname: string,
  params: Record<string, string | undefined>,
  page?: number,
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    const trimmed = value?.trim();
    if (trimmed) {
      search.set(key, trimmed);
    }
  }
  if (page != null && page > 1) {
    search.set("page", String(page));
  }
  const query = search.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export { buildListHref };
