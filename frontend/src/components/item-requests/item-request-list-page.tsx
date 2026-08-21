"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, useTransition } from "react";
import type {
  Branch,
  ItemRequestActionType,
  ItemRequestListItem,
  ItemRequestQueue,
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
import { getItemRequestQueue } from "@/lib/item-requests/queues";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { ItemRequestActionDialog } from "./item-request-action-dialog";
import { ItemRequestQueueTabs } from "./item-request-queue-tabs";
import { Badge } from "@/components/ui/badge";
import {
  formatDateTime,
  ITEM_REQUEST_ACTION_LABELS,
  ITEM_REQUEST_STATUS_LABELS,
  itemRequestStatusTone,
  personDisplayName,
} from "./item-request-labels";

const PAGE_SIZE = 20;

type ItemRequestListPageProps = {
  queue?: ItemRequestQueue;
};

export function ItemRequestListPage({
  queue = "request-list",
}: ItemRequestListPageProps) {
  const queueMeta = getItemRequestQueue(queue);
  const { canAccessItemRequests, isAdmin } = useAuth();
  const [requests, setRequests] = useState<ItemRequestListItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [totalItems, setTotalItems] = useState(0);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
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
    setPage(1);
    setSearchInput("");
    setSearch("");
    setRequestingStoreId("");
    setBranchId("");
    setFeedback(null);
  }, [queue]);

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
      queue,
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
  }, [page, search, queue, requestingStoreId, branchId, isAdmin]);

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
          className="text-2xl font-bold tracking-tight text-accent sm:text-3xl"
        >
          Item Requests
        </h1>
        <p className="mt-4 border-l-2 border-danger pl-3 text-sm text-danger">
          You do not have access to Item Requests.
        </p>
      </section>
    );
  }

  const showCreate = Boolean(queueMeta.showCreate) && canCreate;

  return (
    <section className="w-full max-w-7xl">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1
            className="text-2xl font-bold tracking-tight text-accent sm:text-3xl"
          >
            {queueMeta.title}
          </h1>
          <p className="mt-2 max-w-2xl text-ink-muted">{queueMeta.description}</p>
        </div>
        {showCreate ? (
          <Link
            href="/requests/item-requests/new"
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-dark"
          >
            New Request
          </Link>
        ) : null}
      </div>

      <div className="mt-6">
        <ItemRequestQueueTabs activeQueue={queue} />
      </div>

      {queueMeta.showCreate && !canCreate && !isAdmin ? (
        <div className="mt-4 rounded-md border border-warning/40 bg-warning/10 p-4 text-sm text-ink">
          <p className="font-semibold text-warning">Cannot create requests yet</p>
          <p className="mt-1 text-ink-muted">
            You need an active Store User assignment as the maker of a branch store.
            Ask an admin to set this up in Store User Setup, then refresh this page.
          </p>
        </div>
      ) : null}

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="flex min-w-0 flex-col gap-1 text-sm sm:col-span-2 lg:col-span-1">
          <span className="font-medium text-ink">Search</span>
          <input
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Request number, store, item or employee"
            className="rounded-lg border border-border bg-paper-elevated px-3 py-2 outline-none transition focus:border-accent-mid focus:ring-2 focus:ring-accent/20"
          />
        </label>
        {isAdmin ? (
          <>
            <label className="flex w-full flex-col gap-1 text-sm">
              <span className="font-medium text-ink">Requesting store</span>
              <SearchableSelect
                value={requestingStoreId}
                onChange={(nextValue) => {
                  setPage(1);
                  setRequestingStoreId(nextValue);
                }}
                placeholder="All stores"
                searchPlaceholder="Search stores…"
                options={stores.map((store) => ({
                  value: store.id,
                  label: `${store.storeCode} — ${store.storeName}`,
                }))}
              />
            </label>
            <label className="flex w-full flex-col gap-1 text-sm">
              <span className="font-medium text-ink">Branch</span>
              <SearchableSelect
                value={branchId}
                onChange={(nextValue) => {
                  setPage(1);
                  setBranchId(nextValue);
                }}
                placeholder="All branches"
                searchPlaceholder="Search branches…"
                options={branches.map((branch) => ({
                  value: branch.id,
                  label: `${branch.branchCode} — ${branch.branchName}`,
                }))}
              />
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
          <div className="rounded-xl border border-dashed border-border bg-accent-soft/50 px-4 py-10 text-center">
            <p className="font-medium text-ink">No item requests found</p>
            <p className="mt-1 text-sm text-ink-muted">
              {search || requestingStoreId || branchId
                ? "Try adjusting search or filters."
                : showCreate
                  ? "Create a request to get started."
                  : "No requests are in this queue for you right now."}
            </p>
          </div>
        ) : (
          <>
            <div className="ps-table-shell">
              <table className="min-w-[72rem] w-full text-left text-sm">
                <thead className="border-b border-border bg-accent-soft text-xs uppercase tracking-wider text-ink-muted">
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
                      className="border-b border-border last:border-b-0 transition-colors hover:bg-accent-soft/70"
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
                        <Badge variant={itemRequestStatusTone(request.status)}>
                          {ITEM_REQUEST_STATUS_LABELS[request.status]}
                        </Badge>
                      </td>
                      <td className="min-w-[10rem] px-3 py-3">
                        {personDisplayName(request.pendingWith)}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex min-w-[16rem] flex-wrap gap-2">
                          <Link
                            href={`/requests/item-requests/${request.id}`}
                            className="font-medium text-accent hover:text-accent-dark hover:underline"
                          >
                            View
                          </Link>
                          {request.canCreateIssue ? (
                            <Link
                              href={`/requests/item-requests/${request.id}/issue`}
                              className="font-medium text-accent hover:text-accent-dark hover:underline"
                            >
                              Create Item Issue
                            </Link>
                          ) : null}
                          {request.canEdit ? (
                            <Link
                              href={`/requests/item-requests/${request.id}/edit`}
                              className="font-medium text-accent hover:text-accent-dark hover:underline"
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
