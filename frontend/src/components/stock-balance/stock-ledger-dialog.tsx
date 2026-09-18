"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import type {
  StockBalance,
  StockLedgerCategoryFilter,
  StockLedgerEntry,
  StockLedgerResponse,
} from "@printing-stationery/shared";
import {
  actorCanAccessIncomingItems,
} from "@printing-stationery/shared";
import { fetchStockLedger } from "@/lib/api/stock-balances";
import { useAuth } from "@/lib/auth/auth-context";
import { useItemRequestNavContext } from "@/lib/item-requests/use-item-request-nav-context";
import {
  formatMovementTime,
  formatQuantityDisplay,
  ledgerSourceStoreDisplay,
  STOCK_CATEGORY_FILTER_LABELS,
  STOCK_CATEGORY_LABELS,
  STOCK_MOVEMENT_LABELS,
} from "./stock-balance-labels";

const PAGE_SIZE = 50;
const CATEGORY_FILTERS: StockLedgerCategoryFilter[] = [
  "ALL",
  "AVAILABLE",
  "IN_TRANSIT",
  "DAMAGED",
  "DISCREPANCY",
];

type StockLedgerDialogProps = {
  open: boolean;
  balance: StockBalance | null;
  onClose: () => void;
};

function canOpenSource(
  entry: StockLedgerEntry,
  permissions: {
    canAccessOpeningStock: boolean;
    canAccessPurchases: boolean;
    canAccessItemRequests: boolean;
    canAccessIncomingItems: boolean;
  },
): boolean {
  if (!entry.sourceHref) {
    return false;
  }
  switch (entry.sourceKind) {
    case "OPENING_STOCK":
    case "LEGACY_OPENING_IN_TRANSIT":
    case "LEGACY_OPENING_IN_TRANSIT_RECEIPT":
      return permissions.canAccessOpeningStock;
    case "PURCHASE":
      return permissions.canAccessPurchases;
    case "ITEM_ISSUE_IN_TRANSIT":
    case "ITEM_ISSUE_RECEIPT":
    case "ITEM_ISSUE_DISCREPANCY":
      return (
        permissions.canAccessIncomingItems || permissions.canAccessItemRequests
      );
    default:
      return permissions.canAccessItemRequests;
  }
}

function personLabel(entry: StockLedgerEntry["performedBy"]): string {
  if (entry.employee) {
    return `${entry.employee.employeeName} (${entry.employee.employeeCode})`;
  }
  return entry.username;
}

