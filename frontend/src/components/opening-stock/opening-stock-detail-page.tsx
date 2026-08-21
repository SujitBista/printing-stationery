"use client";

import { useParams, useRouter } from "next/navigation";
import { memo, useEffect, useMemo, useState } from "react";
import type {
  Item,
  OpeningStockBatchLine,
  OpeningStockMappingStatus,
  OpeningStockPreview,
  Store,
  Unit,
} from "@printing-stationery/shared";
import { fetchItems } from "@/lib/api/items";
import {
  cancelOpeningStock,
  fetchOpeningStockBatch,
  postOpeningStock,
  updateOpeningStockMappings,
  validateOpeningStock,
} from "@/lib/api/opening-stock";
import { fetchStores } from "@/lib/api/stores";
import { fetchUnits } from "@/lib/api/units";
import { loadAllPaginatedOptions } from "@/lib/api/load-paginated-options";
import { useAuth } from "@/lib/auth/auth-context";

const ITEM_MATCH_COLUMN_HELP =
  "Shows whether each imported store, item, and unit name is linked to master data already set up in this system. Only matched items can be posted.";

const POSTING_STATUS_COLUMN_HELP =
  "Shows whether this row is ready to become opening stock. “Ready to post” means there are no blocking issues for this item.";

type LinePendingUpdate = {
  storeId?: string | null;
  itemId?: string | null;
  unitId?: string | null;
  isIncludedForPosting?: boolean;
};

const MAPPING_STATUS_HELP: Record<
  OpeningStockMappingStatus,
  { label: string; description: string; tone: "success" | "warning" | "danger" }
> = {
  MAPPED: {
    label: "Matched",
    description:
      "Legacy store, item, and unit names are linked to master data in this system. This row is ready if posting status is also clear.",
    tone: "success",
  },
  UNMAPPED_STORE: {
    label: "Store not matched",
    description:
      "No matching store was found in Store Setup. Choose the correct store from the dropdown.",
    tone: "danger",
  },
  UNMAPPED_ITEM: {
    label: "Item not matched",
    description:
      "No matching item was found in Item Setup. Choose the correct item from the dropdown.",
    tone: "danger",
  },
  UNMAPPED_UNIT: {
    label: "Unit not matched",
    description:
      "No matching unit was found in Unit Setup. Choose the correct unit from the dropdown.",
    tone: "danger",
  },
  UNIT_MISMATCH: {
    label: "Unit mismatch",
    description:
      "The selected unit does not match the unit on the selected item in Item Setup. Fix the item or unit mapping.",
    tone: "danger",
  },
  AMBIGUOUS_STORE: {
    label: "Store needs choice",
    description:
      "More than one store could match this legacy name. Choose the correct store from the dropdown.",
    tone: "warning",
  },
  AMBIGUOUS_ITEM: {
    label: "Item needs choice",
    description:
      "More than one item could match this legacy name. Choose the correct item from the dropdown.",
    tone: "warning",
  },
  AMBIGUOUS_UNIT: {
    label: "Unit needs choice",
    description:
      "More than one unit could match this legacy name. Choose the correct unit from the dropdown.",
    tone: "warning",
  },
  INVALID: {
    label: "Needs review",
    description:
      "This row has an invalid match and cannot be posted until store, item, and unit are corrected.",
    tone: "danger",
  },
};

function mappingToneClass(tone: "success" | "warning" | "danger"): string {
  if (tone === "success") {
    return "text-success";
  }
  if (tone === "warning") {
    return "text-warning";
  }
  return "text-danger";
}

function isInTransitWarning(message: string): boolean {
  return /in transit/i.test(message);
}

function LoadingSpinner({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <span
      className={`inline-block animate-spin rounded-full border-2 border-current border-r-transparent ${className}`}
      aria-hidden="true"
    />
  );
}

