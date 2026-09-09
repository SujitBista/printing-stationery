"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, useTransition } from "react";
import type { PurchaseListItem } from "@printing-stationery/shared";
import { deletePurchase, fetchPurchases } from "@/lib/api/purchases";
import { useAuth } from "@/lib/auth/auth-context";
import {
  createdByDisplayName,
  displayOrDash,
  formatIsoDate,
  formatPurchaseAmount,
} from "./purchase-labels";

const PAGE_SIZE = 20;

export function PurchaseListPage() {
  const { canAccessPurchases, canMutatePurchases } = useAuth();
  const [purchases, setPurchases] = useState<PurchaseListItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [totalItems, setTotalItems] = useState(0);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [canCreate, setCanCreate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<
    { type: "success" | "error"; message: string } | null
  >(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isUnavailable, setIsUnavailable] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const loadPurchases = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    setIsUnavailable(false);

    const result = await fetchPurchases({
      page,
      pageSize: PAGE_SIZE,
      search: search || undefined,
    });

    if (!result.ok) {
      setPurchases([]);
      setTotalItems(0);
      setTotalPages(0);
      setCanCreate(false);
      setLoadError(result.error);
      setIsUnavailable(result.status === 503);
      setLoading(false);
      return;
    }

    setPurchases(result.data.items);
    setTotalItems(result.data.totalItems);
    setTotalPages(result.data.totalPages);
    setCanCreate(result.data.canCreate);
    setLoading(false);
  }, [page, search]);

  useEffect(() => {
    if (!canAccessPurchases) {
      setLoading(false);
      return;
    }
    void loadPurchases();
  }, [canAccessPurchases, loadPurchases]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      startTransition(() => {
        setPage(1);
        setSearch(searchInput.trim());
      });
    }, 300);

    return () => window.clearTimeout(handle);
  }, [searchInput]);

  async function handleDelete(purchase: PurchaseListItem) {
    const confirmed = window.confirm(
      `Delete purchase ${purchase.purchaseNumber}? This cannot be undone.`,
    );
    if (!confirmed) {
      return;
    }

    setDeletingId(purchase.id);
    const result = await deletePurchase(purchase.id, {
      expectedVersion: purchase.version,
    });
    setDeletingId(null);

    if (!result.ok) {
      setFeedback({ type: "error", message: result.error });
      return;
    }

    setFeedback({
      type: "success",
      message: `Purchase ${purchase.purchaseNumber} deleted.`,
    });
    await loadPurchases();
  }

  if (!canAccessPurchases) {
    return (
      <section className="w-full max-w-7xl">
        <div className="border-l-2 border-danger pl-4">
          <p className="font-medium text-danger">Access denied</p>
          <p className="mt-1 text-sm text-ink-muted">
            You do not have permission to view purchase records.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="w-full max-w-[90rem]">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-accent sm:text-3xl">
            Purchase Master
          </h1>
          <p className="mt-2 max-w-2xl text-ink-muted">
            Record purchases into a store from a party, including bill details
            and line items.
          </p>
        </div>
        {canCreate && canMutatePurchases ? (
          <Link
            href="/purchases/new"
            className="shrink-0 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-dark"
          >
            + Add New
          </Link>
        ) : null}
      </div>

      <div className="mt-6">
        <label className="flex min-w-0 flex-col gap-1 text-sm">
          <span className="font-medium text-ink">Search</span>
          <input
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Purchase no, party, store, bill no, remarks"
            className="max-w-xl rounded-lg border border-border bg-paper-elevated px-3 py-2 outline-none transition focus:border-accent-mid focus:ring-2 focus:ring-accent/20"
          />
        </label>
      </div>

      {feedback ? (
        <p
          className={`mt-4 border-l-2 pl-3 text-sm ${
            feedback.type === "success"
              ? "border-success text-success"
              : "border-danger text-danger"
          }`}
          role="status"
        >
          {feedback.message}
        </p>
      ) : null}

      <div className="mt-6">
        {loading ? (
          <p className="text-sm text-ink-muted">Loading purchases…</p>
        ) : isUnavailable ? (
          <div className="border-l-2 border-warning pl-4">
            <p className="font-medium text-warning">Database unavailable</p>
            <p className="mt-1 text-sm text-ink-muted">{loadError}</p>
          </div>
        ) : loadError ? (
          <div className="border-l-2 border-danger pl-4">
            <p className="font-medium text-danger">Unable to load purchases</p>
            <p className="mt-1 text-sm text-ink-muted">{loadError}</p>
          </div>
        ) : purchases.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-accent-soft/50 px-4 py-10 text-center">
            <p className="font-medium text-ink">No purchases found</p>
            <p className="mt-1 text-sm text-ink-muted">
              {search
                ? "Try adjusting the search."
                : canCreate
                  ? "Add a purchase record to get started."
                  : "No purchase records are available yet."}
            </p>
          </div>
        ) : (
          <>
            <div className="ps-table-shell">
              <table className="min-w-[88rem] w-full text-left text-sm">
                <thead className="border-b border-border bg-accent-soft text-xs uppercase tracking-wider text-ink-muted">
                  <tr>
                    <th className="whitespace-nowrap px-3 py-2 font-semibold">
                      Purchase No
                    </th>
                    <th className="whitespace-nowrap px-3 py-2 font-semibold">
                      Fiscal Year
                    </th>
                    <th className="whitespace-nowrap px-3 py-2 font-semibold">
                      Purchase Date
                    </th>
                    <th className="whitespace-nowrap px-3 py-2 font-semibold">
                      Purchase Bill Date
                    </th>
                    <th className="whitespace-nowrap px-3 py-2 font-semibold">
                      Store Name
                    </th>
                    <th className="whitespace-nowrap px-3 py-2 font-semibold">
                      Party Name
                    </th>
                    <th className="whitespace-nowrap px-3 py-2 font-semibold">
                      Total Amount
                    </th>
                    <th className="whitespace-nowrap px-3 py-2 font-semibold">
                      PO Number
                    </th>
                    <th className="whitespace-nowrap px-3 py-2 font-semibold">
                      GRN No.
                    </th>
                    <th className="whitespace-nowrap px-3 py-2 font-semibold">
                      Delivery Note No.
                    </th>
                    <th className="whitespace-nowrap px-3 py-2 font-semibold">
                      Purchase Bill No
                    </th>
                    <th className="whitespace-nowrap px-3 py-2 font-semibold">
                      Request ID
                    </th>
                    <th className="whitespace-nowrap px-3 py-2 font-semibold">
                      Remarks
                    </th>
                    <th className="whitespace-nowrap px-3 py-2 font-semibold">
                      Created By
                    </th>
                    <th className="whitespace-nowrap px-3 py-2 font-semibold">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {purchases.map((purchase) => (
                    <tr
                      key={purchase.id}
                      className="border-b border-border last:border-b-0 transition-colors hover:bg-accent-soft/70"
                    >
                      <td className="whitespace-nowrap px-3 py-3 font-medium">
                        {purchase.purchaseNumber}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3">
                        {purchase.fiscalYear}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3">
                        {formatIsoDate(purchase.purchaseDate)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3">
                        {formatIsoDate(purchase.purchaseBillDate)}
                      </td>
                      <td className="min-w-[10rem] px-3 py-3">
                        {purchase.store.storeName}
                      </td>
                      <td className="min-w-[12rem] px-3 py-3">
                        {purchase.party.partyName}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 tabular-nums">
                        {formatPurchaseAmount(purchase.totalAmount)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3">
                        {displayOrDash(purchase.poNumber)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3">
                        {displayOrDash(purchase.grnNumber)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3">
                        {displayOrDash(purchase.deliveryNoteNumber)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3">
                        {displayOrDash(purchase.purchaseBillNumber)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3">
                        {displayOrDash(purchase.itemRequest?.requestNumber)}
                      </td>
                      <td className="min-w-[10rem] px-3 py-3">
                        {displayOrDash(purchase.remarks)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3">
                        {createdByDisplayName(purchase.createdBy)}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex min-w-[10rem] flex-wrap gap-2">
                          <Link
                            href={`/purchases/${purchase.id}`}
                            className="font-medium text-accent hover:text-accent-dark hover:underline"
                          >
                            Details
                          </Link>
                          {purchase.canEdit ? (
                            <Link
                              href={`/purchases/${purchase.id}/edit`}
                              className="font-medium text-accent hover:text-accent-dark hover:underline"
                            >
                              Edit
                            </Link>
                          ) : null}
                          {purchase.canDelete ? (
                            <button
                              type="button"
                              onClick={() => void handleDelete(purchase)}
                              disabled={deletingId === purchase.id}
                              className="font-medium text-danger hover:underline disabled:opacity-60"
                            >
                              {deletingId === purchase.id ? "Deleting…" : "Delete"}
                            </button>
                          ) : null}
                        </div>
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
                {totalItems === 1 ? "purchase" : "purchases"}
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
    </section>
  );
}
