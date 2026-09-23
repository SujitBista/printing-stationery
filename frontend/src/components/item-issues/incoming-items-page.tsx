"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type {
  IncomingShipmentListItem,
  IncomingShipmentQueue,
} from "@printing-stationery/shared";
import { actorCanAccessIncomingItems } from "@printing-stationery/shared";
import { fetchIncomingShipments } from "@/lib/api/item-issues";
import { useAuth } from "@/lib/auth/auth-context";
import { useItemRequestNavContext } from "@/lib/item-requests/use-item-request-nav-context";
import { Badge } from "@/components/ui/badge";
import {
  formatDateTime,
  ITEM_ISSUE_DELIVERY_STATUS_LABELS,
} from "./item-issue-labels";

const PAGE_SIZE = 20;

const QUEUES: Array<{ key: IncomingShipmentQueue; label: string }> = [
  { key: "in-transit", label: "In Transit" },
  { key: "partially-received", label: "Partially Received" },
  { key: "received", label: "Received" },
  { key: "received-with-discrepancy", label: "Received with Discrepancy" },
];

export function IncomingItemsPage() {
  const { canAccessItemRequests } = useAuth();
  const { workflowRoles } = useItemRequestNavContext();
  const canAccess = canAccessItemRequests && actorCanAccessIncomingItems(workflowRoles);
  const [queue, setQueue] = useState<IncomingShipmentQueue>("in-transit");
  const [items, setItems] = useState<IncomingShipmentListItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [totalItems, setTotalItems] = useState(0);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const result = await fetchIncomingShipments({
      page,
      pageSize: PAGE_SIZE,
      search: search || undefined,
      queue,
    });
    if (!result.ok) {
      setItems([]);
      setLoadError(result.error);
      setLoading(false);
      return;
    }
    setItems(result.data.items);
    setTotalItems(result.data.totalItems);
    setTotalPages(result.data.totalPages);
    setLoading(false);
  }, [page, queue, search]);

  useEffect(() => {
    if (!canAccess) {
      setLoading(false);
      return;
    }
    void load();
  }, [canAccess, load]);

  if (!canAccess) {
    return (
      <section className="w-full max-w-6xl">
        <h1 className="text-2xl font-bold tracking-tight text-accent">Incoming Items</h1>
        <p className="mt-4 border-l-2 border-danger pl-3 text-sm text-danger">
          You do not have access to Incoming Items.
        </p>
      </section>
    );
  }

  return (
    <section className="w-full max-w-6xl">
      <h1 className="text-2xl font-bold tracking-tight text-accent sm:text-3xl">
        Incoming Items
      </h1>
      <p className="mt-2 text-sm text-ink-muted">
        Shipments dispatched to your assigned store. Destination Store Maker or
        Checker can confirm receipt directly. Stock changes only when receipt is
        confirmed.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {QUEUES.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => {
              setQueue(item.key);
              setPage(1);
            }}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              queue === item.key
                ? "bg-accent text-white"
                : "border border-accent-tint text-accent hover:bg-accent-soft"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <form
        className="mt-4 flex flex-wrap gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          setPage(1);
          setSearch(searchInput.trim());
        }}
      >
        <input
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder="Search issue or request number"
          className="min-w-[16rem] flex-1 rounded-lg border border-border bg-paper-elevated px-3 py-2 text-sm outline-none focus:border-accent-mid focus:ring-2 focus:ring-accent/20"
        />
        <button
          type="submit"
          className="rounded-lg border border-accent-tint bg-paper-elevated px-4 py-2 text-sm font-semibold text-accent hover:bg-accent-soft"
        >
          Search
        </button>
      </form>

      {loading ? (
        <p className="mt-6 text-sm text-ink-muted">Loading incoming items…</p>
      ) : loadError ? (
        <p className="mt-6 border-l-2 border-danger pl-3 text-sm text-danger">{loadError}</p>
      ) : items.length === 0 ? (
        <p className="mt-6 text-sm text-ink-muted">No shipments in this queue.</p>
      ) : (
        <>
          <div className="ps-table-shell mt-4">
            <table className="min-w-[72rem] w-full text-left text-sm">
              <thead className="border-b border-border bg-accent-soft text-xs uppercase tracking-wider text-ink-muted">
                <tr>
                  <th className="px-3 py-2 font-semibold">Issue</th>
                  <th className="px-3 py-2 font-semibold">Request</th>
                  <th className="px-3 py-2 font-semibold">From</th>
                  <th className="px-3 py-2 font-semibold">To</th>
                  <th className="px-3 py-2 font-semibold">Dispatch date</th>
                  <th className="px-3 py-2 font-semibold">Item</th>
                  <th className="px-3 py-2 font-semibold">Remaining in transit</th>
                  <th className="px-3 py-2 font-semibold">Status</th>
                  <th className="px-3 py-2 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr
                    key={item.id}
                    className="border-b border-border last:border-b-0 hover:bg-accent-soft/70"
                  >
                    <td className="px-3 py-3 font-medium">{item.issueNumber}</td>
                    <td className="px-3 py-3">{item.requestNumber ?? "—"}</td>
                    <td className="px-3 py-3">{item.fromStore.storeName}</td>
                    <td className="px-3 py-3">{item.toStore.storeName}</td>
                    <td className="px-3 py-3">{formatDateTime(item.dispatchDate)}</td>
                    <td className="px-3 py-3">
                      {item.itemSummaries.map((summary) => (
                        <div key={`${summary.itemCode}-${summary.itemName}`}>
                          {summary.itemCode} — {summary.itemName} ({summary.dispatchedQuantity}{" "}
                          {summary.unitName})
                        </div>
                      ))}
                    </td>
                    <td className="px-3 py-3">
                      {item.itemSummaries
                        .map((summary) => summary.remainingInTransitQuantity)
                        .join(", ")}
                    </td>
                    <td className="px-3 py-3">
                      <Badge variant="info">
                        {ITEM_ISSUE_DELIVERY_STATUS_LABELS[item.deliveryStatus]}
                      </Badge>
                    </td>
                    <td className="px-3 py-3">
                      <Link
                        href={`/requests/incoming-items/${item.id}`}
                        className="font-medium text-accent hover:underline"
                      >
                        {item.canConfirmReceipt ? "Confirm Receipt" : "View"}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex items-center justify-between text-sm text-ink-muted">
            <p>
              Showing page {page}
              {totalPages > 0 ? ` of ${totalPages}` : ""} · {totalItems} shipments
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                className="rounded-lg border border-accent-tint px-3 py-1.5 font-medium text-accent disabled:opacity-50"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((current) => current + 1)}
                className="rounded-lg border border-accent-tint px-3 py-1.5 font-medium text-accent disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
