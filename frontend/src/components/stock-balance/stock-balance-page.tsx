"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import type {
  StockBalance,
  StockBalanceStoreOption,
  StockBalanceUnitSummary,
} from "@printing-stationery/shared";
import { fetchItemGroups } from "@/lib/api/item-groups";
import { fetchStockBalances } from "@/lib/api/stock-balances";
import { useAuth } from "@/lib/auth/auth-context";
import { StockLedgerDialog } from "./stock-ledger-dialog";
import {
  balanceRowKey,
  emptyBalanceMessage,
  formatMovementTime,
  formatQuantityDisplay,
  quantityClassName,
  shouldShowNumericSummary,
  STOCK_CATEGORY_TOOLTIPS,
} from "./stock-balance-labels";

const PAGE_SIZE = 20;

function uniqueBranches(stores: StockBalanceStoreOption[]) {
  const byId = new Map<
    string,
    { id: string; branchCode: string; branchName: string }
  >();
  for (const store of stores) {
    if (!byId.has(store.branchId)) {
      byId.set(store.branchId, {
        id: store.branchId,
        branchCode: store.branchCode,
        branchName: store.branchName,
      });
    }
  }
  return [...byId.values()].sort((left, right) =>
    left.branchName.localeCompare(right.branchName),
  );
}

