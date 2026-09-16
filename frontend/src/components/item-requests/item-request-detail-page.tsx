"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type {
  ItemRequest,
  ItemRequestActionType,
} from "@printing-stationery/shared";
import {
  deleteItemRequest,
  fetchItemRequest,
  performItemRequestAction,
} from "@/lib/api/item-requests";
import { useAuth } from "@/lib/auth/auth-context";
import {
  getItemRequestIssueActionHref,
  getItemRequestIssueActionLabel,
  resolveVisibleItemRequestIssueAction,
} from "@/lib/item-issues/permissions";
import { Badge } from "@/components/ui/badge";
import { ItemRequestActionDialog } from "./item-request-action-dialog";
import {
  formatDateTime,
  formatStoreTransferDirection,
  getItemRequestActionLabel,
  ITEM_REQUEST_STATUS_LABELS,
  ITEM_REQUEST_WORKFLOW_ROLE_LABELS,
  itemRequestStatusTone,
  departmentDisplayName,
  personDisplayName,
  requestedByDisplayName,
} from "./item-request-labels";
import { formatAvailableStockQuantity } from "@/components/item-issues/item-issue-labels";

function storeBlock(
  title: string,
  helper: string,
  store: ItemRequest["requestingStore"] | null,
) {
  return (
    <div>
      <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
        {title}
      </h2>
      {store ? (
        <>
          <p className="mt-1 font-medium">
            {store.storeCode} — {store.storeName}
          </p>
          <p className="text-sm text-ink-muted">
            {store.branch.branchCode} — {store.branch.branchName}
          </p>
          <p className="mt-1 text-xs text-ink-muted">{helper}</p>
        </>
      ) : (
        <>
          <p className="mt-1 text-sm text-ink-muted">Not assigned yet</p>
          <p className="mt-1 text-xs text-ink-muted">{helper}</p>
        </>
      )}
    </div>
  );
}

