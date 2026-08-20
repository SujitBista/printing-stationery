"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { OpeningStockPreview } from "@printing-stationery/shared";
import {
  cancelOpeningStock,
  fetchOpeningStockBatch,
  postOpeningStock,
  validateOpeningStock,
} from "@/lib/api/opening-stock";
import { useAuth } from "@/lib/auth/auth-context";

export function OpeningStockDetailPage() {
  const { canAccessOpeningStock } = useAuth();
  const params = useParams<{ id: string | string[] }>();
  const router = useRouter();
  const batchId = Array.isArray(params.id) ? params.id[0] ?? "" : params.id ?? "";
  const [preview, setPreview] = useState<OpeningStockPreview | null>(null);
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
      const previewResult = await fetchOpeningStockBatch(batchId);
      if (!previewResult.ok) {
        setError(previewResult.error);
      } else {
        setPreview(previewResult.data);
      }
      setLoading(false);
    })();
  }, [batchId, canAccessOpeningStock]);

  const editable = preview?.batch.status !== "POSTED" && preview?.batch.status !== "CANCELLED";

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
            {preview.batch.batchNumber}
          </h1>
          <p className="mt-2 max-w-3xl text-ink-muted">
            Opening stock batch · Cutover {preview.batch.cutoverDate}
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

      {error ? <p className="mt-4 border-l-2 border-danger pl-3 text-sm text-danger">{error}</p> : null}
      {validationMessage ? (
        <p className="mt-4 border-l-2 border-success pl-3 text-sm text-success">{validationMessage}</p>
      ) : null}

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="rounded-md border border-border bg-paper-elevated p-4">
          <h2 className="font-semibold text-ink">Summary</h2>
          <dl className="mt-3 space-y-2 text-sm text-ink-muted">
            <div>
              <dt className="font-medium text-ink">Status</dt>
              <dd>{preview.batch.status}</dd>
            </div>
            <div>
              <dt className="font-medium text-ink">Rows</dt>
              <dd>{preview.summary.totalDetailRowCount}</dd>
            </div>
            <div>
              <dt className="font-medium text-ink">Stores</dt>
              <dd>{preview.summary.totalStoreCount}</dd>
            </div>
            <div>
              <dt className="font-medium text-ink">Ready rows</dt>
              <dd>{preview.summary.mappedRowCount}</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-md border border-border bg-paper-elevated p-4 lg:col-span-2">
          <h2 className="font-semibold text-ink">Actions</h2>
          {preview.summary.warningMessages.length > 0 ? (
            <ul className="mt-3 space-y-2 text-sm text-ink-muted">
              {preview.summary.warningMessages.map((message) => (
                <li key={message} className="border-l-2 border-warning pl-3">
                  {message}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-ink-muted">Validate, then post to create inventory balances.</p>
          )}
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
                setValidationMessage(
                  result.data.canPost
                    ? "Validation passed. Batch is ready to post."
                    : "Validation found blocking issues.",
                );
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
        <p className="mt-2">
          Post this opening-stock batch? This will create inventory balances and cannot be edited or
          posted again.
        </p>
      </div>

      <div className="mt-6 overflow-x-auto rounded-md border border-border bg-paper-elevated">
        <table className="min-w-[56rem] w-full text-left text-sm">
          <thead className="border-b border-border bg-paper text-xs uppercase tracking-wider text-ink-muted">
            <tr>
              <th className="px-3 py-2 font-semibold">Store</th>
              <th className="px-3 py-2 font-semibold">Item</th>
              <th className="px-3 py-2 font-semibold">Unit</th>
              <th className="px-3 py-2 font-semibold">Rate</th>
              <th className="px-3 py-2 font-semibold">Quantity</th>
              <th className="px-3 py-2 font-semibold">Amount</th>
              <th className="px-3 py-2 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {preview.lines.map((line) => (
              <tr key={line.id} className="border-b border-border last:border-b-0">
                <td className="px-3 py-3">
                  {line.store
                    ? `${line.store.storeCode} - ${line.store.storeName}`
                    : line.legacyStoreName}
                </td>
                <td className="px-3 py-3">
                  {line.item
                    ? `${line.item.itemCode} - ${line.item.itemName}`
                    : line.legacyItemName}
                </td>
                <td className="px-3 py-3">{line.unit?.unitName ?? line.legacyUnitName}</td>
                <td className="px-3 py-3">{line.itemRate}</td>
                <td className="px-3 py-3">{line.closingQuantity}</td>
                <td className="px-3 py-3">{line.closingAmount}</td>
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
    </section>
  );
}
