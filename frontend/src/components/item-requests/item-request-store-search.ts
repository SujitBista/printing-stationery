import type { ItemRequestStoreSummary } from "@printing-stationery/shared";

/** First page size for Request From Store. Search/scroll loads further pages. */
export const ELIGIBLE_SOURCE_STORE_PAGE_SIZE = 20;
export const ELIGIBLE_SOURCE_STORE_SEARCH_DEBOUNCE_MS = 300;

export function mergeEligibleSourceStorePages(params: {
  current: ItemRequestStoreSummary[];
  incoming: ItemRequestStoreSummary[];
  page: number;
}): ItemRequestStoreSummary[] {
  if (params.page <= 1) {
    return params.incoming;
  }

  const merged = [...params.current];
  const seen = new Set(merged.map((store) => store.id));
  for (const store of params.incoming) {
    if (seen.has(store.id)) {
      continue;
    }
    seen.add(store.id);
    merged.push(store);
  }
  return merged;
}

export function eligibleSourceStoreSearchHasMore(params: {
  page: number;
  totalPages: number;
}): boolean {
  return params.totalPages > 0 && params.page < params.totalPages;
}