function ensureSavingOverlay(): HTMLElement {
  let overlay = document.getElementById("opening-stock-saving-overlay");
  if (overlay) {
    return overlay;
  }
  overlay = document.createElement("div");
  overlay.id = "opening-stock-saving-overlay";
  overlay.setAttribute("role", "status");
  overlay.setAttribute("aria-live", "assertive");
  overlay.style.cssText =
    "position:fixed;inset-inline:0;top:0;z-index:2147483647;display:none;align-items:center;gap:0.75rem;padding:0.75rem 1rem;border-bottom:1px solid rgba(180,120,0,0.35);background:rgba(255,244,214,0.98);color:#1a1a1a;font:600 14px/1.4 system-ui,sans-serif;box-shadow:0 1px 4px rgba(0,0,0,0.08);pointer-events:none;";
  const spinner = document.createElement("span");
  spinner.dataset.spinner = "true";
  spinner.style.cssText =
    "width:1.1rem;height:1.1rem;border:2px solid currentColor;border-right-color:transparent;border-radius:9999px;display:inline-block;animation:opening-stock-spin 0.7s linear infinite;flex:0 0 auto;";
  const text = document.createElement("span");
  text.dataset.label = "true";
  overlay.append(spinner, text);
  if (!document.getElementById("opening-stock-saving-style")) {
    const style = document.createElement("style");
    style.id = "opening-stock-saving-style";
    style.textContent =
      "@keyframes opening-stock-spin{to{transform:rotate(360deg)}}";
    document.head.append(style);
  }
  document.body.append(overlay);
  return overlay;
}

function showImmediateSavingOverlay(label: string): void {
  const overlay = ensureSavingOverlay();
  const text = overlay.querySelector("[data-label='true']");
  if (text) {
    text.textContent = label;
  }
  overlay.style.display = "flex";
  document.body.style.cursor = "wait";
  // Force the browser to paint the overlay before continuing heavy work.
  void overlay.offsetHeight;
}

function hideImmediateSavingOverlay(): void {
  const overlay = document.getElementById("opening-stock-saving-overlay");
  if (overlay) {
    overlay.style.display = "none";
  }
  document.body.style.cursor = "";
}

const MappingSelect = memo(function MappingSelect({
  value,
  disabled,
  loading,
  placeholder,
  savingMessage,
  options,
  onChange,
}: {
  value: string;
  disabled: boolean;
  loading?: boolean;
  placeholder: string;
  savingMessage: string;
  options: Array<{ id: string; label: string }>;
  onChange: (value: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const selected = options.find((option) => option.id === value);

  return (
    <div className="mt-2 flex items-center gap-2">
      <select
        value={value}
        disabled={disabled}
        aria-busy={loading || undefined}
        onFocus={() => setExpanded(true)}
        onBlur={() => setExpanded(false)}
        onChange={(event) => {
          const nextValue = event.target.value;
          // Show loading in the same event tick, before React/table work.
          showImmediateSavingOverlay(savingMessage);
          onChange(nextValue);
          // Collapse options after this tick so removing thousands of <option>s
          // does not delay the loading overlay paint.
          queueMicrotask(() => setExpanded(false));
        }}
        className="w-full max-w-56 rounded-md border border-border bg-paper px-2 py-1 text-xs disabled:cursor-wait disabled:opacity-60"
      >
        <option value="">{placeholder}</option>
        {!expanded && selected ? (
          <option value={selected.id}>{selected.label}</option>
        ) : null}
        {expanded
          ? options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))
          : null}
      </select>
      {loading ? <LoadingSpinner className="h-3.5 w-3.5 shrink-0 text-warning" /> : null}
    </div>
  );
});

function applyPending(
  line: OpeningStockBatchLine,
  pending: LinePendingUpdate | undefined,
): OpeningStockBatchLine {
  if (!pending) {
    return line;
  }
  return {
    ...line,
    storeId: pending.storeId !== undefined ? pending.storeId : line.storeId,
    itemId: pending.itemId !== undefined ? pending.itemId : line.itemId,
    unitId: pending.unitId !== undefined ? pending.unitId : line.unitId,
    isIncludedForPosting:
      pending.isIncludedForPosting !== undefined
        ? pending.isIncludedForPosting
        : line.isIncludedForPosting,
  };
}

