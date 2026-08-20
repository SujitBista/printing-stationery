"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, useTransition } from "react";
import type {
  Branch,
  ItemRequestActionType,
  ItemRequestListItem,
  ItemRequestStatusFilter,
  Store,
} from "@printing-stationery/shared";
import { fetchBranches } from "@/lib/api/branches";
import {
  fetchItemRequestContext,
  fetchItemRequests,
  performItemRequestAction,
} from "@/lib/api/item-requests";
import { fetchStores } from "@/lib/api/stores";
import { loadAllPaginatedOptions } from "@/lib/api/load-paginated-options";
import { useAuth } from "@/lib/auth/auth-context";
import { ItemRequestActionDialog } from "./item-request-action-dialog";
import {
  formatDateTime,
  ITEM_REQUEST_ACTION_LABELS,
  ITEM_REQUEST_STATUS_LABELS,
  personDisplayName,
} from "./item-request-labels";

const PAGE_SIZE = 20;

const STATUS_FILTERS: ItemRequestStatusFilter[] = [
  "ALL",
  "DRAFT",
  "PENDING_BRANCH_CHECKER",
  "RETURNED_TO_BRANCH_MAKER",
  "PENDING_CORPORATE_MAKER",
  "PENDING_CORPORATE_CHECKER",
  "RETURNED_TO_CORPORATE_MAKER",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
];

