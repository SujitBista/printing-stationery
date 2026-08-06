import type { ApiResult as ItemGroupApiResult } from "@/lib/api/item-groups";
import type { ApiResult as UnitApiResult } from "@/lib/api/units";

type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status?: number };

type PaginatedOptionsResponse<T> = {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
};

type PaginatedOptionsResult<T> =
  | UnitApiResult<PaginatedOptionsResponse<T>>
  | ItemGroupApiResult<PaginatedOptionsResponse<T>>;

type FetchPaginatedOptionsPage<T, TStatus extends string> = (query: {
  page: number;
  pageSize: number;
  status: TStatus;
}) => Promise<PaginatedOptionsResult<T>>;

const OPTIONS_PAGE_SIZE = 100;
const MAX_PAGINATION_REQUESTS = 1000;

function getLastPage(response: PaginatedOptionsResponse<unknown>): number {
  if (response.totalItems === 0) {
    return 0;
  }

  const totalPagesFromItems = Math.ceil(response.totalItems / response.pageSize);
  const lastPage = Math.min(response.totalPages, totalPagesFromItems);

  return Number.isInteger(lastPage) && lastPage >= 0 ? lastPage : 0;
}

export async function loadAllPaginatedOptions<T, TStatus extends string>(
  fetchPage: FetchPaginatedOptionsPage<T, TStatus>,
  status: TStatus,
): Promise<ApiResult<T[]>> {
  const allItems: T[] = [];
  const visitedPages = new Set<number>();

  for (
    let page = 1;
    page <= MAX_PAGINATION_REQUESTS;
    page += 1
  ) {
    if (visitedPages.has(page)) {
      break;
    }

    visitedPages.add(page);

    const result = await fetchPage({
      page,
      pageSize: OPTIONS_PAGE_SIZE,
      status,
    });

    if (!result.ok) {
      return result;
    }

    allItems.push(...result.data.items);

    const lastPage = getLastPage(result.data);
    if (lastPage === 0 || page >= lastPage) {
      return { ok: true, data: allItems };
    }
  }

  return {
    ok: false,
    error: "Failed to load all pages for the requested options",
  };
}
