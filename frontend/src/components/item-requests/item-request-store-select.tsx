"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ItemRequestStoreSummary } from "@printing-stationery/shared";
import { fetchEligibleItemRequestSourceStores } from "@/lib/api/item-requests";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { storeOptionLabel } from "./item-request-labels";
import {
  ELIGIBLE_SOURCE_STORE_PAGE_SIZE,
  ELIGIBLE_SOURCE_STORE_SEARCH_DEBOUNCE_MS,
  eligibleSourceStoreSearchHasMore,
  mergeEligibleSourceStorePages,
} from "./item-request-store-search";

export function ItemRequestStoreSelect(props: {
  value: string;
  selectedStore?: ItemRequestStoreSummary | null;
  excludeStoreId?: string;
  disabled?: boolean;
  placeholder?: string;
  onChange: (storeId: string, store: ItemRequestStoreSummary | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ItemRequestStoreSummary[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const requestSeq = useRef(0);

  const loadStores = useCallback(
    async (search: string, nextPage: number) => {
      const seq = nextPage <= 1 ? requestSeq.current + 1 : requestSeq.current;
      requestSeq.current = seq;
      setLoading(true);
      const result = await fetchEligibleItemRequestSourceStores({
        page: nextPage,
        pageSize: ELIGIBLE_SOURCE_STORE_PAGE_SIZE,
        search: search.trim() || undefined,
        excludeStoreId: props.excludeStoreId || undefined,
      });
      if (seq !== requestSeq.current) {
        return;
      }
      setLoading(false);
      if (!result.ok) {
        if (nextPage <= 1) {
          setResults([]);
          setHasMore(false);
        }
        return;
      }
      setPage(result.data.page);
      setHasMore(
        eligibleSourceStoreSearchHasMore({
          page: result.data.page,
          totalPages: result.data.totalPages,
        }),
      );
      setResults((current) =>
        mergeEligibleSourceStorePages({
          current,
          incoming: result.data.items,
          page: result.data.page,
        }),
      );
    },
    [props.excludeStoreId],
  );

  useEffect(() => {
    const handle = window.setTimeout(() => {
      void loadStores(query, 1);
    }, ELIGIBLE_SOURCE_STORE_SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [loadStores, query]);

  const options = useMemo(() => {
    const list = [...results];
    if (
      props.selectedStore &&
      !list.some((store) => store.id === props.selectedStore?.id)
    ) {
      list.unshift(props.selectedStore);
    }
    return list;
  }, [props.selectedStore, results]);

  return (
    <SearchableSelect
      value={props.value}
      disabled={props.disabled}
      placeholder={props.placeholder ?? "Select Request From Store"}
      searchPlaceholder="Search stores…"
      emptyMessage="No matching stores found"
      filterLocally={false}
      loading={loading}
      hasMore={hasMore}
      options={options.map((store) => ({
        value: store.id,
        label: storeOptionLabel(store),
      }))}
      onQueryChange={setQuery}
      onLoadMore={() => {
        if (loading || !hasMore) {
          return;
        }
        void loadStores(query, page + 1);
      }}
      onChange={(nextValue) => {
        if (!nextValue) {
          props.onChange("", null);
          return;
        }
        const selected =
          options.find((store) => store.id === nextValue) ?? null;
        props.onChange(nextValue, selected);
      }}
    />
  );
}
