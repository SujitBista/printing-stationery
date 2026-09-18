"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import type { ItemIssue } from "@printing-stationery/shared";
import {
  itemIssueCheckerActionLabel,
  itemIssueBusinessStatusLabel,
} from "@printing-stationery/shared";
import {
  createDepartmentIssue,
  fetchItemIssue,
  rejectItemIssue,
  returnItemIssue,
  submitItemIssue,
  updateDepartmentIssue,
  verifyItemIssue,
} from "@/lib/api/item-issues";
import { fetchDepartments } from "@/lib/api/departments";
import { fetchEmployees } from "@/lib/api/employees";
import { fetchItems } from "@/lib/api/items";
import { fetchStores } from "@/lib/api/stores";
import { useAuth } from "@/lib/auth/auth-context";
import { isItemIssueAccessDenied } from "@/lib/item-issues/permissions";
import { loadAllPaginatedOptions } from "@/lib/api/load-paginated-options";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  formatDateTime,
  personDisplayName,
} from "./item-issue-labels";

type DepartmentIssueFormPageProps =
  | { mode: "create" }
  | { mode: "detail"; issueId: string };

export function DepartmentIssueFormPage(props: DepartmentIssueFormPageProps) {
  const router = useRouter();
  const { canAccessItemRequests } = useAuth();
  const [issue, setIssue] = useState<ItemIssue | null>(null);
  const [fromStoreId, setFromStoreId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [consumedByEmployeeId, setConsumedByEmployeeId] = useState("");
  const [consumptionDescription, setConsumptionDescription] = useState("");
  const [remarks, setRemarks] = useState("");
  const [itemId, setItemId] = useState("");
  const [issueQuantity, setIssueQuantity] = useState("");
  const [storeOptions, setStoreOptions] = useState<Array<{ value: string; label: string }>>(
    [],
  );
  const [departmentOptions, setDepartmentOptions] = useState<
    Array<{ value: string; label: string }>
  >([]);
  const [employeeOptions, setEmployeeOptions] = useState<
    Array<{ value: string; label: string }>
  >([]);
  const [itemOptions, setItemOptions] = useState<Array<{ value: string; label: string }>>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [submitDialogOpen, setSubmitDialogOpen] = useState(false);
  const [checkerAction, setCheckerAction] = useState<"verify" | "return" | "reject" | null>(
    null,
  );
  const [checkerRemarks, setCheckerRemarks] = useState("");

  useEffect(() => {
    async function loadOptions() {
      const [stores, departments, employees, items] = await Promise.all([
        loadAllPaginatedOptions(fetchStores, "ACTIVE"),
        loadAllPaginatedOptions(fetchDepartments, "ACTIVE"),
        loadAllPaginatedOptions(fetchEmployees, "ACTIVE"),
        loadAllPaginatedOptions(fetchItems, "ACTIVE"),
      ]);
      if (stores.ok) {
        setStoreOptions(
          stores.data.map((store) => ({
            value: store.id,
            label: `${store.storeCode} — ${store.storeName}`,
          })),
        );
      }
      if (departments.ok) {
        setDepartmentOptions(
          departments.data.map((department) => ({
            value: department.id,
            label: `${department.departmentCode} — ${department.departmentName}`,
          })),
        );
      }
      if (employees.ok) {
        setEmployeeOptions(
          employees.data.map((employee) => ({
            value: employee.id,
            label: `${employee.employeeCode} — ${employee.employeeName}`,
          })),
        );
      }
      if (items.ok) {
        setItemOptions(
          items.data
            .filter((item) => item.isIssuable)
            .map((item) => ({
              value: item.id,
              label: `${item.itemCode} — ${item.itemName} (${item.unit.unitName})`,
            })),
        );
      }
    }

    async function load() {
      setLoading(true);
      setLoadError(null);
      await loadOptions();
      if (props.mode === "create") {
        setLoading(false);
        return;
      }
      const result = await fetchItemIssue(props.issueId);
      if (!result.ok) {
        setLoadError(
          isItemIssueAccessDenied(result.status)
            ? "You do not have access to this issue."
            : result.error,
        );
        setLoading(false);
        return;
      }
      setIssue(result.data);
      setFromStoreId(result.data.fromStore.id);
      setDepartmentId(result.data.department?.id ?? "");
      setConsumedByEmployeeId(result.data.consumedBy?.id ?? "");
      setConsumptionDescription(result.data.consumptionDescription ?? "");
      setRemarks(result.data.remarks ?? "");
      const firstLine = result.data.lines[0];
      setItemId(firstLine?.itemId ?? "");
      setIssueQuantity(firstLine?.issueQuantity ?? "");
      setLoading(false);
    }

    if (canAccessItemRequests) {
      void load();
    } else {
      setLoading(false);
    }
  }, [canAccessItemRequests, props]);

  const canEdit = issue ? issue.canEdit : true;
  const canSubmit = Boolean(issue?.canSubmit);
  const canVerify = Boolean(issue?.canVerify);
  const checkerLabel = itemIssueCheckerActionLabel({
    destinationType: "CORPORATE_DEPARTMENT",
  });

  function consumptionPayload() {
    if (!fromStoreId || !departmentId || !itemId) {
      throw new Error("Source store, department, and item are required.");
    }
    const description = consumptionDescription.trim();
    if (!description) {
      throw new Error("Consumption Description is required.");
    }
    return {
      fromStoreId,
      departmentId,
      consumedByEmployeeId: consumedByEmployeeId || null,
      consumptionDescription: description,
      remarks: remarks.trim() || null,
      lines: [{ itemId, issueQuantity: issueQuantity.trim() }],
    };
  }

  async function handleSaveDraft(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    setFeedback(null);
    setSaving(true);
    try {
      const payload = consumptionPayload();
      if (props.mode === "create") {
        const result = await createDepartmentIssue(payload);
        if (!result.ok) {
          throw new Error(result.error);
        }
        router.push(`/requests/item-issues/${result.data.id}`);
        return;
      }
      if (!issue) {
        return;
      }
      const result = await updateDepartmentIssue(issue.id, {
        ...payload,
        expectedVersion: issue.version,
      });
      if (!result.ok) {
        throw new Error(result.error);
      }
      setIssue(result.data);
      setFeedback("Department issue draft saved.");
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
    setSaving(true);
    setFormError(null);
    try {
      const payload = consumptionPayload();
      const draftResult = await updateDepartmentIssue(issue.id, {
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
      setSubmitDialogOpen(false);
      setFeedback("Department issue submitted for verification.");
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Failed to submit");
    } finally {
      setSaving(false);
    }
  }

  async function handleCheckerAction() {
    if (!issue || !checkerAction) {
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      if (checkerAction === "verify") {
        const result = await verifyItemIssue(issue.id, {
          expectedVersion: issue.version,
          remarks: checkerRemarks || null,
        });
        if (!result.ok) {
          throw new Error(result.error);
        }
        setIssue(result.data);
        setFeedback("Issued to department.");
      } else if (checkerAction === "return") {
        const result = await returnItemIssue(issue.id, {
          expectedVersion: issue.version,
          remarks: checkerRemarks,
        });
        if (!result.ok) {
          throw new Error(result.error);
        }
        setIssue(result.data);
        setFeedback("Department issue returned.");
      } else {
        const result = await rejectItemIssue(issue.id, {
          expectedVersion: issue.version,
          remarks: checkerRemarks,
        });
        if (!result.ok) {
          throw new Error(result.error);
        }
        setIssue(result.data);
        setFeedback("Department issue rejected.");
      }
      setCheckerAction(null);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Action failed");
    } finally {
      setSaving(false);
    }
  }

  if (!canAccessItemRequests) {
    return (
      <section className="w-full max-w-4xl">
        <h1 className="text-2xl font-bold tracking-tight text-accent">
          Department Consumption
        </h1>
        <p className="mt-4 border-l-2 border-danger pl-3 text-sm text-danger">
          You do not have access to department consumption.
        </p>
      </section>
    );
  }

  if (loading) {
    return <p className="text-sm text-ink-muted">Loading department issue…</p>;
  }
  if (loadError) {
    return (
      <p className="border-l-2 border-danger pl-3 text-sm text-danger">{loadError}</p>
    );
  }

  const firstLine = issue?.lines[0];
  const statement =
    issue?.status === "POSTED" && firstLine && issue.department
      ? `${firstLine.issueQuantity} ${firstLine.unit.unitName} of ${firstLine.requestLine?.item.itemName ?? issue.availability[0]?.itemName ?? "item"} were consumed by the ${issue.department.departmentName} Department.`
      : null;

  return (
    <section className="w-full max-w-4xl">
      <h1 className="text-2xl font-bold tracking-tight text-accent sm:text-3xl">
        {issue?.issueNumber ?? "Issue to Department"}
      </h1>
      <p className="mt-2 text-sm text-ink-muted">
        Corporate Store consumption. This does not create in-transit or branch stock.
      </p>

      {feedback ? (
        <p className="mt-4 border-l-2 border-success pl-3 text-sm text-success">
          {feedback}
        </p>
      ) : null}
      {formError ? (
        <p className="mt-4 border-l-2 border-danger pl-3 text-sm text-danger" role="alert">
          {formError}
        </p>
      ) : null}
      {statement ? (
        <p className="mt-4 border-l-2 border-accent pl-3 text-sm text-ink">
          {statement}
        </p>
      ) : null}
      {issue?.consumptionDescription && issue.status === "POSTED" ? (
        <p className="mt-2 text-sm text-ink-muted">
          Purpose: {issue.consumptionDescription}
        </p>
      ) : null}

      <form className="mt-6 flex flex-col gap-4" onSubmit={(event) => void handleSaveDraft(event)}>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">Source Corporate Store</span>
            <SearchableSelect
              value={fromStoreId}
              options={storeOptions}
              onChange={setFromStoreId}
              disabled={!canEdit || saving || Boolean(issue)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">Corporate Department</span>
            <SearchableSelect
              value={departmentId}
              options={departmentOptions}
              onChange={setDepartmentId}
              disabled={!canEdit || saving}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">Consumed By (optional)</span>
            <SearchableSelect
              value={consumedByEmployeeId}
              options={employeeOptions}
              onChange={setConsumedByEmployeeId}
              disabled={!canEdit || saving}
              clearable
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">Status</span>
            <input
              readOnly
              value={
                issue
                  ? itemIssueBusinessStatusLabel({
                      status: issue.status,
                      destinationType: issue.destinationType,
                    })
                  : "Draft"
              }
              className="rounded-md border border-border bg-paper px-3 py-2 text-ink-muted"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            <span className="font-medium text-ink">Item</span>
            <SearchableSelect
              value={itemId}
              options={itemOptions}
              onChange={setItemId}
              disabled={!canEdit || saving}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">Quantity Issued Now</span>
            <input
              value={issueQuantity}
              onChange={(event) => setIssueQuantity(event.target.value)}
              inputMode="decimal"
              disabled={!canEdit || saving}
              className="rounded-lg border border-border bg-paper-elevated px-3 py-2 outline-none focus:border-accent-mid focus:ring-2 focus:ring-accent/20"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">Issue date</span>
            <input
              readOnly
              value={formatDateTime(issue?.issueDate ?? new Date().toISOString())}
              className="rounded-md border border-border bg-paper px-3 py-2 text-ink-muted"
            />
          </label>
        </div>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-ink">Consumption Description</span>
          <textarea
            value={consumptionDescription}
            onChange={(event) => setConsumptionDescription(event.target.value)}
            rows={3}
            maxLength={500}
            disabled={!canEdit || saving}
            className="rounded-lg border border-border bg-paper-elevated px-3 py-2 outline-none focus:border-accent-mid focus:ring-2 focus:ring-accent/20"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-ink">Remarks (optional)</span>
          <textarea
            value={remarks}
            onChange={(event) => setRemarks(event.target.value)}
            rows={2}
            maxLength={500}
            disabled={!canEdit || saving}
            className="rounded-lg border border-border bg-paper-elevated px-3 py-2 outline-none focus:border-accent-mid focus:ring-2 focus:ring-accent/20"
          />
        </label>
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
              {canSubmit ? (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setSubmitDialogOpen(true)}
                  className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-dark disabled:opacity-60"
                >
                  Submit for Verification
                </button>
              ) : null}
            </>
          ) : null}
          {canVerify ? (
            <>
              <button
                type="button"
                disabled={saving}
                onClick={() => {
                  setCheckerRemarks("");
                  setCheckerAction("verify");
                }}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-dark disabled:opacity-60"
              >
                {checkerLabel}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => {
                  setCheckerRemarks("");
                  setCheckerAction("return");
                }}
                className="rounded-lg border border-accent-tint bg-paper-elevated px-4 py-2 text-sm font-semibold text-accent hover:bg-accent-soft disabled:opacity-60"
              >
                Return
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => {
                  setCheckerRemarks("");
                  setCheckerAction("reject");
                }}
                className="rounded-lg border border-danger px-4 py-2 text-sm font-semibold text-danger hover:bg-danger/10 disabled:opacity-60"
              >
                Reject
              </button>
            </>
          ) : null}
          <Link
            href="/requests/department-consumption"
            className="rounded-lg border border-accent-tint bg-paper-elevated px-4 py-2 text-sm font-semibold text-accent hover:bg-accent-soft"
          >
            Department Consumption
          </Link>
        </div>
      </form>

      {submitDialogOpen ? (
        <dialog
          open
          className="fixed inset-0 z-50 m-0 flex h-auto max-h-none w-auto max-w-none items-center justify-center overflow-y-auto border-0 bg-transparent p-4 text-ink backdrop:bg-ink/40"
        >
          <div className="w-full max-w-xl rounded-lg border border-border bg-paper-elevated p-5 shadow-lg">
            <h2 className="text-xl font-semibold">Submit Department Issue</h2>
            <p className="mt-2 text-sm text-ink-muted">
              Stock will not change until the Corporate Checker selects Issue to
              Department.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setSubmitDialogOpen(false)}
                className="rounded-lg border border-accent-tint px-4 py-2 text-sm font-semibold text-accent"
              >
                Back
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleSubmitIssue()}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white"
              >
                Submit for Verification
              </button>
            </div>
          </div>
        </dialog>
      ) : null}

      {checkerAction ? (
        <dialog
          open
          className="fixed inset-0 z-50 m-0 flex h-auto max-h-none w-auto max-w-none items-center justify-center overflow-y-auto border-0 bg-transparent p-4 text-ink backdrop:bg-ink/40"
        >
          <div className="w-full max-w-xl rounded-lg border border-border bg-paper-elevated p-5 shadow-lg">
            <h2 className="text-xl font-semibold">
              {checkerAction === "verify" ? checkerLabel : checkerAction === "return" ? "Return" : "Reject"}
            </h2>
            <p className="mt-2 text-sm text-ink-muted">
              {checkerAction === "verify"
                ? "This decreases Corporate Store stock and records department consumption. It does not create in-transit stock."
                : "Stock will not change. Remarks are required."}
            </p>
            <label className="mt-4 flex flex-col gap-1 text-sm">
              <span className="font-medium text-ink">
                Remarks{checkerAction === "verify" ? " (optional)" : ""}
              </span>
              <textarea
                value={checkerRemarks}
                onChange={(event) => setCheckerRemarks(event.target.value)}
                rows={3}
                className="rounded-lg border border-border px-3 py-2"
              />
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCheckerAction(null)}
                className="rounded-lg border border-accent-tint px-4 py-2 text-sm font-semibold text-accent"
              >
                Back
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleCheckerAction()}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white"
              >
                {checkerAction === "verify" ? checkerLabel : "Confirm"}
              </button>
            </div>
          </div>
        </dialog>
      ) : null}

      {issue?.verifiedAt ? (
        <p className="mt-4 text-sm text-ink-muted">
          Issued by {personDisplayName(issue.verifiedBy)} on{" "}
          {formatDateTime(issue.verifiedAt)}.
        </p>
      ) : null}
    </section>
  );
}
