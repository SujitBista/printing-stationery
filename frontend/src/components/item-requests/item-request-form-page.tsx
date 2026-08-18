"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  createItemRequestInputSchema,
  type EligibleItemRequestItem,
  type ItemRequest,
  type ItemRequestContext,
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
import { ItemRequestActionDialog } from "./item-request-action-dialog";

type LineState = {
  key: string;
  itemId: string;
  requestedQuantity: string;
};

type ItemRequestFormPageProps = {
  mode: "create" | "edit";
  requestId?: string;
};

function storeLabel(
  store: ItemRequestContext["requestingStore"] | ItemRequest["requestingStore"],
): string {
  if (!store) {
    return "Not assigned";
  }
  return `${store.storeCode} — ${store.storeName} (${store.branch.branchName})`;
}

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
  const { canAccessItemRequests } = useAuth();
  const [context, setContext] = useState<ItemRequestContext | null>(null);
  const [existing, setExisting] = useState<ItemRequest | null>(null);
  const [eligibleItems, setEligibleItems] = useState<EligibleItemRequestItem[]>(
    [],
  );
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

      const [contextResult, itemsPages, existingResult] = await Promise.all([
        fetchItemRequestContext(),
        loadAllEligibleItems(),
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

      if (itemsPages.ok) {
        setEligibleItems(itemsPages.data);
      }

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
        setLines(
          existingResult.data.lines.map((line) => ({
            key: line.id,
            itemId: line.itemId,
            requestedQuantity: line.requestedQuantity,
          })),
        );
      } else if (!contextResult.data.canCreate) {
        setLoadError(
          "You can create a request only when you are the active maker of a branch store.",
        );
      }

      setLoading(false);
    }

    if (canAccessItemRequests) {
      void load();
    } else {
      setLoading(false);
    }
  }, [canAccessItemRequests, mode, requestId]);

  const selectedItemIds = useMemo(
    () => new Set(lines.map((line) => line.itemId).filter(Boolean)),
    [lines],
  );

  const historicalItems = useMemo(() => {
    if (!existing) {
      return [];
    }
    return existing.lines
      .filter(
        (line) =>
          !eligibleItems.some((item) => item.id === line.itemId),
      )
      .map((line) => ({
        id: line.itemId,
        itemCode: line.item.itemCode,
        itemName: line.item.itemName,
        unit: line.item.unit,
      }));
  }, [eligibleItems, existing]);

  const allItemOptions = useMemo(
    () => [...historicalItems, ...eligibleItems],
    [eligibleItems, historicalItems],
  );

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
    const payload = {
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

  const requestingStore =
    existing?.requestingStore ?? context?.requestingStore ?? null;
  const corporateStore =
    existing?.corporateStore ?? context?.corporateStore ?? null;

  return (
    <section className="w-full max-w-4xl">
      <div className="mb-6">
        <Link
          href="/requests/item-requests"
          className="text-sm text-accent hover:underline"
        >
          Back to Item Requests
        </Link>
        <h1
          className="mt-3 text-3xl font-semibold tracking-tight text-ink"
          style={{ fontFamily: "var(--font-display)" }}
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
            <span className="font-medium text-ink">Requesting store</span>
            <input
              readOnly
              value={storeLabel(requestingStore)}
              className="rounded-md border border-border bg-paper px-3 py-2 text-ink-muted"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">Corporate store</span>
            <input
              readOnly
              value={
                corporateStore
                  ? storeLabel(corporateStore)
                  : "Determined automatically when recommended"
              }
              className="rounded-md border border-border bg-paper px-3 py-2 text-ink-muted"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">Remarks (optional)</span>
            <textarea
              value={remarks}
              onChange={(event) => setRemarks(event.target.value)}
              rows={3}
              maxLength={500}
              disabled={saving}
              className="rounded-md border border-border bg-paper-elevated px-3 py-2 outline-none focus:ring-2 focus:ring-accent/30"
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

            {lines.map((line) => {
              const selected = allItemOptions.find(
                (item) => item.id === line.itemId,
              );
              return (
                <div
                  key={line.key}
                  className="grid gap-3 rounded-md border border-border bg-paper-elevated p-3 sm:grid-cols-[minmax(0,1fr)_8rem_auto]"
                >
                  <label className="flex min-w-0 flex-col gap-1 text-sm">
                    <span className="font-medium text-ink">Item</span>
                    <select
                      value={line.itemId}
                      disabled={saving}
                      onChange={(event) =>
                        updateLine(line.key, { itemId: event.target.value })
                      }
                      className="rounded-md border border-border bg-paper px-3 py-2 outline-none focus:ring-2 focus:ring-accent/30"
                    >
                      <option value="">Select an item</option>
                      {allItemOptions.map((item) => (
                        <option
                          key={item.id}
                          value={item.id}
                          disabled={
                            selectedItemIds.has(item.id) &&
                            item.id !== line.itemId
                          }
                        >
                          {itemOptionLabel(item)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="font-medium text-ink">Unit</span>
                    <input
                      readOnly
                      value={selected?.unit.unitName ?? ""}
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
                        className="rounded-md border border-border bg-paper px-3 py-2 outline-none focus:ring-2 focus:ring-accent/30"
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
              className="rounded-md border border-border px-4 py-2 text-sm disabled:opacity-60"
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
              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-60"
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

async function loadAllEligibleItems() {
  const allItems: EligibleItemRequestItem[] = [];
  for (let page = 1; page <= 50; page += 1) {
    const result = await fetchEligibleItemRequestItems({
      page,
      pageSize: 100,
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