"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import type {
  ItemIssue,
  ItemIssueEligibility,
  ItemIssueLineAvailability,
} from "@printing-stationery/shared";
import {
  createItemIssueFromRequest,
  fetchItemIssue,
  fetchItemIssueEligibility,
  submitItemIssue,
  updateItemIssue,
} from "@/lib/api/item-issues";
import { useAuth } from "@/lib/auth/auth-context";
import { isItemIssueAccessDenied } from "@/lib/item-issues/permissions";
import {
  formatDateTime,
  ITEM_ISSUE_STATUS_LABELS,
  personDisplayName,
} from "./item-issue-labels";

type ItemIssueFormPageProps =
  | {
      mode: "create";
      requestId: string;
    }
  | {
      mode: "detail";
      issueId: string;
    };

function formatStoreLabel(
  store:
    | ItemIssue["fromStore"]
    | ItemIssue["toStore"]
    | NonNullable<ItemIssueEligibility["request"]>["requestingStore"]
    | NonNullable<ItemIssueEligibility["request"]>["corporateStore"],
) {
  if (!store) {
    return "Not assigned";
  }
  return `${store.storeCode} — ${store.storeName} (${store.branch.branchName})`;
}

function buildInitialQuantities(
  availability: ItemIssueLineAvailability[],
  issue?: ItemIssue | null,
): Record<string, string> {
  const values: Record<string, string> = {};
  for (const line of availability) {
    values[line.requestLineId] = "";
  }
  for (const line of issue?.lines ?? []) {
    values[line.requestLineId] = line.issueQuantity;
  }
  return values;
}

function buildDraftPayload(params: {
  remarks: string;
  issueQuantities: Record<string, string>;
  availability: ItemIssueLineAvailability[];
}) {
  const allowedIds = new Set(params.availability.map((line) => line.requestLineId));
  const lines = Object.entries(params.issueQuantities)
    .map(([requestLineId, issueQuantity]) => ({
      requestLineId,
      issueQuantity: issueQuantity.trim(),
    }))
    .filter(
      (line) =>
        allowedIds.has(line.requestLineId) &&
        line.issueQuantity.length > 0 &&
        Number(line.issueQuantity) > 0,
    );

  if (lines.length === 0) {
    throw new Error("Enter an issue quantity greater than zero for at least one line.");
  }

  return {
    remarks: params.remarks.trim().length === 0 ? null : params.remarks.trim(),
    lines,
  };
}

