"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type {
  Item,
  OpeningStockBatchLine,
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
  const [validationMessage, setValidationMessage] = useState<string | null>(null);

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
    () => preview?.lines.filter((line) => line.mappingStatus !== "MAPPED" || line.validationErrors.length > 0) ?? [],
    [preview],
  );

  async function saveLineMapping(line: OpeningStockBatchLine, update: Partial<OpeningStockBatchLine>) {
    setSaving(true);
    setError(null);
    const result = await updateOpeningStockMappings(batchId, {
      mappings: [
        {
          lineId: line.id,
          storeId: update.storeId ?? line.storeId,
          itemId: update.itemId ?? line.itemId,
          unitId: update.unitId ?? line.unitId,
          includeInPosting: update.isIncludedForPosting ?? line.isIncludedForPosting,
        },
      ],
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setPreview(result.data);
  }

  if (!canAccessOpeningStock) {
    return <section className="w-full max-w-7xl"><p className="text-danger">You do not have access to Opening Stock.</p></section>;
  }

  if (loading) {
    return <section className="w-full max-w-7xl"><p className="text-sm text-ink-muted">Loading opening-stock batch…</p></section>;
  }

  if (!preview) {
    return <section className="w-full max-w-7xl"><p className="text-danger">{error ?? "Unable to load opening-stock batch."}</p></section>;
  }

  return (
    <section className="w-full max-w-7xl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-ink" style={{ fontFamily: "var(--font-display)" }}>
            {preview.batch.batchNumber}
          </h1>
          <p className="mt-2 max-w-3xl text-ink-muted">
            {preview.summary.reportTitle ?? "Opening stock batch"} · Cutover {preview.batch.cutoverDate}
          </p>
        </div>
        <button type="button" onClick={() => router.push("/stock/opening-stock")} className="rounded-md border border-border px-3 py-2 text-sm">
          Back to list
        </button>
      </div>

      {error ? <p className="mt-4 border-l-2 border-danger pl-3 text-sm text-danger">{error}</p> : null}
      {validationMessage ? <p className="mt-4 border-l-2 border-success pl-3 text-sm text-success">{validationMessage}</p> : null}

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="rounded-md border border-border bg-paper-elevated p-4">
          <h2 className="font-semibold text-ink">Summary</h2>
          <dl className="mt-3 space-y-2 text-sm text-ink-muted">
            <div><dt className="font-medium text-ink">Source file</dt><dd>{preview.summary.sourceFilename ?? "Manual batch"}</dd></div>
            <div><dt className="font-medium text-ink">File hash</dt><dd className="break-all">{preview.summary.sourceFileHash ?? "N/A"}</dd></div>
            <div><dt className="font-medium text-ink">Rows</dt><dd>{preview.summary.totalDetailRowCount}</dd></div>
            <div><dt className="font-medium text-ink">Stores</dt><dd>{preview.summary.totalStoreCount}</dd></div>
            <div><dt className="font-medium text-ink">Mapped rows</dt><dd>{preview.summary.mappedRowCount}</dd></div>
            <div><dt className="font-medium text-ink">In Transit rows</dt><dd>{preview.summary.inTransitRowCount}</dd></div>
            <div><dt className="font-medium text-ink">Zero-closing rows</dt><dd>{preview.summary.zeroClosingRowCount}</dd></div>
            <div><dt className="font-medium text-ink">Negative-closing rows</dt><dd>{preview.summary.negativeClosingRowCount}</dd></div>
          </dl>
        </div>

        <div className="rounded-md border border-border bg-paper-elevated p-4 lg:col-span-2">
          <h2 className="font-semibold text-ink">Warnings</h2>
          <ul className="mt-3 space-y-2 text-sm text-ink-muted">
            {preview.summary.warningMessages.map((message) => (
              <li key={message} className="border-l-2 border-warning pl-3">{message}</li>
            ))}
          </ul>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={saving || !editable}
              className="rounded-md border border-border px-3 py-2 text-sm disabled:opacity-60"
              onClick={async () => {
                setSaving(true);
                const result = await validateOpeningStock(batchId);
                setSaving(false);
                if (!result.ok) {
                  setError(result.error);
                  return;
                }
                setValidationMessage(result.data.canPost ? "Validation passed. Batch is ready to post." : "Validation found blocking issues.");
                const refreshed = await fetchOpeningStockBatch(batchId);
                if (refreshed.ok) {
                  setPreview(refreshed.data);
                }
              }}
            >
              Validate
            </button>
            <button
              type="button"
              disabled={saving || !editable}
              className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
              onClick={async () => {
                setSaving(true);
                const result = await postOpeningStock(batchId, { confirmHistoricalCutover: true });
                setSaving(false);
                if (!result.ok) {
                  setError(result.error);
                  return;
                }
                setValidationMessage(`Posted ${result.data.postedLedgerLineCount} ledger lines.`);
                const refreshed = await fetchOpeningStockBatch(batchId);
                if (refreshed.ok) {
                  setPreview(refreshed.data);
                }
              }}
            >
              Post Batch
            </button>
            <button
              type="button"
              disabled={saving || !editable}
              className="rounded-md border border-danger px-3 py-2 text-sm text-danger disabled:opacity-60"
              onClick={async () => {
                setSaving(true);
                const result = await cancelOpeningStock(batchId, { remarks: "Cancelled from UI" });
                setSaving(false);
                if (!result.ok) {
                  setError(result.error);
                  return;
                }
                setPreview(result.data);
              }}
            >
              Cancel Batch
            </button>
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-md border border-warning/30 bg-warning/5 p-4 text-sm text-ink-muted">
        <p className="font-medium text-warning">Posting confirmation</p>
        <p className="mt-2">Post this opening-stock batch? This will create inventory balances and cannot be edited or posted again.</p>
        <p className="mt-2">Only legacy Closing Stock Qty becomes new-system Opening Stock. In Transit requires a separate migration.</p>
      </div>

      <div className="mt-6 overflow-x-auto rounded-md border border-border bg-paper-elevated">
        <table className="min-w-[120rem] w-full text-left text-sm">
          <thead className="border-b border-border bg-paper text-xs uppercase tracking-wider text-ink-muted">
            <tr>
              <th className="px-3 py-2 font-semibold">Store</th>
              <th className="px-3 py-2 font-semibold">Category</th>
              <th className="px-3 py-2 font-semibold">Item</th>
              <th className="px-3 py-2 font-semibold">Unit</th>
              <th className="px-3 py-2 font-semibold">Rate</th>
              <th className="px-3 py-2 font-semibold">Opening</th>
              <th className="px-3 py-2 font-semibold">Purchase</th>
              <th className="px-3 py-2 font-semibold">Received</th>
              <th className="px-3 py-2 font-semibold">Consumption</th>
              <th className="px-3 py-2 font-semibold">Transfer</th>
              <th className="px-3 py-2 font-semibold">In Transit</th>
              <th className="px-3 py-2 font-semibold">Closing to Import</th>
              <th className="px-3 py-2 font-semibold">Amount to Import</th>
              <th className="px-3 py-2 font-semibold">Mapping</th>
              <th className="px-3 py-2 font-semibold">Validation</th>
            </tr>
          </thead>
          <tbody>
            {preview.lines.map((line) => (
              <tr key={line.id} className="border-b border-border align-top last:border-b-0">
                <td className="px-3 py-3">
                  <div className="font-medium">{line.legacyStoreName}</div>
                  {editable ? (
                    <select value={line.storeId ?? ""} onChange={(event) => void saveLineMapping(line, { storeId: event.target.value || null })} className="mt-2 w-48 rounded-md border border-border bg-paper px-2 py-1 text-xs">
                      <option value="">Map store</option>
                      {stores.map((store) => (
                        <option key={store.id} value={store.id}>{store.storeCode} - {store.storeName}</option>
                      ))}
                    </select>
                  ) : null}
                </td>
                <td className="px-3 py-3">{line.legacyCategoryName}</td>
                <td className="px-3 py-3">
                  <div className="font-medium">{line.legacyItemName}</div>
                  {editable ? (
                    <select value={line.itemId ?? ""} onChange={(event) => void saveLineMapping(line, { itemId: event.target.value || null })} className="mt-2 w-56 rounded-md border border-border bg-paper px-2 py-1 text-xs">
                      <option value="">Map item</option>
                      {items.map((item) => (
                        <option key={item.id} value={item.id}>{item.itemCode} - {item.itemName}</option>
                      ))}
                    </select>
                  ) : null}
                </td>
                <td className="px-3 py-3">
                  <div className="font-medium">{line.legacyUnitName}</div>
                  {editable ? (
                    <select value={line.unitId ?? ""} onChange={(event) => void saveLineMapping(line, { unitId: event.target.value || null })} className="mt-2 w-40 rounded-md border border-border bg-paper px-2 py-1 text-xs">
                      <option value="">Map unit</option>
                      {units.map((unit) => (
                        <option key={unit.id} value={unit.id}>{unit.unitName}</option>
                      ))}
                    </select>
                  ) : null}
                </td>
                <td className="px-3 py-3">{line.itemRate}</td>
                <td className="px-3 py-3">{line.openingQuantity}</td>
                <td className="px-3 py-3">{line.purchaseQuantity}</td>
                <td className="px-3 py-3">{line.receivedQuantity}</td>
                <td className="px-3 py-3">{line.consumptionQuantity}</td>
                <td className="px-3 py-3">{line.transferQuantity}</td>
                <td className="px-3 py-3">{line.inTransitQuantity}</td>
                <td className="px-3 py-3">
                  <div>{line.closingQuantity}</div>
                  {editable ? (
                    <label className="mt-2 flex items-center gap-2 text-xs text-ink-muted">
                      <input
                        type="checkbox"
                        checked={line.isIncludedForPosting}
                        onChange={(event) => void saveLineMapping(line, { isIncludedForPosting: event.target.checked })}
                      />
                      Include
                    </label>
                  ) : null}
                </td>
                <td className="px-3 py-3">{line.closingAmount}</td>
                <td className="px-3 py-3">{line.mappingStatus}</td>
                <td className="px-3 py-3">
                  {line.validationErrors.length === 0 ? (
                    <span className="text-success">Ready</span>
                  ) : (
                    <ul className="space-y-1 text-xs text-danger">
                      {line.validationErrors.map((validationError) => (
                        <li key={validationError}>{validationError}</li>
                      ))}
                    </ul>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {problemLines.length > 0 ? (
        <div className="mt-6 rounded-md border border-danger/20 bg-danger/5 p-4 text-sm">
          <p className="font-medium text-danger">Mapping and validation problems</p>
          <p className="mt-2 text-ink-muted">
            {problemLines.length} rows still need review before posting. Ambiguous names are not mapped automatically, and `Cartoon` must be confirmed explicitly.
          </p>
        </div>
      ) : null}
    </section>
  );
}