export function ItemRequestDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { canAccessItemRequests } = useAuth();
  const [request, setRequest] = useState<ItemRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<
    { type: "success" | "error"; message: string } | null
  >(null);
  const [pendingAction, setPendingAction] =
    useState<ItemRequestActionType | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const loadRequest = useCallback(async () => {
    if (!params.id) {
      setLoadError("Invalid item request id");
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadError(null);
    const result = await fetchItemRequest(params.id);
    if (!result.ok) {
      setRequest(null);
      setLoadError(result.error);
      setLoading(false);
      return;
    }

    setRequest(result.data);
    setLoading(false);
  }, [params.id]);

  useEffect(() => {
    if (!canAccessItemRequests) {
      setLoading(false);
      return;
    }
    void loadRequest();
  }, [canAccessItemRequests, loadRequest]);

  async function handleConfirm(remarks: string | null) {
    if (!request || !pendingAction) {
      return;
    }

    setSaving(true);
    const result = await performItemRequestAction(request.id, {
      action: pendingAction,
      remarks,
      expectedVersion: request.version,
    });
    setSaving(false);

    if (!result.ok) {
      throw new Error(result.error);
    }

    setPendingAction(null);
    setRequest(result.data);
    setFeedback({
      type: "success",
      message: `${getItemRequestActionLabel(pendingAction, {
        status: request.status,
      })} completed.`,
    });
  }

  async function handleDelete() {
    if (!request) {
      return;
    }
    const confirmed = window.confirm(
      `Delete request ${request.requestNumber}? This cannot be undone.`,
    );
    if (!confirmed) {
      return;
    }

    setDeleting(true);
    setFeedback(null);
    const result = await deleteItemRequest(request.id, {
      expectedVersion: request.version,
    });
    setDeleting(false);

    if (!result.ok) {
      setFeedback({ type: "error", message: result.error });
      return;
    }

    router.push("/requests/item-requests");
  }

  if (!canAccessItemRequests) {
    return (
      <section className="w-full max-w-5xl">
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

  const issueAction = request
    ? resolveVisibleItemRequestIssueAction({
        canCreateNewIssue: request.canCreateIssue,
        requestStatus: request.status,
        activeIssue: request.activeIssue,
      })
    : null;

  return (
    <section className="w-full max-w-5xl">
      <Link
        href="/requests/item-requests"
        className="text-sm font-medium text-accent hover:text-accent-dark hover:underline"
      >
        Back to Item Requests
      </Link>

      {loading ? (
        <p className="mt-6 text-sm text-ink-muted">Loading request…</p>
      ) : loadError ? (
        <p className="mt-6 border-l-2 border-danger pl-3 text-sm text-danger">
          {loadError}
        </p>
      ) : request ? (
        <>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1
                className="text-2xl font-bold tracking-tight text-accent sm:text-3xl"
              >
                {request.requestNumber}
              </h1>
              <p className="mt-2 flex flex-wrap items-center gap-2 text-ink-muted">
                <Badge variant={itemRequestStatusTone(request.status)}>
                  {ITEM_REQUEST_STATUS_LABELS[request.status]}
                </Badge>
                <Badge variant="info">
                  {formatStoreTransferDirection(
                    request.sourceStore,
                    request.destinationStore,
                  )}
                </Badge>
                {request.pendingWith
                  ? `Pending with ${personDisplayName(request.pendingWith)}`
                  : null}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {issueAction ? (
                <Link
                  href={getItemRequestIssueActionHref({
                    requestId: request.id,
                    action: issueAction,
                    activeIssueId: request.activeIssue?.id,
                  })}
                  className="rounded-lg border border-accent-tint bg-paper-elevated px-4 py-2 text-sm font-semibold text-accent hover:bg-accent-soft"
                >
                  {getItemRequestIssueActionLabel(issueAction)}
                </Link>
              ) : null}
              {request.canEdit ? (
                <Link
                  href={`/requests/item-requests/${request.id}/edit`}
                  className="rounded-lg border border-accent-tint bg-paper-elevated px-4 py-2 text-sm font-semibold text-accent hover:bg-accent-soft"
                >
                  Edit
                </Link>
              ) : null}
              {request.canDelete ? (
                <button
                  type="button"
                  onClick={() => void handleDelete()}
                  disabled={deleting}
                  className="rounded-lg border border-danger px-4 py-2 text-sm font-semibold text-danger hover:bg-danger/10 disabled:opacity-60"
                >
                  {deleting ? "Deleting…" : "Delete"}
                </button>
              ) : null}
              {request.allowedActions.map((action) => (
                <button
                  key={action}
                  type="button"
                  onClick={() => setPendingAction(action)}
                  className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-dark"
                >
                  {getItemRequestActionLabel(action, {
                    status: request.status,
                  })}
                </button>
              ))}
            </div>
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

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {storeBlock(
              "Request From Store",
              "Store making the request",
              request.sourceStore ?? request.requestingStore,
            )}
            {storeBlock(
              "Request To Store",
              "Store that will process and supply the request",
              request.destinationStore ?? request.corporateStore,
            )}
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
                Requested by
              </h2>
              <p className="mt-1 font-medium">
                {requestedByDisplayName(
                  request.requestedBy,
                  request.createdBy,
                )}
              </p>
              {request.requestedBy ? (
                <>
                  <p className="text-sm text-ink-muted">
                    Branch: {request.requestedBy.branch.branchCode} —{" "}
                    {request.requestedBy.branch.branchName}
                  </p>
                  <p className="text-sm text-ink-muted">
                    Department:{" "}
                    {departmentDisplayName(request.requestedBy.department)}
                  </p>
                </>
              ) : null}
            </div>
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
                Created by
              </h2>
              <p className="mt-1 font-medium">
                {personDisplayName(request.createdBy)}
              </p>
              <p className="text-sm text-ink-muted">
                {formatDateTime(request.createdAt)}
              </p>
            </div>
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
                Assignees
              </h2>
              <p className="mt-1 text-sm">
                Branch checker: {personDisplayName(request.branchChecker)}
              </p>
              <p className="text-sm">
                Corporate maker: {personDisplayName(request.corporateMaker)}
              </p>
              <p className="text-sm">
                Corporate checker: {personDisplayName(request.corporateChecker)}
              </p>
            </div>
          </div>

          {request.remarks ? (
            <p className="mt-6 text-sm text-ink-muted">
              Overall remarks: {request.remarks}
            </p>
          ) : null}

          <div className="mt-6 ps-table-shell">
            <table className="min-w-[40rem] w-full text-left text-sm">
              <thead className="border-b border-border bg-accent-soft text-xs uppercase tracking-wider text-ink-muted">
                <tr>
                  <th className="whitespace-nowrap px-3 py-2 font-semibold">
                    Item
                  </th>
                  <th className="whitespace-nowrap px-3 py-2 font-semibold">
                    Unit
                  </th>
                  <th className="whitespace-nowrap px-3 py-2 font-semibold">
                    Requested
                  </th>
                  <th className="whitespace-nowrap px-3 py-2 font-semibold">
                    Issued
                  </th>
                  <th className="whitespace-nowrap px-3 py-2 font-semibold">
                    Remaining
                  </th>
                  <th className="whitespace-nowrap px-3 py-2 font-semibold">
                    Available stock
                  </th>
                </tr>
              </thead>
              <tbody>
                {request.lines.map((line) => (
                  <tr
                    key={line.id}
                    className="border-b border-border last:border-b-0 transition-colors hover:bg-accent-soft/70"
                  >
                    <td className="px-3 py-3">
                      <div className="font-medium">
                        {line.item.itemCode} — {line.item.itemName}
                      </div>
                      {!line.item.isActive || !line.item.isRequestable ? (
                        <div className="text-xs text-warning">
                          No longer eligible for new submissions
                        </div>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">
                      {line.item.unit.unitName}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">
                      {line.requestedQuantity}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">
                      {line.issuedQuantity}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">
                      {line.remainingQuantity}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">
                      {line.availableStockQuantity == null
                        ? "—"
                        : formatAvailableStockQuantity(
                            line.availableStockQuantity,
                            line.item.unit.unitName,
                          )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-8">
            <h2
              className="text-xl font-semibold tracking-tight"
            >
              Workflow history
            </h2>
            {request.actions.length === 0 ? (
              <p className="mt-3 text-sm text-ink-muted">
                No workflow actions yet.
              </p>
            ) : (
              <ol className="mt-4 flex flex-col gap-3">
                {request.actions.map((entry) => (
                  <li
                    key={entry.id}
                    className="rounded-md border border-border bg-paper-elevated px-4 py-3"
                  >
                    <p className="font-medium">
                      {getItemRequestActionLabel(entry.action, {
                        status: entry.fromStatus,
                      })}
                    </p>
                    <p className="text-sm text-ink-muted">
                      Previous status:{" "}
                      {ITEM_REQUEST_STATUS_LABELS[entry.fromStatus]}
                    </p>
                    <p className="text-sm text-ink-muted">
                      New status: {ITEM_REQUEST_STATUS_LABELS[entry.toStatus]}
                    </p>
                    <p className="text-sm text-ink-muted">
                      Performed by: {personDisplayName(entry.actor)}
                    </p>
                    <p className="text-sm text-ink-muted">
                      Role:{" "}
                      {ITEM_REQUEST_WORKFLOW_ROLE_LABELS[entry.actorWorkflowRole]}
                    </p>
                    <p className="text-sm text-ink-muted">
                      {formatDateTime(entry.createdAt)}
                    </p>
                    {entry.remarks ? (
                      <p className="mt-1 text-sm">Remarks: {entry.remarks}</p>
                    ) : null}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </>
      ) : null}

      <ItemRequestActionDialog
        open={Boolean(pendingAction)}
        action={pendingAction}
        actionLabel={
          pendingAction && request
            ? getItemRequestActionLabel(pendingAction, {
                status: request.status,
              })
            : undefined
        }
        saving={saving}
        onClose={() => {
          if (!saving) {
            setPendingAction(null);
          }
        }}
        onConfirm={handleConfirm}
      />
    </section>
  );
}