export function ItemIssueFormPage(props: ItemIssueFormPageProps) {
  const router = useRouter();
  const { canAccessItemRequests } = useAuth();
  const [eligibility, setEligibility] = useState<ItemIssueEligibility | null>(null);
  const [issue, setIssue] = useState<ItemIssue | null>(null);
  const [remarks, setRemarks] = useState("");
  const [issueQuantities, setIssueQuantities] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [accessDenied, setAccessDenied] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [submitDialogOpen, setSubmitDialogOpen] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setLoadError(null);
      setAccessDenied(false);

      if (props.mode === "create") {
        const result = await fetchItemIssueEligibility(props.requestId);
        if (!result.ok) {
          setAccessDenied(isItemIssueAccessDenied(result.status));
          setLoadError(result.error);
          setLoading(false);
          return;
        }

        if (result.data.draftIssueId) {
          router.replace(`/requests/item-issues/${result.data.draftIssueId}`);
          return;
        }

        setEligibility(result.data);
        setRemarks("");
        setIssueQuantities(buildInitialQuantities(result.data.lines));
        setLoading(false);
        return;
      }

      const result = await fetchItemIssue(props.issueId);
      if (!result.ok) {
        setAccessDenied(isItemIssueAccessDenied(result.status));
        setLoadError(result.error);
        setLoading(false);
        return;
      }

      setIssue(result.data);
      setRemarks(result.data.remarks ?? "");
      setIssueQuantities(
        buildInitialQuantities(result.data.availability, result.data),
      );
      setLoading(false);
    }

    if (canAccessItemRequests) {
      void load();
    } else {
      setLoading(false);
    }
  }, [canAccessItemRequests, props, router]);

  const availability = useMemo(
    () => issue?.availability ?? eligibility?.lines ?? [],
    [eligibility?.lines, issue?.availability],
  );
  const request = issue?.request ?? eligibility?.request ?? null;
  const canEdit = issue ? issue.canEdit : Boolean(eligibility?.canCreate);
  const isSubmitted = issue?.status === "SUBMITTED";

  async function handleSaveDraft(event: FormEvent) {
    event.preventDefault();
    if (!request) {
      return;
    }

    setFormError(null);
    setFeedback(null);
    setSaving(true);
    try {
      const payload = buildDraftPayload({
        remarks,
        issueQuantities,
        availability,
      });

      if (props.mode === "create") {
        const result = await createItemIssueFromRequest(request.id, payload);
        if (!result.ok) {
          throw new Error(result.error);
        }
        router.push(`/requests/item-issues/${result.data.id}`);
      } else if (issue) {
        const result = await updateItemIssue(issue.id, {
          ...payload,
          expectedVersion: issue.version,
        });
        if (!result.ok) {
          throw new Error(result.error);
        }
        setIssue(result.data);
        setRemarks(result.data.remarks ?? "");
        setFeedback("Item issue draft saved.");
      }
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Failed to save draft");
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmitIssue() {
    if (!issue) {
      return;
    }

    setFormError(null);
    setFeedback(null);
    setSaving(true);
    try {
      const payload = buildDraftPayload({
        remarks,
        issueQuantities,
        availability,
      });
      const draftResult = await updateItemIssue(issue.id, {
        ...payload,
        expectedVersion: issue.version,
      });
      if (!draftResult.ok) {
        throw new Error(draftResult.error);
      }

      const submitResult = await submitItemIssue(draftResult.data.id, {
        expectedVersion: draftResult.data.version,
      });
      if (!submitResult.ok) {
        throw new Error(submitResult.error);
      }

      setIssue(submitResult.data);
      setRemarks(submitResult.data.remarks ?? "");
      setIssueQuantities(
        buildInitialQuantities(
          submitResult.data.availability,
          submitResult.data,
        ),
      );
      setSubmitDialogOpen(false);
      setFeedback("Item issue submitted for approval.");
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Failed to submit item issue",
      );
    } finally {
      setSaving(false);
    }
  }

  if (!canAccessItemRequests) {
    return (
      <section className="w-full max-w-6xl">
        <h1
          className="text-2xl font-bold tracking-tight text-accent sm:text-3xl"
        >
          Item Issues
        </h1>
        <p className="mt-4 border-l-2 border-danger pl-3 text-sm text-danger">
          You do not have access to Item Issues.
        </p>
      </section>
    );
  }

  return (
    <section className="w-full max-w-6xl">
      <Link
        href={
          request
            ? `/requests/item-requests/${request.id}`
            : "/requests/item-requests"
        }
        className="text-sm font-medium text-accent hover:text-accent-dark hover:underline"
      >
        Back to Request
      </Link>

      {loading ? (
        <p className="mt-6 text-sm text-ink-muted">Loading item issue…</p>
      ) : loadError ? (
        <div className="mt-6 border-l-2 border-danger pl-3">
          {accessDenied ? (
            <p className="font-medium text-danger">You are not authorized to create this item issue.</p>
          ) : null}
          <p className={`text-sm text-danger ${accessDenied ? "mt-1" : ""}`}>
            {loadError}
          </p>
        </div>
      ) : request ? (
        <form
          onSubmit={(event) => void handleSaveDraft(event)}
          className="mt-4 flex flex-col gap-5"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1
                className="text-2xl font-bold tracking-tight text-accent sm:text-3xl"
              >
                {issue?.issueNumber ?? "New Item Issue"}
              </h1>
              <p className="mt-1 text-ink-muted">
                {issue
                  ? ITEM_ISSUE_STATUS_LABELS[issue.status]
                  : "Draft not yet created"}
              </p>
              <p className="mt-1 text-sm text-ink-muted">
                Corporate Store Checker creates the issue
              </p>
            </div>
            {issue?.issueNumber ? (
              <div className="text-sm text-ink-muted">
                Request: {request.requestNumber}
              </div>
            ) : null}
          </div>

          {feedback ? (
            <p className="border-l-2 border-success pl-3 text-sm text-success" role="status">
              {feedback}
            </p>
          ) : null}
          {formError ? (
            <p className="border-l-2 border-danger pl-3 text-sm text-danger" role="alert">
              {formError}
            </p>
          ) : null}
          {!availability.some((line) => line.stockBalanceKnown) ? (
            <p className="border-l-2 border-warning pl-3 text-sm text-warning">
              Stock balance unavailable. Stock validation will be enforced in a later posting milestone.
            </p>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-ink">Request number</span>
              <input
                readOnly
                value={request.requestNumber}
                className="rounded-md border border-border bg-paper px-3 py-2 text-ink-muted"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-ink">Request date</span>
              <input
                readOnly
                value={formatDateTime(request.createdAt)}
                className="rounded-md border border-border bg-paper px-3 py-2 text-ink-muted"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-ink">From Store</span>
              <input
                readOnly
                value={formatStoreLabel(request.corporateStore)}
                className="rounded-md border border-border bg-paper px-3 py-2 text-ink-muted"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-ink">To Store</span>
              <input
                readOnly
                value={formatStoreLabel(request.requestingStore)}
                className="rounded-md border border-border bg-paper px-3 py-2 text-ink-muted"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-ink">Requested by</span>
              <input
                readOnly
                value={personDisplayName(request.createdBy)}
                className="rounded-md border border-border bg-paper px-3 py-2 text-ink-muted"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-ink">Issue status</span>
              <input
                readOnly
                value={issue ? ITEM_ISSUE_STATUS_LABELS[issue.status] : "Draft"}
                className="rounded-md border border-border bg-paper px-3 py-2 text-ink-muted"
              />
            </label>
          </div>

          {request.remarks ? (
            <p className="text-sm text-ink-muted">Request remarks: {request.remarks}</p>
          ) : null}

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">Issue remarks (optional)</span>
            <textarea
              value={remarks}
              onChange={(event) => setRemarks(event.target.value)}
              rows={3}
              maxLength={500}
              disabled={saving || !canEdit}
              readOnly={!canEdit}
              className="rounded-lg border border-border bg-paper-elevated px-3 py-2 outline-none transition focus:border-accent-mid focus:ring-2 focus:ring-accent/20 disabled:opacity-70"
            />
          </label>

          <div className="ps-table-shell">
            <table className="min-w-[72rem] w-full text-left text-sm">
              <thead className="border-b border-border bg-accent-soft text-xs uppercase tracking-wider text-ink-muted">
                <tr>
                  <th className="px-3 py-2 font-semibold">Item</th>
                  <th className="px-3 py-2 font-semibold">Unit</th>
                  <th className="px-3 py-2 font-semibold">Requested Qty</th>
                  <th className="px-3 py-2 font-semibold">Previously Issued Qty</th>
                  <th className="px-3 py-2 font-semibold">Remaining Qty</th>
                  <th className="px-3 py-2 font-semibold">Available Stock</th>
                  <th className="px-3 py-2 font-semibold">Issue Qty</th>
                </tr>
              </thead>
              <tbody>
                {availability.map((line) => (
                  <tr
                    key={line.requestLineId}
                    className="border-b border-border last:border-b-0 transition-colors hover:bg-accent-soft/70"
                  >
                    <td className="px-3 py-3">
                      <div className="font-medium">
                        {line.itemCode} — {line.itemName}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">{line.unit.unitName}</td>
                    <td className="whitespace-nowrap px-3 py-3">{line.requestedQuantity}</td>
                    <td className="whitespace-nowrap px-3 py-3">
                      {line.previouslyIssuedQuantity}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">{line.remainingQuantity}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-ink-muted">
                      {line.stockBalanceKnown
                        ? line.availableStockQuantity ?? "0"
                        : "Stock balance unavailable"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">
                      <input
                        value={issueQuantities[line.requestLineId] ?? ""}
                        onChange={(event) =>
                          setIssueQuantities((current) => ({
                            ...current,
                            [line.requestLineId]: event.target.value,
                          }))
                        }
                        inputMode="decimal"
                        disabled={saving || !canEdit}
                        readOnly={!canEdit}
                        className="w-28 rounded-lg border border-border bg-paper-elevated px-3 py-2 outline-none transition focus:border-accent-mid focus:ring-2 focus:ring-accent/20 disabled:opacity-70"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap gap-2">
            {canEdit ? (
              <>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg border border-accent-tint bg-paper-elevated px-4 py-2 text-sm font-semibold text-accent hover:bg-accent-soft disabled:opacity-60"
                >
                  {saving ? "Saving…" : "Save Draft"}
                </button>
                {props.mode === "detail" && !isSubmitted ? (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => setSubmitDialogOpen(true)}
                    className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-dark disabled:opacity-60"
                  >
                    Submit for Approval
                  </button>
                ) : null}
              </>
            ) : null}
            <Link
              href={`/requests/item-requests/${request.id}`}
              className="rounded-lg border border-accent-tint bg-paper-elevated px-4 py-2 text-sm font-semibold text-accent hover:bg-accent-soft"
            >
              {isSubmitted ? "Back to Request" : "Cancel"}
            </Link>
          </div>

          {issue?.submittedAt ? (
            <p className="text-sm text-ink-muted">
              Submitted by {personDisplayName(issue.submittedBy)} on{" "}
              {formatDateTime(issue.submittedAt)}.
            </p>
          ) : null}
        </form>
      ) : null}

      {submitDialogOpen ? (
        <dialog
          open
          className="fixed inset-0 z-50 m-0 flex h-auto max-h-none w-auto max-w-none items-center justify-center overflow-y-auto border-0 bg-transparent p-4 text-ink backdrop:bg-ink/40"
        >
          <div className="w-full max-w-xl rounded-lg border border-border bg-paper-elevated p-5 shadow-lg">
            <h2
              className="text-xl font-semibold tracking-tight"
            >
              Submit Item Issue
            </h2>
            <p className="mt-2 text-sm text-ink-muted">
              Submit this Item Issue? You will not be able to edit it after
              submission.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => setSubmitDialogOpen(false)}
                className="rounded-lg border border-accent-tint bg-paper-elevated px-4 py-2 text-sm font-semibold text-accent hover:bg-accent-soft disabled:opacity-60"
              >
                Back
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleSubmitIssue()}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-dark disabled:opacity-60"
              >
                {saving ? "Working…" : "Submit for Approval"}
              </button>
            </div>
          </div>
        </dialog>
      ) : null}
    </section>
  );
}