export function StockLedgerDialog({
  open,
  balance,
  onClose,
}: StockLedgerDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const { canAccessOpeningStock, canAccessPurchases, canAccessItemRequests } =
    useAuth();
  const { workflowRoles } = useItemRequestNavContext();
  const canAccessIncomingItems = actorCanAccessIncomingItems(workflowRoles);
  const [category, setCategory] = useState<StockLedgerCategoryFilter>("ALL");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<StockLedgerEntry[]>([]);
  const [context, setContext] = useState<StockLedgerResponse["context"] | null>(
    null,
  );
  const [totalPages, setTotalPages] = useState(0);
  const [totalItems, setTotalItems] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    if (open) {
      if (!dialog.open) {
        dialog.showModal();
      }
    } else if (dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    setCategory("ALL");
    setPage(1);
  }, [balance?.storeId, balance?.itemId, balance?.unitId]);

  const loadLedger = useCallback(async () => {
    if (!open || !balance) {
      return;
    }
    setLoading(true);
    setError(null);
    const result = await fetchStockLedger({
      storeId: balance.storeId,
      itemId: balance.itemId,
      unitId: balance.unitId,
      stockCategory: category,
      page,
      pageSize: PAGE_SIZE,
    });
    if (!result.ok) {
      setItems([]);
      setContext(null);
      setTotalItems(0);
      setTotalPages(0);
      setError(result.error);
      setLoading(false);
      return;
    }
    setItems(result.data.items);
    setContext(result.data.context);
    setTotalItems(result.data.totalItems);
    setTotalPages(result.data.totalPages);
    setLoading(false);
  }, [balance, category, open, page]);

  useEffect(() => {
    void loadLedger();
  }, [loadLedger]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      className="w-[min(96rem,calc(100vw-2rem))] max-h-[90vh] overflow-hidden rounded-xl border border-border bg-paper-elevated p-0 text-ink shadow-xl"
      onClose={onClose}
    >
      <div className="flex max-h-[90vh] flex-col">
        <div className="border-b border-border px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id={titleId} className="text-lg font-semibold text-accent">
                Stock Ledger
              </h2>
              <p className="mt-1 text-sm text-ink-muted">
                {context
                  ? `${context.storeName} · ${context.itemCode} ${context.itemName} · ${context.unitName}`
                  : balance
                    ? `${balance.storeName} · ${balance.itemCode} ${balance.itemName} · ${balance.unitName}`
                    : "Read-only history of posted stock movements."}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-paper"
            >
              Close
            </button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {CATEGORY_FILTERS.map((filter) => (
              <button
                key={filter}
                type="button"
                onClick={() => {
                  setCategory(filter);
                  setPage(1);
                }}
                className={`rounded-full border px-3 py-1 text-xs font-medium ${
                  category === filter
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-border text-ink-muted hover:bg-paper"
                }`}
              >
                {STOCK_CATEGORY_FILTER_LABELS[filter]}
              </button>
            ))}
          </div>
          {category === "ALL" ? (
            <p className="mt-3 text-xs text-ink-muted">
              Category Balance is the running total for that row’s stock
              category only. Available, In Transit, Damaged, and Discrepancy are
              never combined into one figure.
            </p>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
          {loading ? (
            <p className="text-sm text-ink-muted">Loading ledger…</p>
          ) : error ? (
            <p className="border-l-2 border-danger pl-3 text-sm text-danger">
              {error}
            </p>
          ) : items.length === 0 ? (
            <p className="text-sm text-ink-muted">
              No posted stock movements match this filter.
            </p>
          ) : (
            <div className="ps-table-shell">
              <table className="min-w-[88rem] w-full text-left text-sm">
                <thead className="border-b border-border bg-accent-soft text-xs uppercase tracking-wider text-ink-muted">
                  <tr>
                    <th className="whitespace-nowrap px-3 py-2 font-semibold">
                      Date / Time
                    </th>
                    <th className="whitespace-nowrap px-3 py-2 font-semibold">
                      Type
                    </th>
                    <th className="whitespace-nowrap px-3 py-2 font-semibold">
                      Category
                    </th>
                    <th className="whitespace-nowrap px-3 py-2 font-semibold text-right">
                      Qty In
                    </th>
                    <th className="whitespace-nowrap px-3 py-2 font-semibold text-right">
                      Qty Out
                    </th>
                    <th className="whitespace-nowrap px-3 py-2 font-semibold text-right">
                      Category Balance
                    </th>
                    <th className="whitespace-nowrap px-3 py-2 font-semibold">
                      Reference
                    </th>
                    <th className="whitespace-nowrap px-3 py-2 font-semibold">
                      Source Store
                    </th>
                    <th className="whitespace-nowrap px-3 py-2 font-semibold">
                      Destination Store
                    </th>
                    <th className="whitespace-nowrap px-3 py-2 font-semibold">
                      Department
                    </th>
                    <th className="whitespace-nowrap px-3 py-2 font-semibold">
                      Remarks
                    </th>
                    <th className="whitespace-nowrap px-3 py-2 font-semibold">
                      Performed By
                    </th>
                    <th className="whitespace-nowrap px-3 py-2 font-semibold">
                      Verified By
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((entry) => {
                    const hrefAllowed = canOpenSource(entry, {
                      canAccessOpeningStock,
                      canAccessPurchases,
                      canAccessItemRequests,
                      canAccessIncomingItems,
                    });
                    return (
                      <tr
                        key={entry.id}
                        className="border-b border-border last:border-b-0"
                      >
                        <td className="whitespace-nowrap px-3 py-3">
                          {formatMovementTime(entry.transactionDate)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3">
                          {STOCK_MOVEMENT_LABELS[entry.movementType]}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3">
                          {STOCK_CATEGORY_LABELS[entry.stockCategory]}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-right">
                          {formatQuantityDisplay(entry.quantityIn)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-right">
                          {formatQuantityDisplay(entry.quantityOut)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-right font-medium">
                          {formatQuantityDisplay(entry.categoryRunningBalance)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3">
                          {hrefAllowed && entry.sourceHref ? (
                            <Link
                              href={entry.sourceHref}
                              className="font-medium text-accent hover:underline"
                            >
                              {entry.referenceNumber ?? "View source"}
                            </Link>
                          ) : (
                            (entry.referenceNumber ?? "—")
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3">
                          {ledgerSourceStoreDisplay(entry)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3">
                          {entry.destinationStore?.storeName ?? "—"}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3">
                          {entry.departmentName ?? "—"}
                        </td>
                        <td className="max-w-[16rem] truncate px-3 py-3">
                          {entry.remarks ?? "—"}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3">
                          {personLabel(entry.performedBy)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3">
                          {entry.verifiedBy ? personLabel(entry.verifiedBy) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-border px-5 py-3">
          <p className="text-sm text-ink-muted">
            {totalItems} {totalItems === 1 ? "movement" : "movements"}
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
                  totalPages === 0 ? current : Math.min(totalPages, current + 1),
                )
              }
              disabled={totalPages === 0 || page >= totalPages}
              className="rounded-md border border-border px-3 py-1.5 text-sm disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </dialog>
  );
}
