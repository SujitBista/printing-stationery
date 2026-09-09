"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  createItemRequestInputSchema,
  type EligibleItemRequestItem,
  type ItemRequest,
  type ItemRequestContext,
  type ItemRequestRequestedByEmployee,
  type ItemRequestStoreSummary,
} from "@printing-stationery/shared";
import {
  createItemRequest,
  fetchEligibleItemRequestItems,
  fetchItemRequest,
  fetchItemRequestContext,
  performItemRequestAction,
  updateItemRequest,
} from "@/lib/api/item-requests";
import { useAuth } from "@/lib/auth/auth-context";
import {
  canSelectRequestedByEmployee,
  defaultRequestedByEmployeeId,
} from "@/lib/item-requests/permissions";
import { formatAvailableStockQuantity } from "@/components/item-issues/item-issue-labels";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { ItemRequestActionDialog } from "./item-request-action-dialog";
import { ItemRequestEmployeeSelect } from "./item-request-employee-select";
import { ItemRequestStoreSelect } from "./item-request-store-select";
import {
  departmentDisplayName,
  employeeDisplayName,
  storeDisplayName,
  storeOptionLabel,
} from "./item-request-labels";

type LineState = {
  key: string;
  itemId: string;
  requestedQuantity: string;
};

type ItemRequestFormPageProps = {
  mode: "create" | "edit";
  requestId?: string;
};

function itemOptionLabel(item: EligibleItemRequestItem): string {
  return `${item.itemCode} — ${item.itemName} (${item.unit.unitName})`;
}

