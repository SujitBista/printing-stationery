"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type {
  ItemRequest,
  ItemRequestActionType,
} from "@printing-stationery/shared";
import {
  fetchItemRequest,
  performItemRequestAction,
} from "@/lib/api/item-requests";
import { fetchItemIssueEligibility } from "@/lib/api/item-issues";
import { useAuth } from "@/lib/auth/auth-context";
import { ItemRequestActionDialog } from "./item-request-action-dialog";
import {
  formatDateTime,
  ITEM_REQUEST_ACTION_LABELS,
  ITEM_REQUEST_STATUS_LABELS,
  personDisplayName,
} from "./item-request-labels";

function storeBlock(
  title: string,
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
        </>
      ) : (
        <p className="mt-1 text-sm text-ink-muted">Not assigned yet</p>
      )}
    </div>
  );
}

export function ItemRequestDetailPage() {
  const params = useParams<{ id: string }>();
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
  const [canCreateIssue, setCanCreateIssue] = useState(false);

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
    setCanCreateIssue(false);
    if (result.data.status === "APPROVED") {
      const eligibility = await fetchItemIssueEligibility(result.data.id);
      if (eligibility.ok && eligibility.data.canCreate) {
        setCanCreateIssue(true);
      }
    }
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
      message: `${ITEM_REQUEST_ACTION_LABELS[pendingAction]} completed.`,
    });
  }

  if (!canAccessItemRequests) {
    return (
      <section className="w-full max-w-5xl">
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
    <section className="w-full max-w-5xl">
      <Link
        href="/requests/item-requests"
        className="text-sm text-accent hover:underline"
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
                className="text-3xl font-semibold tracking-tight text-ink"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {request.requestNumber}
              </h1>
              <p className="mt-1 text-ink-muted">
                {ITEM_REQUEST_STATUS_LABELS[request.status]}
                {request.pendingWith
                  ? ` · Pending with ${personDisplayName(request.pendingWith)}`
                  : ""}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {canCreateIssue ? (
                <Link
                  href={`/requests/item-requests/${request.id}/issue`}
                  className="rounded-md border border-border px-4 py-2 text-sm"
                >
                  Create Item Issue
                </Link>
              ) : null}
              {request.canEdit ? (
                <Link
                  href={`/requests/item-requests/${request.id}/edit`}
                  className="rounded-md border border-border px-4 py-2 text-sm"
                >
                  Edit
                </Link>
              ) : null}
              {request.allowedActions.map((action) => (
                <button
                  key={action}
                  type="button"
                  onClick={() => setPendingAction(action)}
                  className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90"
                >
                  {ITEM_REQUEST_ACTION_LABELS[action]}
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
            {storeBlock("Requesting store", request.requestingStore)}
            {storeBlock("Corporate store", request.corporateStore)}
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

          <div className="mt-6 overflow-x-auto rounded-md border border-border bg-paper-elevated">
            <table className="min-w-[40rem] w-full text-left text-sm">
              <thead className="border-b border-border bg-paper text-xs uppercase tracking-wider text-ink-muted">
                <tr>
                  <th className="whitespace-nowrap px-3 py-2 font-semibold">
                    Item
                  </th>
                  <th className="whitespace-nowrap px-3 py-2 font-semibold">
                    Unit
                  </th>
                  <th className="whitespace-nowrap px-3 py-2 font-semibold">
                    Quantity
                  </th>
                </tr>
              </thead>
              <tbody>
                {request.lines.map((line) => (
                  <tr
                    key={line.id}
                    className="border-b border-border last:border-b-0"
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-8">
            <h2
              className="text-xl font-semibold tracking-tight"
              style={{ fontFamily: "var(--font-display)" }}
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
                      {ITEM_REQUEST_ACTION_LABELS[entry.action]}
                    </p>
                    <p className="text-sm text-ink-muted">
                      {personDisplayName(entry.actor)} ·{" "}
                      {formatDateTime(entry.createdAt)} ·{" "}
                      {ITEM_REQUEST_STATUS_LABELS[entry.fromStatus]} →{" "}
                      {ITEM_REQUEST_STATUS_LABELS[entry.toStatus]}
                    </p>
                    {entry.remarks ? (
                      <p className="mt-1 text-sm">{entry.remarks}</p>
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