export function OpeningStockDetailPage() {
  const { canAccessOpeningStock } = useAuth();
  const params = useParams<{ id: string | string[] }>();
  const router = useRouter();
  const batchId = Array.isArray(params.id) ? params.id[0] ?? "" : params.id ?? "";
  const [preview, setPreview] = useState<OpeningStockPreview | null>(null);
  const [stores, setStores] = useState<Store[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savingLineId, setSavingLineId] = useState<string | null>(null);
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [pendingByLineId, setPendingByLineId] = useState<Record<string, LinePendingUpdate>>({});

  useEffect(() => {
    ensureSavingOverlay();
  }, []);

  useEffect(() => {
    if (!canAccessOpeningStock) {
      setLoading(false);
      return;
    }
    void (async () => {
      const [previewResult, storeResult, itemResult, unitResult] = await Promise.all([
        fetchOpeningStockBatch(batchId),
        loadAllPaginatedOptions(fetchStores, "ALL"),
        loadAllPaginatedOptions(fetchItems, "ALL"),
        loadAllPaginatedOptions(fetchUnits, "ALL"),
      ]);
      if (!previewResult.ok) {
        setError(previewResult.error);
      } else {
        setPreview(previewResult.data);
      }
      if (storeResult.ok) setStores(storeResult.data);
      if (itemResult.ok) setItems(itemResult.data);
      if (unitResult.ok) setUnits(unitResult.data);
      setLoading(false);
    })();
  }, [batchId, canAccessOpeningStock]);

  const editable = preview?.batch.status !== "POSTED" && preview?.batch.status !== "CANCELLED";
  const problemLines = useMemo(
    () =>
      preview?.lines.filter(
        (line) => line.mappingStatus !== "MAPPED" || line.validationErrors.length > 0,
      ) ?? [],
    [preview],
  );
  const displayWarnings = useMemo(() => {
    if (!preview) {
      return [];
    }
    const warnings: string[] = [];
    if (preview.summary.inTransitRowCount > 0) {
      warnings.push(
        `${preview.summary.inTransitRowCount} items are in transit. They will not be included in opening stock and must be imported separately.`,
      );
    }
    for (const message of preview.summary.warningMessages) {
      if (!isInTransitWarning(message)) {
        warnings.push(message);
      }
    }
    return warnings;
  }, [preview]);

  const storeOptions = useMemo(
    () =>
      stores.map((store) => ({
        id: store.id,
        label: `${store.storeCode} - ${store.storeName}`,
      })),
    [stores],
  );
  const itemOptions = useMemo(
    () =>
      items.map((item) => ({
        id: item.id,
        label: `${item.itemCode} - ${item.itemName}`,
      })),
    [items],
  );
  const unitOptions = useMemo(
    () =>
      units.map((unit) => ({
        id: unit.id,
        label: unit.unitName,
      })),
    [units],
  );

  async function saveLineMapping(
    line: OpeningStockBatchLine,
    update: LinePendingUpdate,
    label = "Saving match…",
  ) {
    const nextPending: LinePendingUpdate = {
      ...pendingByLineId[line.id],
      ...update,
    };
    const storeId = nextPending.storeId !== undefined ? nextPending.storeId : line.storeId;
    const itemId = nextPending.itemId !== undefined ? nextPending.itemId : line.itemId;
    const unitId = nextPending.unitId !== undefined ? nextPending.unitId : line.unitId;
    const includeInPosting =
      nextPending.isIncludedForPosting !== undefined
        ? nextPending.isIncludedForPosting
        : line.isIncludedForPosting;

    // Overlay should already be visible from the select onChange; keep/refresh it.
    showImmediateSavingOverlay(label);

    // Start the network request immediately — do not wait for React to re-render.
    const apiPromise = updateOpeningStockMappings(batchId, {
      mappings: [
        {
          lineId: line.id,
          storeId,
          itemId,
          unitId,
          includeInPosting,
        },
      ],
    });

    // Defer React state updates so the overlay can paint first.
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        setSavingLineId(line.id);
        setSaveFeedback(label);
        setError(null);
        setPendingByLineId((current) => ({
          ...current,
          [line.id]: nextPending,
        }));
        requestAnimationFrame(() => resolve());
      });
    });

    try {
      const result = await apiPromise;

      if (!result.ok) {
        setSavingLineId(null);
        setError(result.error);
        setSaveFeedback(null);
        setPendingByLineId((current) => {
          const next = { ...current };
          delete next[line.id];
          return next;
        });
        hideImmediateSavingOverlay();
        const refreshed = await fetchOpeningStockBatch(batchId);
        if (refreshed.ok) {
          setPreview(refreshed.data);
        }
        return;
      }

      setPreview(result.data);
      setPendingByLineId((current) => {
        const next = { ...current };
        delete next[line.id];
        return next;
      });
      setSavingLineId(null);
      setSaveFeedback("Match saved.");
    } finally {
      hideImmediateSavingOverlay();
    }
  }

  if (!canAccessOpeningStock) {
    return (
      <section className="w-full max-w-7xl">
        <p className="text-danger">You do not have access to Opening Stock.</p>
      </section>
    );
  }

  if (loading) {
    return (
      <section className="w-full max-w-7xl">
        <p className="text-sm text-ink-muted">Loading opening-stock batch…</p>
      </section>
    );
  }

  if (!preview) {
    return (
      <section className="w-full max-w-7xl">
        <p className="text-danger">{error ?? "Unable to load opening-stock batch."}</p>
      </section>
    );
  }

  return (
    <section className="w-full max-w-7xl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1
            className="text-3xl font-semibold tracking-tight text-ink"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Opening Stock Batch No. {preview.batch.batchNumber}
          </h1>
          <p className="mt-2 max-w-3xl text-ink-muted">
            {preview.summary.reportTitle ?? "Opening stock batch"} · Cutover{" "}
            {preview.batch.cutoverDate}
          </p>
        </div>
        <button
          type="button"
          onClick={() => router.push("/stock/opening-stock")}
          className="rounded-md border border-border px-3 py-2 text-sm"
        >
          Back to list
        </button>
      </div>

      {error ? (
        <p className="mt-4 border-l-2 border-danger pl-3 text-sm text-danger">{error}</p>
      ) : null}
      {validationMessage ? (
        <p className="mt-4 border-l-2 border-success pl-3 text-sm text-success">
          {validationMessage}
        </p>
      ) : null}
      {saveFeedback && !savingLineId && !saving ? (
        <p
          className="mt-4 border-l-2 border-success pl-3 text-sm text-success"
          aria-live="polite"
        >
          {saveFeedback}
        </p>
      ) : null}

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="rounded-md border border-border bg-paper-elevated p-4">
          <h2 className="font-semibold text-ink">Summary</h2>
          <dl className="mt-3 space-y-2 text-sm text-ink-muted">
            <div>
              <dt className="font-medium text-ink">Total imported items</dt>
              <dd>{preview.summary.totalDetailRowCount}</dd>
            </div>
            <div>
              <dt className="font-medium text-ink">Stores</dt>
              <dd>{preview.summary.totalStoreCount}</dd>
            </div>
            <div>
              <dt className="font-medium text-ink" title={ITEM_MATCH_COLUMN_HELP}>
                Items matched
              </dt>
              <dd title={ITEM_MATCH_COLUMN_HELP}>{preview.summary.mappedRowCount}</dd>
            </div>
            <div>
              <dt className="font-medium text-ink">Items currently in transit</dt>
              <dd>{preview.summary.inTransitRowCount}</dd>
            </div>
            <div>
              <dt className="font-medium text-ink">Items with no remaining stock</dt>
              <dd>{preview.summary.zeroClosingRowCount}</dd>
            </div>
            <div>
              <dt className="font-medium text-ink">Items requiring correction</dt>
              <dd>{preview.summary.negativeClosingRowCount}</dd>
            </div>
          </dl>
          <details className="mt-4 border-t border-border pt-3">
            <summary className="cursor-pointer text-sm font-medium text-ink">
              Technical details
            </summary>
            <dl className="mt-3 space-y-2 text-sm text-ink-muted">
              <div>
                <dt className="font-medium text-ink">Source file</dt>
                <dd>{preview.summary.sourceFilename ?? "Manual batch"}</dd>
              </div>
              <div>
                <dt className="font-medium text-ink">File hash</dt>
                <dd className="break-all">{preview.summary.sourceFileHash ?? "N/A"}</dd>
              </div>
            </dl>
          </details>
        </div>

        <div className="rounded-md border border-border bg-paper-elevated p-4 lg:col-span-2">
          <h2 className="font-semibold text-ink">Warnings</h2>
          {displayWarnings.length > 0 ? (
            <ul className="mt-3 space-y-2 text-sm text-ink-muted">
              {displayWarnings.map((message) => (
                <li key={message} className="border-l-2 border-warning pl-3">
                  {message}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-ink-muted">No warnings for this batch.</p>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={saving || Boolean(savingLineId) || !editable}
              className="rounded-md border border-border px-3 py-2 text-sm disabled:opacity-60"
              onClick={async () => {
                showImmediateSavingOverlay("Checking matches…");
                setSaving(true);
                setSaveFeedback("Checking matches…");
                try {
                  const result = await validateOpeningStock(batchId);
                  if (!result.ok) {
                    setError(result.error);
                    setSaveFeedback(null);
                    return;
                  }
                  setValidationMessage(
                    result.data.canPost
                      ? "Validation passed. Batch is ready to post."
                      : "Validation found blocking issues.",
                  );
                  setSaveFeedback(null);
                  const refreshed = await fetchOpeningStockBatch(batchId);
                  if (refreshed.ok) {
                    setPreview(refreshed.data);
                  }
                } finally {
                  setSaving(false);
                  hideImmediateSavingOverlay();
                }
              }}
            >
              {saving ? (
                <span className="inline-flex items-center gap-2">
                  <LoadingSpinner className="h-3.5 w-3.5" />
                  Checking…
                </span>
              ) : (
                "Validate"
              )}
            </button>
            <button
              type="button"
              disabled={saving || Boolean(savingLineId) || !editable}
              className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
              onClick={async () => {
                showImmediateSavingOverlay("Posting opening stock…");
                setSaving(true);
                setSaveFeedback("Posting opening stock…");
                try {
                  const result = await postOpeningStock(batchId, {
                    confirmHistoricalCutover: true,
                  });
                  if (!result.ok) {
                    setError(result.error);
                    setSaveFeedback(null);
                    return;
                  }
                  setValidationMessage(
                    `Posted ${result.data.postedLedgerLineCount} ledger lines.`,
                  );
                  setSaveFeedback(null);
                  const refreshed = await fetchOpeningStockBatch(batchId);
                  if (refreshed.ok) {
                    setPreview(refreshed.data);
                  }
                } finally {
                  setSaving(false);
                  hideImmediateSavingOverlay();
                }
              }}
            >
              Post Opening Stock
            </button>
            <button
              type="button"
              disabled={saving || Boolean(savingLineId) || !editable}
              className="rounded-md border border-danger px-3 py-2 text-sm text-danger disabled:opacity-60"
              onClick={async () => {
                showImmediateSavingOverlay("Discarding import…");
                setSaving(true);
                setSaveFeedback("Discarding import…");
                try {
                  const result = await cancelOpeningStock(batchId, {
                    remarks: "Cancelled from UI",
                  });
                  if (!result.ok) {
                    setError(result.error);
                    setSaveFeedback(null);
                    return;
                  }
                  setPreview(result.data);
                  setSaveFeedback(null);
                } finally {
                  setSaving(false);
                  hideImmediateSavingOverlay();
                }
              }}
            >
              Discard Import
            </button>
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-md border border-warning/30 bg-warning/5 p-4 text-sm text-ink-muted">
        <p className="font-medium text-warning">Posting confirmation</p>
        <p className="mt-2">
          This will create the starting stock balances in the new system. After posting, this
          opening stock cannot be edited or posted again.
        </p>
      </div>

      <div
        className={`mt-6 overflow-x-auto rounded-md border border-border bg-paper-elevated ${
          savingLineId ? "cursor-wait" : ""
        }`}
        style={savingLineId ? { pointerEvents: "none" } : undefined}
      >
        <table className="min-w-[120rem] w-full text-left text-sm">
          <thead className="border-b border-border bg-paper text-xs uppercase tracking-wider text-ink-muted">
            <tr>
              <th className="px-3 py-2 font-semibold">Store</th>
              <th className="px-3 py-2 font-semibold">Category</th>
              <th className="px-3 py-2 font-semibold">Item</th>
              <th className="px-3 py-2 font-semibold">Unit</th>
              <th className="px-3 py-2 font-semibold">Unit Rate</th>
              <th className="px-3 py-2 font-semibold">Old Opening Qty</th>
              <th className="px-3 py-2 font-semibold">Purchase</th>
              <th className="px-3 py-2 font-semibold">Received</th>
              <th className="px-3 py-2 font-semibold">Consumption</th>
              <th className="px-3 py-2 font-semibold">Transfer</th>
              <th className="px-3 py-2 font-semibold">In Transit</th>
              <th className="px-3 py-2 font-semibold">Opening Qty for New System</th>
              <th className="px-3 py-2 font-semibold">Opening stock amount</th>
              <th className="px-3 py-2 font-semibold">
                <span
                  className="cursor-help border-b border-dotted border-ink-muted"
                  title={ITEM_MATCH_COLUMN_HELP}
                >
                  Item Match
                </span>
              </th>
              <th className="px-3 py-2 font-semibold">
                <span
                  className="cursor-help border-b border-dotted border-ink-muted"
                  title={POSTING_STATUS_COLUMN_HELP}
                >
                  Posting Status
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {preview.lines.map((line) => {
              const displayLine = applyPending(line, pendingByLineId[line.id]);
              const rowSaving = savingLineId === line.id;
              return (
                <tr
                  key={line.id}
                  className={`border-b border-border align-top last:border-b-0 ${
                    rowSaving ? "bg-warning/10 ring-1 ring-inset ring-warning/30" : ""
                  }`}
                >
                  <td className="px-3 py-3">
                    <div className="font-medium">{displayLine.legacyStoreName}</div>
                    {editable ? (
                      <MappingSelect
                        value={displayLine.storeId ?? ""}
                        disabled={rowSaving}
                        loading={rowSaving}
                        placeholder="Map store"
                        savingMessage="Saving store match…"
                        options={storeOptions}
                        onChange={(value) =>
                          void saveLineMapping(
                            line,
                            { storeId: value || null },
                            "Saving store match…",
                          )
                        }
                      />
                    ) : null}
                    {rowSaving ? (
                      <p className="mt-1 inline-flex items-center gap-1.5 text-xs font-medium text-warning">
                        <LoadingSpinner className="h-3 w-3" />
                        Please wait…
                      </p>
                    ) : null}
                  </td>
                  <td className="px-3 py-3">{displayLine.legacyCategoryName}</td>
                  <td className="px-3 py-3">
                    <div className="font-medium">{displayLine.legacyItemName}</div>
                    {editable ? (
                      <MappingSelect
                        value={displayLine.itemId ?? ""}
                        disabled={rowSaving}
                        loading={rowSaving}
                        placeholder="Map item"
                        savingMessage="Saving item match…"
                        options={itemOptions}
                        onChange={(value) => {
                          const selectedItem = items.find((item) => item.id === value);
                          void saveLineMapping(
                            line,
                            {
                              itemId: value || null,
                              unitId: selectedItem?.unit.id ?? line.unitId,
                            },
                            "Saving item match…",
                          );
                        }}
                      />
                    ) : null}
                  </td>
                  <td className="px-3 py-3">
                    <div className="font-medium">{displayLine.legacyUnitName}</div>
                    {editable ? (
                      <MappingSelect
                        value={displayLine.unitId ?? ""}
                        disabled={rowSaving}
                        loading={rowSaving}
                        placeholder="Map unit"
                        savingMessage="Saving unit match…"
                        options={unitOptions}
                        onChange={(value) =>
                          void saveLineMapping(
                            line,
                            { unitId: value || null },
                            "Saving unit match…",
                          )
                        }
                      />
                    ) : null}
                  </td>
                  <td className="px-3 py-3">{displayLine.itemRate}</td>
                  <td className="px-3 py-3">{displayLine.openingQuantity}</td>
                  <td className="px-3 py-3">{displayLine.purchaseQuantity}</td>
                  <td className="px-3 py-3">{displayLine.receivedQuantity}</td>
                  <td className="px-3 py-3">{displayLine.consumptionQuantity}</td>
                  <td className="px-3 py-3">{displayLine.transferQuantity}</td>
                  <td className="px-3 py-3">{displayLine.inTransitQuantity}</td>
                  <td className="px-3 py-3">
                    <div>{displayLine.closingQuantity}</div>
                    {editable ? (
                      <label className="mt-2 flex items-center gap-2 text-xs text-ink-muted">
                        <input
                          type="checkbox"
                          checked={displayLine.isIncludedForPosting}
                          disabled={rowSaving}
                          onChange={(event) =>
                            void saveLineMapping(
                              line,
                              {
                                isIncludedForPosting: event.target.checked,
                              },
                              "Saving include setting…",
                            )
                          }
                        />
                        Include
                      </label>
                    ) : null}
                  </td>
                  <td className="px-3 py-3">{displayLine.closingAmount}</td>
                  <td className="px-3 py-3">
                    {(() => {
                      const mapping = MAPPING_STATUS_HELP[displayLine.mappingStatus];
                      return (
                        <span
                          className={`cursor-help font-medium ${mappingToneClass(mapping.tone)}`}
                          title={mapping.description}
                        >
                          {mapping.label}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="px-3 py-3">
                    {displayLine.validationErrors.length === 0 ? (
                      <span className="text-success" title={POSTING_STATUS_COLUMN_HELP}>
                        Ready to post
                      </span>
                    ) : (
                      <ul className="space-y-1 text-xs text-danger">
                        {displayLine.validationErrors.map((validationError) => (
                          <li key={validationError}>{validationError}</li>
                        ))}
                      </ul>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {problemLines.length > 0 ? (
        <div className="mt-6 rounded-md border border-danger/20 bg-danger/5 p-4 text-sm">
          <p className="font-medium text-danger">Mapping and validation problems</p>
          <p className="mt-2 text-ink-muted">
            {problemLines.length} rows still need review before posting. Use the store, item, and
            unit dropdowns to match any unmatched names, then click Validate again.
          </p>
        </div>
      ) : null}
    </section>
  );
}