function newLineKey(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function ItemRequestFormPage({
  mode,
  requestId,
}: ItemRequestFormPageProps) {
  const router = useRouter();
  const { canAccessItemRequests, isAdmin, user } = useAuth();
  const [context, setContext] = useState<ItemRequestContext | null>(null);
  const [existing, setExisting] = useState<ItemRequest | null>(null);
  const [eligibleItems, setEligibleItems] = useState<EligibleItemRequestItem[]>(
    [],
  );
  const [sourceStoreId, setSourceStoreId] = useState("");
  const [sourceStore, setSourceStore] = useState<ItemRequestStoreSummary | null>(
    null,
  );
  const [destinationStoreId, setDestinationStoreId] = useState("");
  const [requestedByEmployee, setRequestedByEmployee] =
    useState<ItemRequestRequestedByEmployee | null>(null);
  const [remarks, setRemarks] = useState("");
  const [lines, setLines] = useState<LineState[]>([
    { key: newLineKey(), itemId: "", requestedQuantity: "" },
  ]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitDialogOpen, setSubmitDialogOpen] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setLoadError(null);

      const [contextResult, existingResult] = await Promise.all([
        fetchItemRequestContext(),
        mode === "edit" && requestId
          ? fetchItemRequest(requestId)
          : Promise.resolve(null),
      ]);

      if (!contextResult.ok) {
        setLoadError(contextResult.error);
        setLoading(false);
        return;
      }

      setContext(contextResult.data);

      if (existingResult) {
        if (!existingResult.ok) {
          setLoadError(existingResult.error);
          setLoading(false);
          return;
        }

        if (!existingResult.data.canEdit) {
          setLoadError("This request cannot be edited.");
          setLoading(false);
          return;
        }

        setExisting(existingResult.data);
        setRemarks(existingResult.data.remarks ?? "");
        setSourceStoreId(existingResult.data.sourceStoreId ?? "");
        setSourceStore(existingResult.data.sourceStore);
        setDestinationStoreId(existingResult.data.destinationStoreId);
        setRequestedByEmployee(existingResult.data.requestedBy);
        setLines(
          existingResult.data.lines.map((line) => ({
            key: line.id,
            itemId: line.itemId,
            requestedQuantity: line.requestedQuantity,
          })),
        );
      } else if (!contextResult.data.canCreate) {
        setLoadError(
          isAdmin
            ? "You cannot create a request right now."
            : "You can create a request only when you have an active store assignment as maker.",
        );
      } else {
        setDestinationStoreId(contextResult.data.destinationStore?.id ?? "");
        setRequestedByEmployee(contextResult.data.requestedByEmployee);
        if (
          !canSelectRequestedByEmployee(user) &&
          !defaultRequestedByEmployeeId({
            user,
            contextEmployeeId: contextResult.data.requestedByEmployee?.id,
          })
        ) {
          setLoadError(
            "Your account is not linked to an employee record.",
          );
        }
      }

      setLoading(false);
    }

    if (canAccessItemRequests) {
      void load();
    } else {
      setLoading(false);
    }
  }, [canAccessItemRequests, isAdmin, mode, requestId, user]);

  useEffect(() => {
    if (!sourceStoreId) {
      setEligibleItems([]);
      return;
    }

    let cancelled = false;
    void loadAllEligibleItems(sourceStoreId).then((result) => {
      if (cancelled) {
        return;
      }
      if (result.ok) {
        setEligibleItems(result.data);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [sourceStoreId]);

  const selectedItemIds = useMemo(
    () => new Set(lines.map((line) => line.itemId).filter(Boolean)),
    [lines],
  );

  const historicalItems = useMemo(() => {
    if (!existing) {
      return [];
    }
    return existing.lines
      .filter((line) => !eligibleItems.some((item) => item.id === line.itemId))
      .map((line) => ({
        id: line.itemId,
        itemCode: line.item.itemCode,
        itemName: line.item.itemName,
        unit: line.item.unit,
        availableStockQuantity: line.availableStockQuantity ?? "0",
      }));
  }, [eligibleItems, existing]);

  const allItemOptions = useMemo(
    () => [...historicalItems, ...eligibleItems],
    [eligibleItems, historicalItems],
  );

  const destinationStoreOptions = useMemo(() => {
    const options = [...(context?.destinationStores ?? [])];
    const existingDestination = existing?.destinationStore;
    if (
      existingDestination &&
      !options.some((store) => store.id === existingDestination.id)
    ) {
      options.unshift(existingDestination);
    }
    return options;
  }, [context?.destinationStores, existing?.destinationStore]);

  const destinationReadOnly = !context?.canSelectDestinationStore;
  const requestedByReadOnly = !context?.canSelectRequestedByEmployee;
  const destinationStore =
    destinationStoreOptions.find((store) => store.id === destinationStoreId) ??
    existing?.destinationStore ??
    context?.destinationStore ??
    null;
  const requestedByBranchDiffers =
    Boolean(requestedByEmployee) &&
    Boolean(destinationStore) &&
    requestedByEmployee?.branch.id !== destinationStore?.branch.id;

  function updateLine(key: string, patch: Partial<LineState>) {
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );
  }

  function addLine() {
    setLines((current) => [
      ...current,
      { key: newLineKey(), itemId: "", requestedQuantity: "" },
    ]);
  }

  function removeLine(key: string) {
    setLines((current) =>
      current.length === 1
        ? current
        : current.filter((line) => line.key !== key),
    );
  }

  function buildPayload() {
    if (!sourceStoreId) {
      throw new Error("Select Request From Store");
    }
    if (!destinationStoreId) {
      throw new Error("Select Request To Store");
    }
    if (!requestedByEmployee) {
      throw new Error("Requested By is required");
    }
    if (sourceStoreId === destinationStoreId) {
      throw new Error("Request From Store and Request To Store must be different");
    }

    const payload = {
      sourceStoreId,
      destinationStoreId,
      requestedByEmployeeId: requestedByEmployee.id,
      remarks: remarks.trim().length === 0 ? null : remarks,
      lines: lines.map((line) => ({
        itemId: line.itemId,
        requestedQuantity: line.requestedQuantity.trim(),
      })),
    };

    const parsed = createItemRequestInputSchema.safeParse(payload);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new Error(issue?.message ?? "Invalid request contents");
    }

    return parsed.data;
  }

  async function saveDraft(): Promise<ItemRequest> {
    const payload = buildPayload();

    if (mode === "create") {
      const result = await createItemRequest(payload);
      if (!result.ok) {
        throw new Error(result.error);
      }
      return result.data;
    }

    if (!existing) {
      throw new Error("This request cannot be edited.");
    }

    const result = await updateItemRequest(existing.id, {
      ...payload,
      expectedVersion: existing.version,
    });
    if (!result.ok) {
      throw new Error(result.error);
    }
    setExisting(result.data);
    return result.data;
  }

  async function handleSaveDraft(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    setSaving(true);
    try {
      const saved = await saveDraft();
      router.push(`/requests/item-requests/${saved.id}`);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleConfirmedSubmit(actionRemarks: string | null) {
    setFormError(null);
    setSaving(true);
    try {
      const saved = await saveDraft();
      const action =
        saved.status === "RETURNED_TO_BRANCH_MAKER" ? "RESUBMIT" : "SUBMIT";
      const result = await performItemRequestAction(saved.id, {
        action,
        remarks: actionRemarks,
        expectedVersion: saved.version,
      });
      if (!result.ok) {
        throw new Error(result.error);
      }
      setSubmitDialogOpen(false);
      router.push(`/requests/item-requests/${result.data.id}`);
    } catch (error) {
      setSaving(false);
      throw error;
    }
  }

  if (!canAccessItemRequests) {
    return (
      <section className="w-full max-w-4xl">
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

  return (
    <section className="w-full max-w-4xl">
      <div className="mb-6">
        <Link
          href="/requests/item-requests"
          className="text-sm font-medium text-accent hover:text-accent-dark hover:underline"
        >
          Back to Item Requests
        </Link>
        <h1
          className="mt-3 text-3xl font-semibold tracking-tight text-ink"
        >
          {mode === "create" ? "New Request" : "Edit Request"}
        </h1>
      </div>

      {loading ? (
        <p className="text-sm text-ink-muted">Loading request form…</p>
      ) : loadError ? (
        <p className="border-l-2 border-danger pl-3 text-sm text-danger">
          {loadError}
        </p>
      ) : (
        <form onSubmit={(event) => void handleSaveDraft(event)} className="flex flex-col gap-5">
          {formError ? (
            <p
              className="border-l-2 border-danger pl-3 text-sm text-danger"
              role="alert"
            >
              {formError}
            </p>
          ) : null}

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">Requested By</span>
            {requestedByReadOnly ? (
              <input
                readOnly
                value={employeeDisplayName(requestedByEmployee)}
                className="rounded-md border border-border bg-paper px-3 py-2 text-ink-muted"
              />
            ) : (
              <ItemRequestEmployeeSelect
                value={requestedByEmployee}
                disabled={saving}
                onChange={setRequestedByEmployee}
              />
            )}
            {requestedByEmployee ? (
              <span className="text-xs text-ink-muted">
                Branch: {requestedByEmployee.branch.branchCode} —{" "}
                {requestedByEmployee.branch.branchName}
                {requestedByBranchDiffers
                  ? " (different from Request To Store)"
                  : ""}
              </span>
            ) : (
              <span className="text-xs text-ink-muted">
                Employee on whose behalf this request is made
              </span>
            )}
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">Department</span>
            <input
              readOnly
              value={departmentDisplayName(requestedByEmployee?.department)}
              className="rounded-md border border-border bg-paper px-3 py-2 text-ink-muted"
            />
            <span className="text-xs text-ink-muted">
              Taken from the selected employee
            </span>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">Request From Store</span>
            <ItemRequestStoreSelect
              value={sourceStoreId}
              selectedStore={sourceStore ?? existing?.sourceStore ?? null}
              excludeStoreId={destinationStoreId || undefined}
              disabled={saving}
              placeholder="Select supplying store"
              onChange={(nextValue, store) => {
                setSourceStoreId(nextValue);
                setSourceStore(store);
              }}
            />
            <span className="text-xs text-ink-muted">
              Store that will supply the items
            </span>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">Request To Store</span>
            {destinationReadOnly ? (
              <input
                readOnly
                value={storeDisplayName(destinationStore)}
                className="rounded-md border border-border bg-paper px-3 py-2 text-ink-muted"
              />
            ) : (
              <SearchableSelect
                value={destinationStoreId}
                disabled={saving}
                placeholder="Select receiving store"
                searchPlaceholder="Search stores…"
                options={destinationStoreOptions.map((store) => ({
                  value: store.id,
                  label: storeOptionLabel(store),
                  disabled: store.id === sourceStoreId,
                }))}
                onChange={(nextValue) => {
                  setDestinationStoreId(nextValue);
                  if (nextValue === sourceStoreId) {
                    setSourceStoreId("");
                    setSourceStore(null);
                  }
                }}
              />
            )}
            <span className="text-xs text-ink-muted">
              Store that will receive the items
            </span>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">Remarks (optional)</span>
            <textarea
              value={remarks}
              onChange={(event) => setRemarks(event.target.value)}
              rows={3}
              maxLength={500}
              disabled={saving}
              className="rounded-lg border border-border bg-paper-elevated px-3 py-2 outline-none transition focus:border-accent-mid focus:ring-2 focus:ring-accent/20"
            />
          </label>

          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-muted">
                Requested items
              </h2>
              <button
                type="button"
                onClick={addLine}
                disabled={saving}
                className="rounded-md border border-border px-3 py-1.5 text-sm disabled:opacity-60"
              >
                Add Item
              </button>
            </div>

            {existing?.lines.some(
              (line) => !line.item.isActive || !line.item.isRequestable,
            ) ? (
              <p className="border-l-2 border-warning pl-3 text-sm text-warning">
                One or more saved items are inactive or no longer requestable.
                Replace them before submitting.
              </p>
            ) : null}

            {sourceStoreId ? (
              <p className="text-xs text-ink-muted">
                Available stock is the Request From Store balance and is not
                reserved when this request is saved.
              </p>
            ) : (
              <p className="text-xs text-ink-muted">
                Select Request From Store to load available stock for each item.
              </p>
            )}

            {lines.map((line) => {
              const selected = allItemOptions.find(
                (item) => item.id === line.itemId,
              );
              return (
                <div
                  key={line.key}
                  className="grid gap-3 rounded-md border border-border bg-paper-elevated p-3 sm:grid-cols-[minmax(0,1fr)_8rem_9rem_auto]"
                >
                  <label className="flex min-w-0 flex-col gap-1 text-sm">
                    <span className="font-medium text-ink">Item</span>
                    <SearchableSelect
                      value={line.itemId}
                      disabled={saving}
                      placeholder="Select an item"
                      searchPlaceholder="Search items…"
                      options={allItemOptions.map((item) => ({
                        value: item.id,
                        label: itemOptionLabel(item),
                        disabled:
                          selectedItemIds.has(item.id) &&
                          item.id !== line.itemId,
                      }))}
                      onChange={(nextValue) =>
                        updateLine(line.key, { itemId: nextValue })
                      }
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="font-medium text-ink">Unit</span>
                    <input
                      readOnly
                      value={selected?.unit.unitName ?? ""}
                      className="rounded-md border border-border bg-paper px-3 py-2 text-ink-muted"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="font-medium text-ink">Available stock</span>
                    <input
                      readOnly
                      value={
                        selected
                          ? formatAvailableStockQuantity(
                              selected.availableStockQuantity,
                              selected.unit.unitName,
                            )
                          : ""
                      }
                      className="rounded-md border border-border bg-paper px-3 py-2 text-ink-muted"
                    />
                  </label>
                  <div className="flex gap-2 sm:items-end">
                    <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
                      <span className="font-medium text-ink">Quantity</span>
                      <input
                        value={line.requestedQuantity}
                        disabled={saving}
                        onChange={(event) =>
                          updateLine(line.key, {
                            requestedQuantity: event.target.value,
                          })
                        }
                        inputMode="decimal"
                        className="rounded-lg border border-border bg-paper-elevated px-3 py-2 outline-none transition focus:border-accent-mid focus:ring-2 focus:ring-accent/20"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => removeLine(line.key)}
                      disabled={saving || lines.length === 1}
                      className="h-10 shrink-0 rounded-md border border-border px-3 text-sm disabled:opacity-50"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg border border-accent-tint bg-paper-elevated px-4 py-2 text-sm font-semibold text-accent hover:bg-accent-soft disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save Draft"}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => {
                try {
                  buildPayload();
                  setFormError(null);
                  setSubmitDialogOpen(true);
                } catch (error) {
                  setFormError(
                    error instanceof Error
                      ? error.message
                      : "Fix the request before submitting",
                  );
                }
              }}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-dark disabled:opacity-60"
            >
              Submit Request
            </button>
          </div>
        </form>
      )}

      <ItemRequestActionDialog
        open={submitDialogOpen}
        action={existing?.status === "RETURNED_TO_BRANCH_MAKER" ? "RESUBMIT" : "SUBMIT"}
        saving={saving}
        onClose={() => {
          if (!saving) {
            setSubmitDialogOpen(false);
          }
        }}
        onConfirm={handleConfirmedSubmit}
      />
    </section>
  );
}

async function loadAllEligibleItems(sourceStoreId: string) {
  const allItems: EligibleItemRequestItem[] = [];
  for (let page = 1; page <= 50; page += 1) {
    const result = await fetchEligibleItemRequestItems({
      page,
      pageSize: 100,
      sourceStoreId,
    });
    if (!result.ok) {
      return result;
    }
    allItems.push(...result.data.items);
    if (result.data.totalPages === 0 || page >= result.data.totalPages) {
      return { ok: true as const, data: allItems };
    }
  }
  return { ok: true as const, data: allItems };
}