export function ItemRequestListPage() {
  const { canAccessItemRequests, isAdmin } = useAuth();
  const [requests, setRequests] = useState<ItemRequestListItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [totalItems, setTotalItems] = useState(0);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ItemRequestStatusFilter>("ALL");
  const [requestingStoreId, setRequestingStoreId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [canCreate, setCanCreate] = useState(false);
  const [stores, setStores] = useState<
    Pick<Store, "id" | "storeCode" | "storeName">[]
  >([]);
  const [branches, setBranches] = useState<
    Pick<Branch, "id" | "branchCode" | "branchName">[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<
    { type: "success" | "error"; message: string } | null
  >(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isUnavailable, setIsUnavailable] = useState(false);
  const [actionTarget, setActionTarget] = useState<{
    request: ItemRequestListItem;
    action: ItemRequestActionType;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [, startTransition] = useTransition();

  useEffect(() => {
    async function loadContextAndFilters() {
      const [contextResult, storesResult, branchesResult] = await Promise.all([
        fetchItemRequestContext(),
        isAdmin ? loadAllPaginatedOptions(fetchStores, "ALL") : Promise.resolve(null),
        isAdmin
          ? loadAllPaginatedOptions(fetchBranches, "ALL")
          : Promise.resolve(null),
      ]);

      if (contextResult.ok) {
        setCanCreate(contextResult.data.canCreate);
      }

      if (storesResult?.ok) {
        setStores(
          storesResult.data.map((store) => ({
            id: store.id,
            storeCode: store.storeCode,
            storeName: store.storeName,
          })),
        );
      }

      if (branchesResult?.ok) {
        setBranches(
          branchesResult.data.map((branch) => ({
            id: branch.id,
            branchCode: branch.branchCode,
            branchName: branch.branchName,
          })),
        );
      }
    }

    if (canAccessItemRequests) {
      void loadContextAndFilters();
    }
  }, [canAccessItemRequests, isAdmin]);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    setIsUnavailable(false);

    const result = await fetchItemRequests({
      page,
      pageSize: PAGE_SIZE,
      search: search || undefined,
      status,
      requestingStoreId: isAdmin ? requestingStoreId || undefined : undefined,
      branchId: isAdmin ? branchId || undefined : undefined,
    });

    if (!result.ok) {
      setRequests([]);
      setTotalItems(0);
      setTotalPages(0);
      setLoadError(result.error);
      setIsUnavailable(result.status === 503);
      setLoading(false);
      return;
    }

    setRequests(result.data.items);
    setTotalItems(result.data.totalItems);
    setTotalPages(result.data.totalPages);
    setLoading(false);
  }, [page, search, status, requestingStoreId, branchId, isAdmin]);

  useEffect(() => {
    if (!canAccessItemRequests) {
      setLoading(false);
      return;
    }
    void loadRequests();
  }, [canAccessItemRequests, loadRequests]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      startTransition(() => {
        setPage(1);
        setSearch(searchInput.trim());
      });
    }, 300);

    return () => window.clearTimeout(handle);
  }, [searchInput]);

  async function handleConfirmAction(remarks: string | null) {
    if (!actionTarget) {
      return;
    }

    setSaving(true);
    const result = await performItemRequestAction(actionTarget.request.id, {
      action: actionTarget.action,
      remarks,
      expectedVersion: actionTarget.request.version,
    });
    setSaving(false);

    if (!result.ok) {
      throw new Error(result.error);
    }

    setActionTarget(null);
    setFeedback({
      type: "success",
      message: `${ITEM_REQUEST_ACTION_LABELS[actionTarget.action]} completed.`,
    });
    await loadRequests();
  }

  if (!canAccessItemRequests) {
    return (
      <section className="w-full max-w-7xl">
        <h1
          className="text-3xl font-semibold tracking-tight text-ink"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Item Requests
        </h1>
        <p className="mt-4 border-l-2 border-danger pl-3 text-sm text-danger">
          You do not have access to Item Requests.
        </p>
      </section>
    );
  }

  return (
    <section className="w-full max-w-7xl">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1
            className="text-3xl font-semibold tracking-tight text-ink"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Item Requests
          </h1>
          <p className="mt-2 max-w-2xl text-ink-muted">
            Create and route stationery requests from a branch store through
            checker and corporate approval.
          </p>
        </div>
        {canCreate ? (
          <Link
            href="/requests/item-requests/new"
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90"
          >
            New Request
          </Link>
        ) : null}
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="flex min-w-0 flex-col gap-1 text-sm sm:col-span-2 lg:col-span-1">
          <span className="font-medium text-ink">Search</span>
          <input
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Request number, store, item or employee"
            className="rounded-md border border-border bg-paper-elevated px-3 py-2 outline-none focus:ring-2 focus:ring-accent/30"
          />
        </label>
        <label className="flex w-full flex-col gap-1 text-sm">
          <span className="font-medium text-ink">Status</span>
          <select
            value={status}
            onChange={(event) => {
              setPage(1);
              setStatus(event.target.value as ItemRequestStatusFilter);
            }}
            className="rounded-md border border-border bg-paper-elevated px-3 py-2 outline-none focus:ring-2 focus:ring-accent/30"
          >
            {STATUS_FILTERS.map((option) => (
              <option key={option} value={option}>
                {option === "ALL"
                  ? "All"
                  : ITEM_REQUEST_STATUS_LABELS[option]}
              </option>
            ))}
          </select>
        </label>
        {isAdmin ? (
          <>
            <label className="flex w-full flex-col gap-1 text-sm">
              <span className="font-medium text-ink">Requesting store</span>
              <select
                value={requestingStoreId}
                onChange={(event) => {
                  setPage(1);
                  setRequestingStoreId(event.target.value);
                }}
                className="rounded-md border border-border bg-paper-elevated px-3 py-2 outline-none focus:ring-2 focus:ring-accent/30"
              >
                <option value="">All stores</option>
                {stores.map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.storeCode} — {store.storeName}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex w-full flex-col gap-1 text-sm">
              <span className="font-medium text-ink">Branch</span>
              <select
                value={branchId}
                onChange={(event) => {
                  setPage(1);
                  setBranchId(event.target.value);
                }}
                className="rounded-md border border-border bg-paper-elevated px-3 py-2 outline-none focus:ring-2 focus:ring-accent/30"
              >
                <option value="">All branches</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.branchCode} — {branch.branchName}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : null}
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
          <p className="text-sm text-ink-muted">Loading item requests…</p>
        ) : isUnavailable ? (
          <div className="border-l-2 border-warning pl-4">
            <p className="font-medium text-warning">Database unavailable</p>
            <p className="mt-1 text-sm text-ink-muted">{loadError}</p>
          </div>
        ) : loadError ? (
          <div className="border-l-2 border-danger pl-4">
            <p className="font-medium text-danger">Unable to load item requests</p>
            <p className="mt-1 text-sm text-ink-muted">{loadError}</p>
          </div>
        ) : requests.length === 0 ? (
          <div className="rounded-md border border-dashed border-border px-4 py-10 text-center">
            <p className="font-medium text-ink">No item requests found</p>
            <p className="mt-1 text-sm text-ink-muted">
              {search || status !== "ALL" || requestingStoreId || branchId
                ? "Try adjusting search or filters."
                : canCreate
                  ? "Create a request to get started."
                  : "No requests are currently visible to you."}
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto rounded-md border border-border bg-paper-elevated">
              <table className="min-w-[72rem] w-full text-left text-sm">
                <thead className="border-b border-border bg-paper text-xs uppercase tracking-wider text-ink-muted">
                  <tr>
                    <th className="whitespace-nowrap px-3 py-2 font-semibold">
                      Request number
                    </th>
                    <th className="whitespace-nowrap px-3 py-2 font-semibold">
                      Requesting store
                    </th>
                    <th className="whitespace-nowrap px-3 py-2 font-semibold">
                      Created by
                    </th>
                    <th className="whitespace-nowrap px-3 py-2 font-semibold">
                      Created date
                    </th>
                    <th className="whitespace-nowrap px-3 py-2 font-semibold">
                      Items
                    </th>
                    <th className="whitespace-nowrap px-3 py-2 font-semibold">
                      Status
                    </th>
                    <th className="whitespace-nowrap px-3 py-2 font-semibold">
                      Pending with
                    </th>
                    <th className="whitespace-nowrap px-3 py-2 font-semibold">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map((request) => (
                    <tr
                      key={request.id}
                      className="border-b border-border last:border-b-0"
                    >
                      <td className="whitespace-nowrap px-3 py-3 font-medium">
                        {request.requestNumber}
                      </td>
                      <td className="min-w-[12rem] px-3 py-3">
                        <div className="font-medium">
                          {request.requestingStore.storeName}
                        </div>
                        <div className="text-xs text-ink-muted">
                          {request.requestingStore.storeCode}
                        </div>
                      </td>
                      <td className="min-w-[10rem] px-3 py-3">
                        {personDisplayName(request.createdBy)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3">
                        {formatDateTime(request.createdAt)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3">
                        {request.itemCount}
                      </td>
                      <td className="min-w-[10rem] px-3 py-3">
                        {ITEM_REQUEST_STATUS_LABELS[request.status]}
                      </td>
                      <td className="min-w-[10rem] px-3 py-3">
                        {personDisplayName(request.pendingWith)}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex min-w-[16rem] flex-wrap gap-2">
                          <Link
                            href={`/requests/item-requests/${request.id}`}
                            className="text-accent hover:underline"
                          >
                            View
                          </Link>
                          {request.canCreateIssue ? (
                            <Link
                              href={`/requests/item-requests/${request.id}/issue`}
                              className="text-accent hover:underline"
                            >
                              Create Item Issue
                            </Link>
                          ) : null}
                          {request.canEdit ? (
                            <Link
                              href={`/requests/item-requests/${request.id}/edit`}
                              className="text-accent hover:underline"
                            >
                              Edit
                            </Link>
                          ) : null}
                          {request.allowedActions.map((action) => (
                            <button
                              key={action}
                              type="button"
                              onClick={() =>
                                setActionTarget({ request, action })
                              }
                              className="text-ink-muted hover:text-ink hover:underline"
                            >
                              {ITEM_REQUEST_ACTION_LABELS[action]}
                            </button>
                          ))}
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
                {totalItems === 1 ? "request" : "requests"}
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

      <ItemRequestActionDialog
        open={Boolean(actionTarget)}
        action={actionTarget?.action ?? null}
        saving={saving}
        onClose={() => {
          if (!saving) {
            setActionTarget(null);
          }
        }}
        onConfirm={handleConfirmAction}
      />
    </section>
  );
}