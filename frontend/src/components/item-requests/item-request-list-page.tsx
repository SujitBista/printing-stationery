"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, useTransition } from "react";
import {
  ITEM_REQUEST_CORPORATE_MAKER_CREATE_MESSAGE,
  ITEM_REQUEST_MISSING_MAKER_OR_CHECKER_MESSAGE,
  type Branch,
  type ItemRequestActionType,
  type ItemRequestListItem,
  type ItemRequestQueue,
  type Store,
} from "@printing-stationery/shared";
import { fetchBranches } from "@/lib/api/branches";
import {
  deleteItemRequest,
  fetchItemRequests,
  performItemRequestAction,
} from "@/lib/api/item-requests";
import { fetchStores } from "@/lib/api/stores";
import { loadAllPaginatedOptions } from "@/lib/api/load-paginated-options";
import { useAuth } from "@/lib/auth/auth-context";
import {
  shouldShowItemRequestCorporateMakerCreateNote,
  shouldShowItemRequestCreateAction,
  shouldShowItemRequestCreateAssignmentWarning,
} from "@/lib/item-requests/permissions";
import {
  getItemRequestListEmptyState,
  getItemRequestListRowActions,
  getItemRequestQueue,
} from "@/lib/item-requests/queues";
import { useItemRequestNavContext } from "@/lib/item-requests/use-item-request-nav-context";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { ItemRequestActionDialog } from "./item-request-action-dialog";
import { ItemRequestQueueTabs } from "./item-request-queue-tabs";
import { Badge } from "@/components/ui/badge";
import {
  formatDateTime,
  formatStoreTransferDirection,
  getItemRequestActionLabel,
  ITEM_REQUEST_STATUS_LABELS,
  itemRequestStatusTone,
  personDisplayName,
  requestedByDisplayName,
} from "./item-request-labels";

const PAGE_SIZE = 20;

type ItemRequestListPageProps = {
  queue?: ItemRequestQueue;
};

