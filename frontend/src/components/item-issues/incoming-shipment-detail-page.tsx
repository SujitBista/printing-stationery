"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import type {
  ItemIssueDiscrepancyReason,
  ItemIssueReceipt,
  ItemIssueShipment,
} from "@printing-stationery/shared";
import {
  destinationReceiptQuantityError,
  itemIssueReceiptIsOpen,
} from "@printing-stationery/shared";
import { submitItemIssueReceipt, fetchIncomingShipment } from "@/lib/api/item-issues";
import { useAuth } from "@/lib/auth/auth-context";
import { isItemIssueAccessDenied } from "@/lib/item-issues/permissions";
import { Badge } from "@/components/ui/badge";
import {
  destinationReceiptRoleLabel,
  formatDateTime,
  ITEM_ISSUE_DELIVERY_STATUS_LABELS,
  itemIssueReceiptStatusLabel,
  personDisplayName,
} from "./item-issue-labels";

type IncomingShipmentDetailPageProps = {
  shipmentId: string;
};

const DISCREPANCY_REASONS: Array<{ value: ItemIssueDiscrepancyReason; label: string }> = [
  { value: "MISSING", label: "Missing" },
  { value: "DAMAGED", label: "Damaged" },
  { value: "WRONG_ITEM", label: "Wrong item" },
  { value: "OTHER", label: "Other" },
];

function openReceipt(shipment: ItemIssueShipment): ItemIssueReceipt | null {
  return shipment.receipts.find((receipt) => itemIssueReceiptIsOpen(receipt.status)) ?? null;
}

