"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Item, Store, OpeningStockBatchSummary } from "@printing-stationery/shared";
import { fetchItems } from "@/lib/api/items";
import {
  createManualOpeningStock,
  fetchOpeningStockBatches,
  previewLegacyOpeningStockImport,
} from "@/lib/api/opening-stock";
import { fetchStores } from "@/lib/api/stores";
import { loadAllPaginatedOptions } from "@/lib/api/load-paginated-options";
import { useAuth } from "@/lib/auth/auth-context";
import { SearchableSelect } from "@/components/ui/searchable-select";

export function OpeningStockListPage() {
  const { canAccessOpeningStock } = useAuth();
  const [batches, setBatches] = useState<OpeningStockBatchSummary[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [status, setStatus] = useState<"ALL" | OpeningStockBatchSummary["status"]>("ALL");
  const [sourceType, setSourceType] = useState<"ALL" | OpeningStockBatchSummary["sourceType"]>("ALL");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [manualStoreId, setManualStoreId] = useState("");
  const [manualItemId, setManualItemId] = useState("");
  const [manualRate, setManualRate] = useState("");
  const [manualQuantity, setManualQuantity] = useState("");
  const [manualCutoverDate, setManualCutoverDate] = useState(new Date().toISOString().slice(0, 10));
  const [manualRemarks, setManualRemarks] = useState("");
  const [submittingManual, setSubmittingManual] = useState(false);
  const [importingFile, setImportingFile] = useState(false);

  useEffect(() => {
    if (!canAccessOpeningStock) {
      setLoading(false);
      return;
    }
    void (async () => {
      const [batchResult, storeResult, itemResult] = await Promise.all([
        fetchOpeningStockBatches({ page: 1, pageSize: 20, status, sourceType, search: search || undefined }),
        loadAllPaginatedOptions(fetchStores, "ACTIVE"),
        loadAllPaginatedOptions(fetchItems, "ACTIVE"),
      ]);
      if (batchResult.ok) {
        setBatches(batchResult.data.items);
      } else {
        setError(batchResult.error);
      }
      if (storeResult.ok) {
        setStores(storeResult.data);
      }
      if (itemResult.ok) {
        setItems(itemResult.data);
      }
      setLoading(false);
    })();
  }, [canAccessOpeningStock, search, sourceType, status]);

  if (!canAccessOpeningStock) {
    return (
      <section className="w-full max-w-7xl">
        <h1 className="text-2xl font-bold tracking-tight text-accent sm:text-3xl">
          Opening Stock
        </h1>
        <p className="mt-4 border-l-2 border-danger pl-3 text-sm text-danger">
          You do not have access to Opening Stock.
        </p>
      </section>
    );
  }

  const selectedItem = items.find((item) => item.id === manualItemId);

  return (
    <section className="w-full max-w-7xl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-accent sm:text-3xl">
            Opening Stock
          </h1>
          <p className="mt-2 max-w-3xl text-ink-muted">
            Upload a safe legacy opening-stock preview or create a manual draft batch. Only legacy
            <span className="font-medium text-ink"> Closing Stock Qty </span>
            becomes new-system opening stock. In Transit must be migrated separately.
          </p>
        </div>
      </div>

      <div className="mt-4 rounded-md border border-warning/40 bg-warning/10 p-4 text-sm text-ink">
        <p className="font-semibold text-warning">Required to continue</p>
        <p className="mt-1 text-ink-muted">
          Opening stock data is required before inventory operations can continue. Import and post
          a validated opening-stock batch so store balances exist for issues, transfers, and stock
          checks.
        </p>
      </div>

      {feedback ? <p className="mt-4 border-l-2 border-success pl-3 text-sm text-success">{feedback}</p> : null}
      {error ? <p className="mt-4 border-l-2 border-danger pl-3 text-sm text-danger">{error}</p> : null}

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="ps-card p-5">
          <h2 className="text-lg font-semibold text-ink">Import Legacy Stock</h2>
          <p className="mt-2 text-sm text-ink-muted">
            Upload the HTML-exported `ConsolidateStockRateWise.xls` report. Uploading creates a draft preview only and does not affect stock.
          </p>
          <label className="mt-4 block text-sm font-medium text-ink">
            Legacy file
            <input
              type="file"
              accept=".xls"
              className="mt-2 block w-full rounded-md border border-border bg-paper px-3 py-2 text-sm"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) {
                  return;
                }
                setImportingFile(true);
                setError(null);
                const result = await previewLegacyOpeningStockImport(file);
                setImportingFile(false);
                if (!result.ok) {
                  setError(result.error);
                  return;
                }
                setFeedback(`Created preview batch ${result.data.batch.batchNumber}.`);
                const refresh = await fetchOpeningStockBatches({ page: 1, pageSize: 20, status, sourceType, search: search || undefined });
                if (refresh.ok) {
                  setBatches(refresh.data.items);
                }
              }}
            />
          </label>
          <p className="mt-3 text-xs text-ink-muted">
            Posting does not replay legacy purchases, received, transfer, or consumption movements. It imports only closing balances as opening stock.
          </p>
          {importingFile ? <p className="mt-2 text-sm text-ink-muted">Creating preview…</p> : null}
        </div>

        <div className="ps-card p-5">
          <h2 className="text-lg font-semibold text-ink">Manual Opening Stock</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <span className="font-medium text-ink">Store</span>
              <SearchableSelect
                className="mt-1"
                value={manualStoreId}
                onChange={setManualStoreId}
                placeholder="Select store"
                searchPlaceholder="Search stores…"
                options={stores.map((store) => ({
                  value: store.id,
                  label: `${store.storeCode} - ${store.storeName}`,
                }))}
              />
            </label>
            <label className="text-sm">
              <span className="font-medium text-ink">Cutover date</span>
              <input type="date" value={manualCutoverDate} onChange={(event) => setManualCutoverDate(event.target.value)} className="mt-1 w-full rounded-md border border-border bg-paper px-3 py-2" />
            </label>
            <label className="text-sm sm:col-span-2">
              <span className="font-medium text-ink">Item</span>
              <SearchableSelect
                className="mt-1"
                value={manualItemId}
                onChange={setManualItemId}
                placeholder="Select item"
                searchPlaceholder="Search items…"
                options={items.map((item) => ({
                  value: item.id,
                  label: `${item.itemCode} - ${item.itemName}`,
                }))}
              />
            </label>
            <label className="text-sm">
              <span className="font-medium text-ink">Unit</span>
              <input value={selectedItem?.unit.unitName ?? ""} disabled className="mt-1 w-full rounded-md border border-border bg-paper px-3 py-2 text-ink-muted" />
            </label>
            <label className="text-sm">
              <span className="font-medium text-ink">Rate</span>
              <input value={manualRate} onChange={(event) => setManualRate(event.target.value)} placeholder="0.0000" className="mt-1 w-full rounded-md border border-border bg-paper px-3 py-2" />
            </label>
            <label className="text-sm">
              <span className="font-medium text-ink">Quantity</span>
              <input value={manualQuantity} onChange={(event) => setManualQuantity(event.target.value)} placeholder="0.0000" className="mt-1 w-full rounded-md border border-border bg-paper px-3 py-2" />
            </label>
            <label className="text-sm sm:col-span-2">
              <span className="font-medium text-ink">Remarks</span>
              <input value={manualRemarks} onChange={(event) => setManualRemarks(event.target.value)} className="mt-1 w-full rounded-md border border-border bg-paper px-3 py-2" />
            </label>
          </div>
          <button
            type="button"
            disabled={submittingManual}
            className="mt-4 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-dark disabled:opacity-60"
            onClick={async () => {
              setSubmittingManual(true);
              setError(null);
              const result = await createManualOpeningStock({
                storeId: manualStoreId,
                cutoverDate: manualCutoverDate,
                remarks: manualRemarks || null,
                lines: [{ itemId: manualItemId, rate: manualRate, quantity: manualQuantity }],
              });
              setSubmittingManual(false);
              if (!result.ok) {
                setError(result.error);
                return;
              }
              setFeedback(`Created manual batch ${result.data.batch.batchNumber}.`);
              const refresh = await fetchOpeningStockBatches({ page: 1, pageSize: 20, status, sourceType, search: search || undefined });
              if (refresh.ok) {
                setBatches(refresh.data.items);
              }
            }}
          >
            {submittingManual ? "Saving…" : "Create Manual Batch"}
          </button>
        </div>
      </div>

      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search batch number or file" className="rounded-md border border-border bg-paper-elevated px-3 py-2 text-sm" />
        <select value={status} onChange={(event) => setStatus(event.target.value as typeof status)} className="rounded-md border border-border bg-paper-elevated px-3 py-2 text-sm">
          <option value="ALL">All statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="VALIDATED">Validated</option>
          <option value="POSTED">Posted</option>
          <option value="FAILED">Failed</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
        <select value={sourceType} onChange={(event) => setSourceType(event.target.value as typeof sourceType)} className="rounded-md border border-border bg-paper-elevated px-3 py-2 text-sm">
          <option value="ALL">All sources</option>
          <option value="MANUAL">Manual</option>
          <option value="LEGACY_IMPORT">Legacy import</option>
        </select>
      </div>

      <div className="mt-6 ps-table-shell">
        {loading ? (
          <p className="p-4 text-sm text-ink-muted">Loading opening-stock batches…</p>
        ) : (
          <table className="min-w-[72rem] w-full text-left text-sm">
            <thead className="border-b border-border bg-accent-soft text-xs uppercase tracking-wider text-ink-muted">
              <tr>
                <th className="px-3 py-2 font-semibold">Batch</th>
                <th className="px-3 py-2 font-semibold">Source</th>
                <th className="px-3 py-2 font-semibold">Cutover</th>
                <th className="px-3 py-2 font-semibold">Status</th>
                <th className="px-3 py-2 font-semibold">Lines</th>
                <th className="px-3 py-2 font-semibold">Valid</th>
                <th className="px-3 py-2 font-semibold">Postable</th>
                <th className="px-3 py-2 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((batch) => (
                <tr key={batch.id} className="border-b border-border last:border-b-0 transition-colors hover:bg-accent-soft/70">
                  <td className="px-3 py-3">
                    <div className="font-medium">{batch.batchNumber}</div>
                    <div className="text-xs text-ink-muted">{batch.sourceFilename ?? "Manual batch"}</div>
                  </td>
                  <td className="px-3 py-3">{batch.sourceType === "LEGACY_IMPORT" ? "Legacy import" : "Manual"}</td>
                  <td className="px-3 py-3">{batch.cutoverDate}</td>
                  <td className="px-3 py-3">{batch.status}</td>
                  <td className="px-3 py-3">{batch.lineCount}</td>
                  <td className="px-3 py-3">{batch.validLineCount}</td>
                  <td className="px-3 py-3">{batch.postableLineCount}</td>
                  <td className="px-3 py-3">
                    <Link href={`/stock/opening-stock/${batch.id}`} className="font-medium text-accent hover:text-accent-dark hover:underline">
                      View details
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="mt-6 rounded-md border border-warning/30 bg-warning/5 p-4 text-sm text-ink-muted">
        <p className="font-medium text-warning">Posting warning</p>
        <p className="mt-2">
          Post this opening-stock batch? This will create inventory balances and cannot be edited or posted again.
        </p>
        <p className="mt-2">
          Only legacy Closing Stock Qty becomes Opening Stock. Individual purchases, issues, consumption, and transfers are not replayed.
        </p>
      </div>
    </section>
  );
}