export function ItemRequestListPage({
  queue = "request-list",
}: ItemRequestListPageProps) {
  const {
    workflowRoles,
    canViewFulfilment,
    readyToIssueCount,
    canCreate,
    loaded: navLoaded,
    setReadyToIssueCount,
  } = useItemRequestNavContext();
  const queueMeta = getItemRequestQueue(queue, workflowRoles);
  const { canAccessItemRequests, isAdmin, user } = useAuth();
  const [requests, setRequests] = useState<ItemRequestListItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [totalItems, setTotalItems] = useState(0);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [requestingStoreId, setRequestingStoreId] = useState("");
  const [branchId, setBranchId] = useState("");
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
  const [deletingId, setDeletingId] = useState<string | null>(null);
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
    async function loadFilters() {
      const [storesResult, branchesResult] = await Promise.all([
        isAdmin ? loadAllPaginatedOptions(fetchStores, "ALL") : Promise.resolve(null),
        isAdmin
          ? loadAllPaginatedOptions(fetchBranches, "ALL")
          : Promise.resolve(null),
      ]);

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

    if (canAccessItemRequests && isAdmin) {
      void loadFilters();
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
    if (
      queue === "ready-to-issue" &&
      !search &&
      !requestingStoreId &&
      !branchId
    ) {
      setReadyToIssueCount(result.data.totalItems);
    }
    setLoading(false);
  }, [
    page,
    search,
    queue,
    requestingStoreId,
    branchId,
    isAdmin,
    setReadyToIssueCount,
  ]);

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
      message: `${getItemRequestActionLabel(actionTarget.action, {
        queue,
        status: actionTarget.request.status,
      })} completed.`,
    });
    await loadRequests();
  }

  async function handleDelete(request: ItemRequestListItem) {
    const confirmed = window.confirm(
      `Delete request ${request.requestNumber}? This cannot be undone.`,
    );
    if (!confirmed) {
      return;
    }

    setDeletingId(request.id);
    const result = await deleteItemRequest(request.id, {
      expectedVersion: request.version,
    });
    setDeletingId(null);

    if (!result.ok) {
      setFeedback({ type: "error", message: result.error });
      return;
    }

    setFeedback({
      type: "success",
      message: `Request ${request.requestNumber} deleted.`,
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

  const showCreate = shouldShowItemRequestCreateAction({
    queueShowsCreate: Boolean(queueMeta.showCreate),
    canCreate,
    user,
    workflowRoles,
  });
  const showCreateAssignmentWarning =
    navLoaded &&
    shouldShowItemRequestCreateAssignmentWarning({
      queueShowsCreate: Boolean(queueMeta.showCreate),
      canCreate,
      isAdmin,
      user,
      workflowRoles,
    });
  const showCorporateMakerCreateNote =
    navLoaded &&
    shouldShowItemRequestCorporateMakerCreateNote({
      queue,
      workflowRoles,
    });
  const emptyState = getItemRequestListEmptyState({
    queue,
    workflowRoles,
    hasFilters: Boolean(search || requestingStoreId || branchId),
    canCreate: showCreate,
  });

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
        ) : showCorporateMakerCreateNote ? (
          <p className="max-w-xs text-sm text-ink-muted">
            {ITEM_REQUEST_CORPORATE_MAKER_CREATE_MESSAGE}
          </p>
        ) : null}
      </div>

      <div className="mt-6">
        {queueMeta.navGroup === "fulfilment" ? (
          <div className="mb-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-muted">
              Fulfilment / Issue Tracking
            </h2>
            <p className="mt-1 text-sm text-ink-muted">
              Read-only progress of approved requests that are being issued.
            </p>
          </div>
        ) : null}
        <ItemRequestQueueTabs
          activeQueue={queue}
          workflowRoles={workflowRoles}
          canViewFulfilment={canViewFulfilment}
          readyToIssueCount={readyToIssueCount}
        />
      </div>

      {showCreateAssignmentWarning ? (
        <div className="mt-4 rounded-md border border-warning/40 bg-warning/10 p-4 text-sm text-ink">
          <p className="font-semibold text-warning">Cannot create requests yet</p>
          <p className="mt-1 text-ink-muted">
            {ITEM_REQUEST_MISSING_MAKER_OR_CHECKER_MESSAGE}
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
              <span className="font-medium text-ink">Request From Store</span>
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
            <p className="font-medium text-ink">{emptyState.title}</p>
            <p className="mt-1 text-sm text-ink-muted">{emptyState.message}</p>
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
                      Stores
                    </th>
                    <th className="whitespace-nowrap px-3 py-2 font-semibold">
                      Requested by
                    </th>
                    <th className="whitespace-nowrap px-3 py-2 font-semibold">
                      Request date
                    </th>
                    <th className="whitespace-nowrap px-3 py-2 font-semibold">
                      Quantities
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
                  {requests.map((request) => {
                    const rowActions = getItemRequestListRowActions(
                      queue,
                      request,
                    );

                    return (
                      <tr
                        key={request.id}
                        className="border-b border-border last:border-b-0 transition-colors hover:bg-accent-soft/70"
                      >
                        <td className="whitespace-nowrap px-3 py-3 font-medium">
                          {request.requestNumber}
                        </td>
                        <td className="min-w-[14rem] px-3 py-3">
                          <Badge variant="info">
                            {formatStoreTransferDirection(
                              request.sourceStore,
                              request.destinationStore,
                            )}
                          </Badge>
                          <div className="mt-1 text-xs text-ink-muted">
                            Requesting {request.sourceStore?.storeCode ?? "—"} ·
                            Processing{" "}
                            {request.destinationStore?.storeCode ?? "—"}
                          </div>
                        </td>
                        <td className="min-w-[10rem] px-3 py-3">
                          {requestedByDisplayName(
                            request.requestedBy,
                            request.createdBy,
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3">
                          {formatDateTime(request.createdAt)}
                        </td>
                        <td className="min-w-[10rem] px-3 py-3">
                          <div>Requested {request.totalRequestedQuantity}</div>
                          <div className="text-xs text-ink-muted">
                            Issued {request.totalIssuedQuantity} · Remaining{" "}
                            {request.totalRemainingQuantity}
                          </div>
                          {request.availableStockQuantity != null ? (
                            <div className="text-xs text-ink-muted">
                              Available {request.availableStockQuantity}
                            </div>
                          ) : null}
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
                            {rowActions.issueAction && rowActions.issueHref ? (
                              <Link
                                href={rowActions.issueHref}
                                className="font-medium text-accent hover:text-accent-dark hover:underline"
                              >
                                {rowActions.issueActionLabel}
                              </Link>
                            ) : null}
                            {rowActions.workflowActions.map((action) => (
                              <button
                                key={action}
                                type="button"
                                onClick={() =>
                                  setActionTarget({ request, action })
                                }
                                className="text-ink-muted hover:text-ink hover:underline"
                              >
                                {getItemRequestActionLabel(action, {
                                  queue,
                                  status: request.status,
                                })}
                              </button>
                            ))}
                            {request.canDelete ? (
                              <button
                                type="button"
                                onClick={() => void handleDelete(request)}
                                disabled={deletingId === request.id}
                                className="font-medium text-danger hover:underline disabled:opacity-60"
                              >
                                {deletingId === request.id
                                  ? "Deleting…"
                                  : "Delete"}
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
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
        actionLabel={
          actionTarget
            ? getItemRequestActionLabel(actionTarget.action, {
                queue,
                status: actionTarget.request.status,
              })
            : undefined
        }
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