export function StockBalancePage() {
  const { canAccessStockBalance } = useAuth();
  const [rows, setRows] = useState<StockBalance[]>([]);
  const [summaries, setSummaries] = useState<StockBalanceUnitSummary[]>([]);
  const [visibleStores, setVisibleStores] = useState<StockBalanceStoreOption[]>(
    [],
  );
  const [canSelectStore, setCanSelectStore] = useState(true);
  const [lockedStoreId, setLockedStoreId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [totalItems, setTotalItems] = useState(0);
  const [storeId, setStoreId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [itemGroupId, setItemGroupId] = useState("");
  const [itemGroups, setItemGroups] = useState<
    Array<{ id: string; groupName: string }>
  >([]);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [includeZeroBalance, setIncludeZeroBalance] = useState(false);
  const [emptyReason, setEmptyReason] = useState<
    "NONE" | "NO_MOVEMENTS" | "NO_MATCHES"
  >("NONE");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isUnavailable, setIsUnavailable] = useState(false);
  const [ledgerRow, setLedgerRow] = useState<StockBalance | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    const handle = window.setTimeout(() => {
      startTransition(() => {
        setPage(1);
        setSearch(searchInput.trim());
      });
    }, 300);
    return () => window.clearTimeout(handle);
  }, [searchInput]);

  const loadBalances = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    setIsUnavailable(false);
    const result = await fetchStockBalances({
      page,
      pageSize: PAGE_SIZE,
      storeId: storeId || undefined,
      branchId: branchId || undefined,
      itemGroupId: itemGroupId || undefined,
      search: search || undefined,
      includeZeroBalance,
    });
    if (!result.ok) {
      setRows([]);
      setSummaries([]);
      setVisibleStores([]);
      setTotalItems(0);
      setTotalPages(0);
      setLoadError(result.error);
      setIsUnavailable(result.status === 503);
      setLoading(false);
      return;
    }
    setRows(result.data.data);
    setSummaries(result.data.summaryByUnit);
    setVisibleStores(result.data.visibleStores);
    setCanSelectStore(result.data.canSelectStore);
    setLockedStoreId(result.data.lockedStoreId);
    setTotalItems(result.data.pagination.totalItems);
    setTotalPages(result.data.pagination.totalPages);
    setEmptyReason(result.data.emptyReason);
    if (result.data.lockedStoreId && !storeId) {
      setStoreId(result.data.lockedStoreId);
    }
    setLoading(false);
  }, [branchId, includeZeroBalance, itemGroupId, page, search, storeId]);

  useEffect(() => {
    if (!canAccessStockBalance) {
      setLoading(false);
      return;
    }
    void loadBalances();
  }, [canAccessStockBalance, loadBalances]);

  useEffect(() => {
    if (!canAccessStockBalance) {
      return;
    }
    void fetchItemGroups({ page: 1, pageSize: 100, status: "ACTIVE" }).then(
      (result) => {
        if (result.ok) {
          setItemGroups(
            result.data.items.map((group) => ({
              id: group.id,
              groupName: group.groupName,
            })),
          );
        }
      },
    );
  }, [canAccessStockBalance]);

  const branches = useMemo(() => uniqueBranches(visibleStores), [visibleStores]);
  const storesForBranch = useMemo(
    () =>
      branchId
        ? visibleStores.filter((store) => store.branchId === branchId)
        : visibleStores,
    [branchId, visibleStores],
  );
  const showNumericSummary = shouldShowNumericSummary(summaries);
  const hasFilters = Boolean(search || itemGroupId || includeZeroBalance);

  function clearFilters() {
    setSearchInput("");
    setSearch("");
    setItemGroupId("");
    setIncludeZeroBalance(false);
    setPage(1);
    if (canSelectStore) {
      setStoreId("");
      setBranchId("");
    }
  }

  if (!canAccessStockBalance) {
    return (
      <section className="w-full max-w-7xl">
        <div className="border-l-2 border-danger pl-4">
          <p className="font-medium text-danger">Access denied</p>
          <p className="mt-1 text-sm text-ink-muted">
            You do not have permission to view stock balances.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="w-full max-w-[90rem]">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-secondary">
          Inventory
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-accent sm:text-3xl">
          Stock Balance
        </h1>
        <p className="mt-2 max-w-3xl text-ink-muted">
          Current quantities are calculated from posted stock-ledger movements.
          Available, in-transit, damaged, and discrepancy stock are shown
          separately and cannot be edited here.
        </p>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {showNumericSummary && summaries[0] ? (
          <>
            <SummaryCard
              label="Available Quantity"
              value={`${formatQuantityDisplay(summaries[0].availableQuantity)} ${summaries[0].unitName}`}
              tooltip={STOCK_CATEGORY_TOOLTIPS.AVAILABLE}
            />
            <SummaryCard
              label="In-Transit Quantity"
              value={`${formatQuantityDisplay(summaries[0].inTransitQuantity)} ${summaries[0].unitName}`}
              tooltip={STOCK_CATEGORY_TOOLTIPS.IN_TRANSIT}
            />
            <SummaryCard
              label="Damaged Quantity"
              value={`${formatQuantityDisplay(summaries[0].damagedQuantity)} ${summaries[0].unitName}`}
              tooltip={STOCK_CATEGORY_TOOLTIPS.DAMAGED}
            />
            <SummaryCard
              label="Discrepancy Quantity"
              value={`${formatQuantityDisplay(summaries[0].discrepancyQuantity)} ${summaries[0].unitName}`}
              tooltip={STOCK_CATEGORY_TOOLTIPS.DISCREPANCY}
            />
          </>
        ) : (
          <>
            <SummaryCard
              label="Matching item rows"
              value={String(totalItems)}
              tooltip="Totals are not combined across different units such as PCS, REAM, BOX, or KG."
            />
            <SummaryCard
              label="Units in view"
              value={String(summaries.length)}
              tooltip="Each unit is summarised separately so mixed units are not added together."
            />
            {summaries.slice(0, 2).map((summary) => (
              <SummaryCard
                key={summary.unitId}
                label={`${summary.unitName} rows`}
                value={`${summary.rowCount} · Avail ${formatQuantityDisplay(summary.availableQuantity)}`}
                tooltip={`Available, in-transit, damaged, and discrepancy quantities for ${summary.unitName} only.`}
              />
            ))}
          </>
        )}
      </div>

      <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {canSelectStore && branches.length > 1 ? (
          <label className="flex min-w-0 flex-col gap-1 text-sm">
            <span className="font-medium text-ink">Branch</span>
            <select
              value={branchId}
              onChange={(event) => {
                setBranchId(event.target.value);
                setStoreId("");
                setPage(1);
              }}
              className="rounded-lg border border-border bg-paper-elevated px-3 py-2 outline-none transition focus:border-accent-mid focus:ring-2 focus:ring-accent/20"
            >
              <option value="">All authorized branches</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.branchName}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {canSelectStore ? (
          <label className="flex min-w-0 flex-col gap-1 text-sm">
            <span className="font-medium text-ink">Store</span>
            <select
              value={storeId}
              onChange={(event) => {
                setStoreId(event.target.value);
                setPage(1);
              }}
              className="rounded-lg border border-border bg-paper-elevated px-3 py-2 outline-none transition focus:border-accent-mid focus:ring-2 focus:ring-accent/20"
            >
              <option value="">All authorized stores</option>
              {storesForBranch.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.storeName}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label className="flex min-w-0 flex-col gap-1 text-sm">
            <span className="font-medium text-ink">Store</span>
            <input
              value={
                visibleStores.find((store) => store.id === (storeId || lockedStoreId))
                  ?.storeName ?? "Assigned store"
              }
              readOnly
              className="rounded-lg border border-border bg-paper px-3 py-2 text-ink-muted"
            />
          </label>
        )}
        <label className="flex min-w-0 flex-col gap-1 text-sm">
          <span className="font-medium text-ink">Item group</span>
          <select
            value={itemGroupId}
            onChange={(event) => {
              setItemGroupId(event.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-border bg-paper-elevated px-3 py-2 outline-none transition focus:border-accent-mid focus:ring-2 focus:ring-accent/20"
          >
            <option value="">All item groups</option>
            {itemGroups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.groupName}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-sm">
          <span className="font-medium text-ink">Item search</span>
          <input
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Item code or name"
            className="rounded-lg border border-border bg-paper-elevated px-3 py-2 outline-none transition focus:border-accent-mid focus:ring-2 focus:ring-accent/20"
          />
        </label>
        <div className="flex flex-col justify-end gap-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={includeZeroBalance}
              onChange={(event) => {
                setIncludeZeroBalance(event.target.checked);
                setPage(1);
              }}
            />
            <span>Show zero balances</span>
          </label>
          <button
            type="button"
            onClick={clearFilters}
            className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-paper"
          >
            Clear filters
          </button>
        </div>
      </div>

      <div className="mt-6">
        {loading ? (
          <p className="text-sm text-ink-muted">Loading stock balances…</p>
        ) : isUnavailable ? (
          <div className="border-l-2 border-warning pl-4">
            <p className="font-medium text-warning">Database unavailable</p>
            <p className="mt-1 text-sm text-ink-muted">{loadError}</p>
          </div>
        ) : loadError ? (
          <div className="border-l-2 border-danger pl-4">
            <p className="font-medium text-danger">Unable to load stock balances</p>
            <p className="mt-1 text-sm text-ink-muted">{loadError}</p>
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-accent-soft/50 px-4 py-10 text-center">
            <p className="font-medium text-ink">
              {emptyBalanceMessage({
                emptyReason,
                storeSelected: Boolean(storeId || lockedStoreId),
                hasFilters,
              })}
            </p>
          </div>
        ) : (
          <>
            <div className="ps-table-shell">
              <table className="min-w-[88rem] w-full text-left text-sm">
                <thead className="border-b border-border bg-accent-soft text-xs uppercase tracking-wider text-ink-muted">
                  <tr>
                    <th className="whitespace-nowrap px-3 py-2 font-semibold">
                      Store
                    </th>
                    <th className="whitespace-nowrap px-3 py-2 font-semibold">
                      Branch
                    </th>
                    <th className="whitespace-nowrap px-3 py-2 font-semibold">
                      Item Code
                    </th>
                    <th className="whitespace-nowrap px-3 py-2 font-semibold">
                      Item Name
                    </th>
                    <th className="whitespace-nowrap px-3 py-2 font-semibold">
                      Unit
                    </th>
                    <th
                      className="whitespace-nowrap px-3 py-2 font-semibold text-right"
                      title={STOCK_CATEGORY_TOOLTIPS.AVAILABLE}
                    >
                      Available Qty
                    </th>
                    <th
                      className="whitespace-nowrap px-3 py-2 font-semibold text-right"
                      title={STOCK_CATEGORY_TOOLTIPS.IN_TRANSIT}
                    >
                      In-Transit Qty
                    </th>
                    <th
                      className="whitespace-nowrap px-3 py-2 font-semibold text-right"
                      title={STOCK_CATEGORY_TOOLTIPS.DAMAGED}
                    >
                      Damaged Qty
                    </th>
                    <th
                      className="whitespace-nowrap px-3 py-2 font-semibold text-right"
                      title={STOCK_CATEGORY_TOOLTIPS.DISCREPANCY}
                    >
                      Discrepancy Qty
                    </th>
                    <th className="whitespace-nowrap px-3 py-2 font-semibold">
                      Last Movement
                    </th>
                    <th className="whitespace-nowrap px-3 py-2 font-semibold">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={balanceRowKey(row)}
                      className="border-b border-border last:border-b-0 transition-colors hover:bg-accent-soft/70"
                    >
                      <td className="whitespace-nowrap px-3 py-3">
                        {row.storeName}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3">
                        {row.branchName}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 font-medium">
                        {row.itemCode}
                      </td>
                      <td className="px-3 py-3">{row.itemName}</td>
                      <td className="whitespace-nowrap px-3 py-3">
                        {row.unitName}
                      </td>
                      <td
                        className={`whitespace-nowrap px-3 py-3 text-right ${quantityClassName(row.availableQuantity, "available")}`}
                        title={STOCK_CATEGORY_TOOLTIPS.AVAILABLE}
                      >
                        {formatQuantityDisplay(row.availableQuantity)}
                      </td>
                      <td
                        className="whitespace-nowrap px-3 py-3 text-right"
                        title={STOCK_CATEGORY_TOOLTIPS.IN_TRANSIT}
                      >
                        {formatQuantityDisplay(row.inTransitQuantity)}
                      </td>
                      <td
                        className={`whitespace-nowrap px-3 py-3 text-right ${quantityClassName(row.damagedQuantity, "warning")}`}
                        title={STOCK_CATEGORY_TOOLTIPS.DAMAGED}
                      >
                        {formatQuantityDisplay(row.damagedQuantity)}
                      </td>
                      <td
                        className={`whitespace-nowrap px-3 py-3 text-right ${quantityClassName(row.discrepancyQuantity, "warning")}`}
                        title={STOCK_CATEGORY_TOOLTIPS.DISCREPANCY}
                      >
                        {formatQuantityDisplay(row.discrepancyQuantity)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3">
                        {formatMovementTime(row.lastMovementAt)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3">
                        <button
                          type="button"
                          onClick={() => setLedgerRow(row)}
                          className="font-medium text-accent hover:text-accent-dark hover:underline"
                        >
                          View Ledger
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-ink-muted">
                Showing page {page}
                {totalPages > 0 ? ` of ${totalPages}` : ""} · {totalItems}{" "}
                {totalItems === 1 ? "item" : "items"}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={page <= 1}
                  className="rounded-md border border-border px-3 py-1.5 text-sm disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setPage((current) =>
                      totalPages === 0
                        ? current
                        : Math.min(totalPages, current + 1),
                    )
                  }
                  disabled={totalPages === 0 || page >= totalPages}
                  className="rounded-md border border-border px-3 py-1.5 text-sm disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      <StockLedgerDialog
        open={ledgerRow !== null}
        balance={ledgerRow}
        onClose={() => setLedgerRow(null)}
      />
    </section>
  );
}

function SummaryCard({
  label,
  value,
  tooltip,
}: {
  label: string;
  value: string;
  tooltip: string;
}) {
  return (
    <div
      className="rounded-xl border border-border bg-paper-elevated px-4 py-3"
      title={tooltip}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold text-ink">{value}</p>
    </div>
  );
}
