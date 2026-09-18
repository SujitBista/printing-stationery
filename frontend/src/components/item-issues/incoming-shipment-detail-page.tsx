"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import type { ItemIssueShipment } from "@printing-stationery/shared";
import {
  completeItemIssueReceiptWithDiscrepancy,
  confirmItemIssueReceipt,
  fetchIncomingShipment,
  returnItemIssueReceipt,
  submitItemIssueReceipt,
} from "@/lib/api/item-issues";
import { useAuth } from "@/lib/auth/auth-context";
import { isItemIssueAccessDenied } from "@/lib/item-issues/permissions";
import { Badge } from "@/components/ui/badge";
import {
  formatDateTime,
  ITEM_ISSUE_DELIVERY_STATUS_LABELS,
  personDisplayName,
} from "./item-issue-labels";

type IncomingShipmentDetailPageProps = {
  shipmentId: string;
};

export function IncomingShipmentDetailPage({
  shipmentId,
}: IncomingShipmentDetailPageProps) {
  const { canAccessItemRequests } = useAuth();
  const [shipment, setShipment] = useState<ItemIssueShipment | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [receivedNow, setReceivedNow] = useState<Record<string, string>>({});
  const [missingQty, setMissingQty] = useState<Record<string, string>>({});
  const [damagedQty, setDamagedQty] = useState<Record<string, string>>({});
  const [receiptDate, setReceiptDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [remarks, setRemarks] = useState("");
  const [discrepancyResolution, setDiscrepancyResolution] = useState<
    "KEEP_IN_TRANSIT" | "COMPLETE_WITH_DISCREPANCY"
  >("KEEP_IN_TRANSIT");
  const [checkerRemarks, setCheckerRemarks] = useState("");

  useEffect(() => {
    async function load() {
      setLoading(true);
      const result = await fetchIncomingShipment(shipmentId);
      if (!result.ok) {
        setLoadError(
          isItemIssueAccessDenied(result.status)
            ? "You are not assigned to the destination store."
            : result.error,
        );
        setLoading(false);
        return;
      }
      setShipment(result.data);
      const initial: Record<string, string> = {};
      for (const line of result.data.lines) {
        initial[line.id] = line.remainingInTransitQuantity;
      }
      setReceivedNow(initial);
      setLoading(false);
    }
    if (canAccessItemRequests) {
      void load();
    } else {
      setLoading(false);
    }
  }, [canAccessItemRequests, shipmentId]);

  const pendingReceipt = shipment?.receipts.find(
    (receipt) => receipt.status === "PENDING_VERIFICATION",
  );

  async function handleSubmitReceipt(event: FormEvent) {
    event.preventDefault();
    if (!shipment) {
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const result = await submitItemIssueReceipt(shipment.id, {
        receiptDate,
        remarks: remarks.trim() || null,
        discrepancyResolution,
        lines: shipment.lines
          .filter((line) => Number(receivedNow[line.id] ?? "0") > 0)
          .map((line) => ({
            shipmentLineId: line.id,
            receivedQuantityNow: receivedNow[line.id] ?? "0",
            missingQuantity: missingQty[line.id] || "0",
            damagedQuantity: damagedQty[line.id] || "0",
            remarks: null,
          })),
      });
      if (!result.ok) {
        throw new Error(result.error);
      }
      setShipment(result.data);
      setFeedback("Receipt recorded for verification. Stock has not changed.");
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Failed to submit receipt");
    } finally {
      setSaving(false);
    }
  }

  async function handleConfirm(completeWithDiscrepancy: boolean) {
    if (!pendingReceipt) {
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const result = completeWithDiscrepancy
        ? await completeItemIssueReceiptWithDiscrepancy(pendingReceipt.id, {
            expectedVersion: pendingReceipt.version,
            remarks: checkerRemarks || null,
            discrepancyResolution: "COMPLETE_WITH_DISCREPANCY",
          })
        : await confirmItemIssueReceipt(pendingReceipt.id, {
            expectedVersion: pendingReceipt.version,
            remarks: checkerRemarks || null,
            discrepancyResolution: "KEEP_IN_TRANSIT",
          });
      if (!result.ok) {
        throw new Error(result.error);
      }
      setShipment(result.data);
      setFeedback(
        completeWithDiscrepancy
          ? "Receipt completed with discrepancy. Only usable quantity entered Branch Store stock."
          : "Receipt confirmed. Branch Store stock increased.",
      );
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Failed to confirm receipt");
    } finally {
      setSaving(false);
    }
  }

  async function handleReturn() {
    if (!pendingReceipt) {
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const result = await returnItemIssueReceipt(pendingReceipt.id, {
        expectedVersion: pendingReceipt.version,
        remarks: checkerRemarks,
      });
      if (!result.ok) {
        throw new Error(result.error);
      }
      setShipment(result.data);
      setFeedback("Receipt returned for correction. Stock has not changed.");
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Failed to return receipt");
    } finally {
      setSaving(false);
    }
  }

  if (!canAccessItemRequests) {
    return (
      <p className="border-l-2 border-danger pl-3 text-sm text-danger">
        You do not have access to Incoming Items.
      </p>
    );
  }
  if (loading) {
    return <p className="text-sm text-ink-muted">Loading shipment…</p>;
  }
  if (loadError || !shipment) {
    return (
      <p className="border-l-2 border-danger pl-3 text-sm text-danger">
        {loadError ?? "Shipment not found"}
      </p>
    );
  }

  return (
    <section className="w-full max-w-5xl">
      <h1 className="text-2xl font-bold tracking-tight text-accent">
        Incoming {shipment.issueNumber}
      </h1>
      <p className="mt-2 text-sm text-ink-muted">
        {shipment.fromStore.storeName} → {shipment.toStore.storeName}
        {shipment.requestNumber ? ` · ${shipment.requestNumber}` : ""}
      </p>
      <div className="mt-2">
        <Badge variant="info">
          {ITEM_ISSUE_DELIVERY_STATUS_LABELS[shipment.deliveryStatus]}
        </Badge>
      </div>

      {feedback ? (
        <p className="mt-4 border-l-2 border-success pl-3 text-sm text-success">{feedback}</p>
      ) : null}
      {formError ? (
        <p className="mt-4 border-l-2 border-danger pl-3 text-sm text-danger">{formError}</p>
      ) : null}

      <div className="ps-table-shell mt-6">
        <table className="min-w-[56rem] w-full text-left text-sm">
          <thead className="border-b border-border bg-accent-soft text-xs uppercase tracking-wider text-ink-muted">
            <tr>
              <th className="px-3 py-2 font-semibold">Item</th>
              <th className="px-3 py-2 font-semibold">Unit</th>
              <th className="px-3 py-2 font-semibold">Dispatched Quantity</th>
              <th className="px-3 py-2 font-semibold">Previously Confirmed Received Quantity</th>
              <th className="px-3 py-2 font-semibold">Remaining In-Transit Quantity</th>
              {shipment.canRecordReceipt ? (
                <>
                  <th className="px-3 py-2 font-semibold">Received Quantity Now</th>
                  <th className="px-3 py-2 font-semibold">Missing Quantity</th>
                  <th className="px-3 py-2 font-semibold">Damaged Quantity</th>
                </>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {shipment.lines.map((line) => (
              <tr key={line.id} className="border-b border-border">
                <td className="px-3 py-3">
                  {line.itemCode} — {line.itemName}
                </td>
                <td className="px-3 py-3">{line.unit.unitName}</td>
                <td className="px-3 py-3">{line.dispatchedQuantity}</td>
                <td className="px-3 py-3">{line.confirmedReceivedQuantity}</td>
                <td className="px-3 py-3">{line.remainingInTransitQuantity}</td>
                {shipment.canRecordReceipt ? (
                  <>
                    <td className="px-3 py-3">
                      <input
                        value={receivedNow[line.id] ?? ""}
                        onChange={(event) =>
                          setReceivedNow((current) => ({
                            ...current,
                            [line.id]: event.target.value,
                          }))
                        }
                        className="w-24 rounded-lg border border-border px-2 py-1"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <input
                        value={missingQty[line.id] ?? ""}
                        onChange={(event) =>
                          setMissingQty((current) => ({
                            ...current,
                            [line.id]: event.target.value,
                          }))
                        }
                        className="w-24 rounded-lg border border-border px-2 py-1"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <input
                        value={damagedQty[line.id] ?? ""}
                        onChange={(event) =>
                          setDamagedQty((current) => ({
                            ...current,
                            [line.id]: event.target.value,
                          }))
                        }
                        className="w-24 rounded-lg border border-border px-2 py-1"
                      />
                    </td>
                  </>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {shipment.canRecordReceipt ? (
        <form className="mt-6 flex flex-col gap-3" onSubmit={(event) => void handleSubmitReceipt(event)}>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">Receipt date</span>
            <input
              type="date"
              value={receiptDate}
              onChange={(event) => setReceiptDate(event.target.value)}
              className="max-w-xs rounded-lg border border-border px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">Receipt remarks</span>
            <textarea
              value={remarks}
              onChange={(event) => setRemarks(event.target.value)}
              rows={2}
              className="rounded-lg border border-border px-3 py-2"
            />
          </label>
          <fieldset className="text-sm">
            <legend className="font-medium text-ink">If quantity is short</legend>
            <label className="mt-2 flex items-center gap-2">
              <input
                type="radio"
                checked={discrepancyResolution === "KEEP_IN_TRANSIT"}
                onChange={() => setDiscrepancyResolution("KEEP_IN_TRANSIT")}
              />
              Keep remaining quantity in transit
            </label>
            <label className="mt-1 flex items-center gap-2">
              <input
                type="radio"
                checked={discrepancyResolution === "COMPLETE_WITH_DISCREPANCY"}
                onChange={() => setDiscrepancyResolution("COMPLETE_WITH_DISCREPANCY")}
              />
              Complete with discrepancy
            </label>
          </fieldset>
          <button
            type="submit"
            disabled={saving}
            className="w-fit rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            Submit Receipt for Verification
          </button>
        </form>
      ) : null}

      {pendingReceipt && shipment.canConfirmReceipt ? (
        <div className="mt-6 flex flex-col gap-3 rounded-lg border border-border p-4">
          <h2 className="font-semibold">Confirm Receipt</h2>
          <p className="text-sm text-ink-muted">
            Recorded by {personDisplayName(pendingReceipt.createdBy)}. Confirmation
            increases Branch Store stock and decreases in-transit quantity.
          </p>
          <textarea
            value={checkerRemarks}
            onChange={(event) => setCheckerRemarks(event.target.value)}
            placeholder="Verification remarks"
            rows={2}
            className="rounded-lg border border-border px-3 py-2 text-sm"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleConfirm(false)}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white"
            >
              Confirm Receipt
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleConfirm(true)}
              className="rounded-lg border border-warning px-4 py-2 text-sm font-semibold text-warning"
            >
              Complete with Discrepancy
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleReturn()}
              className="rounded-lg border border-accent-tint px-4 py-2 text-sm font-semibold text-accent"
            >
              Return for Correction
            </button>
          </div>
        </div>
      ) : null}

      {shipment.receipts.length > 0 ? (
        <div className="mt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-muted">
            Receipt history
          </h2>
          <ul className="mt-2 space-y-2 text-sm">
            {shipment.receipts.map((receipt) => (
              <li key={receipt.id} className="border-l-2 border-border pl-3">
                {receipt.status} · {formatDateTime(receipt.receiptDate)} ·{" "}
                {personDisplayName(receipt.createdBy)}
                {receipt.verifiedBy
                  ? ` · verified by ${personDisplayName(receipt.verifiedBy)}`
                  : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <Link
        href="/requests/incoming-items"
        className="mt-6 inline-block rounded-lg border border-accent-tint px-4 py-2 text-sm font-semibold text-accent"
      >
        Back to Incoming Items
      </Link>
    </section>
  );
}