function sumQuantity(values: string[]): string {
  const total = values.reduce((sum, value) => sum + Number(value || "0"), 0);
  return Number.isFinite(total) ? String(total) : "0";
}

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
  const [reasons, setReasons] = useState<
    Record<string, ItemIssueDiscrepancyReason | "">
  >({});
  const [receiptDate, setReceiptDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [remarks, setRemarks] = useState("");
  const [discrepancyResolution, setDiscrepancyResolution] = useState<
    "KEEP_IN_TRANSIT" | "COMPLETE_WITH_DISCREPANCY"
  >("KEEP_IN_TRANSIT");

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
      applyShipmentToForm(result.data);
      setLoading(false);
    }
    if (canAccessItemRequests) {
      void load();
    } else {
      setLoading(false);
    }
  }, [canAccessItemRequests, shipmentId]);

  function applyShipmentToForm(next: ItemIssueShipment) {
    const pending = openReceipt(next);
    const received: Record<string, string> = {};
    const missing: Record<string, string> = {};
    const damaged: Record<string, string> = {};
    const reason: Record<string, ItemIssueDiscrepancyReason | ""> = {};
    for (const line of next.lines) {
      const pendingLine = pending?.lines.find(
        (receiptLine) => receiptLine.shipmentLineId === line.id,
      );
      received[line.id] =
        pendingLine?.receivedQuantityNow ?? line.remainingInTransitQuantity;
      missing[line.id] = pendingLine?.missingQuantity ?? "";
      damaged[line.id] = pendingLine?.damagedQuantity ?? "";
      reason[line.id] = pendingLine?.discrepancyReason ?? "";
    }
    setReceivedNow(received);
    setMissingQty(missing);
    setDamagedQty(damaged);
    setReasons(reason);
    if (pending?.discrepancyResolution) {
      setDiscrepancyResolution(pending.discrepancyResolution);
    }
    if (pending?.remarks) {
      setRemarks(pending.remarks);
    }
  }

  async function handleConfirmReceipt(event: FormEvent) {
    event.preventDefault();
    if (!shipment) {
      return;
    }
    const validationError = destinationReceiptQuantityError({
      lines: shipment.lines
        .filter((line) => Number(line.remainingInTransitQuantity) > 0)
        .map((line) => ({
          receivedQuantityNow: receivedNow[line.id] ?? "0",
          damagedQuantity: damagedQty[line.id] || "0",
          remainingInTransitQuantity: line.remainingInTransitQuantity,
        })),
    });
    if (validationError) {
      setFormError(validationError);
      setFeedback(null);
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
            discrepancyReason: reasons[line.id] || null,
            remarks: null,
          })),
      });
      if (!result.ok) {
        throw new Error(result.error);
      }
      setShipment(result.data);
      applyShipmentToForm(result.data);
      setFeedback("Receipt confirmed. Destination store stock has been updated.");
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Failed to confirm receipt",
      );
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

  const pending = openReceipt(shipment);
  const confirmedReceipts = shipment.receipts.filter(
    (receipt) => receipt.status === "CONFIRMED",
  );

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
      <p className="mt-3 text-sm text-ink-muted">
        Destination Store Maker or Checker can confirm physical receipt. Opening
        this form does not move stock.
      </p>

      {feedback ? (
        <p className="mt-4 border-l-2 border-success pl-3 text-sm text-success">{feedback}</p>
      ) : null}
      {formError ? (
        <p className="mt-4 border-l-2 border-danger pl-3 text-sm text-danger">{formError}</p>
      ) : null}
      {pending ? (
        <p className="mt-4 text-sm text-ink-muted">
          Saved receipt data is ready to review. Confirming it posts inventory.
          Status: {itemIssueReceiptStatusLabel(pending.status)}.
        </p>
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
              {shipment.canConfirmReceipt ? (
                <>
                  <th className="px-3 py-2 font-semibold">Received Quantity Now</th>
                  <th className="px-3 py-2 font-semibold">Missing Quantity</th>
                  <th className="px-3 py-2 font-semibold">Damaged Quantity</th>
                  <th className="px-3 py-2 font-semibold">Discrepancy</th>
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
                {shipment.canConfirmReceipt ? (
                  <>
                    <td className="px-3 py-3">
                      <input
                        aria-label={`Received quantity for ${line.itemName}`}
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
                        aria-label={`Missing quantity for ${line.itemName}`}
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
                        aria-label={`Damaged quantity for ${line.itemName}`}
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
                    <td className="px-3 py-3">
                      <select
                        aria-label={`Discrepancy reason for ${line.itemName}`}
                        value={reasons[line.id] ?? ""}
                        onChange={(event) =>
                          setReasons((current) => ({
                            ...current,
                            [line.id]: event.target.value as ItemIssueDiscrepancyReason | "",
                          }))
                        }
                        className="rounded-lg border border-border px-2 py-1"
                      >
                        <option value="">None</option>
                        {DISCREPANCY_REASONS.map((reason) => (
                          <option key={reason.value} value={reason.value}>
                            {reason.label}
                          </option>
                        ))}
                      </select>
                    </td>
                  </>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {shipment.canConfirmReceipt ? (
        <form className="mt-6 flex flex-col gap-3" onSubmit={(event) => void handleConfirmReceipt(event)}>
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
            <legend className="font-medium text-ink">Unreceived quantity</legend>
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
            Confirm Receipt
          </button>
        </form>
      ) : null}

      {confirmedReceipts.length > 0 ? (
        <div className="mt-8 flex flex-col gap-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-muted">
            Confirmed receipts
          </h2>
          {confirmedReceipts.map((receipt) => {
            const usable = sumQuantity(
              receipt.lines.map((line) => line.receivedQuantityNow),
            );
            const damaged = sumQuantity(
              receipt.lines.map((line) => line.damagedQuantity),
            );
            const discrepancy = sumQuantity(
              receipt.lines.map((line) =>
                receipt.discrepancyResolution === "COMPLETE_WITH_DISCREPANCY"
                  ? line.missingQuantity
                  : "0",
              ),
            );
            const remaining = shipment.lines
              .map((line) => line.remainingInTransitQuantity)
              .join(", ");
            return (
              <dl
                key={receipt.id}
                className="grid gap-2 rounded-lg border border-border p-4 text-sm sm:grid-cols-2"
              >
                <div>
                  <dt className="text-ink-muted">Received by</dt>
                  <dd>{personDisplayName(receipt.verifiedBy ?? receipt.createdBy)}</dd>
                </div>
                <div>
                  <dt className="text-ink-muted">User role</dt>
                  <dd>{destinationReceiptRoleLabel(receipt.confirmedWorkflowRole)}</dd>
                </div>
                <div>
                  <dt className="text-ink-muted">Destination store</dt>
                  <dd>{shipment.toStore.storeName}</dd>
                </div>
                <div>
                  <dt className="text-ink-muted">Confirmation date and time</dt>
                  <dd>{formatDateTime(receipt.verifiedAt ?? receipt.receiptDate)}</dd>
                </div>
                <div>
                  <dt className="text-ink-muted">Usable received quantity</dt>
                  <dd>{usable}</dd>
                </div>
                <div>
                  <dt className="text-ink-muted">Damaged quantity</dt>
                  <dd>{damaged}</dd>
                </div>
                <div>
                  <dt className="text-ink-muted">Discrepancy quantity</dt>
                  <dd>{discrepancy}</dd>
                </div>
                <div>
                  <dt className="text-ink-muted">Remaining in-transit quantity</dt>
                  <dd>{remaining}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-ink-muted">Receipt remarks</dt>
                  <dd>{receipt.remarks ?? "—"}</dd>
                </div>
              </dl>
            );
          })}
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
