"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Purchase } from "@printing-stationery/shared";
import { deletePurchase, fetchPurchase } from "@/lib/api/purchases";
import { useAuth } from "@/lib/auth/auth-context";
import {
  createdByDisplayName,
  displayOrDash,
  formatIsoDate,
  formatPurchaseAmount,
} from "./purchase-labels";

type PurchaseDetailPageProps = {
  purchaseId: string;
};

export function PurchaseDetailPage({ purchaseId }: PurchaseDetailPageProps) {
  const router = useRouter();
  const { canAccessPurchases } = useAuth();
  const [purchase, setPurchase] = useState<Purchase | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setLoadError(null);
      const result = await fetchPurchase(purchaseId);
      if (!result.ok) {
        setLoadError(result.error);
        setPurchase(null);
        setLoading(false);
        return;
      }
      setPurchase(result.data);
      setLoading(false);
    }

    if (canAccessPurchases) {
      void load();
    } else {
      setLoading(false);
    }
  }, [canAccessPurchases, purchaseId]);

  async function handleDelete() {
    if (!purchase) {
      return;
    }
    const confirmed = window.confirm(
      `Delete purchase ${purchase.purchaseNumber}? This cannot be undone.`,
    );
    if (!confirmed) {
      return;
    }

    setDeleting(true);
    setActionError(null);
    const result = await deletePurchase(purchase.id, {
      expectedVersion: purchase.version,
    });
    setDeleting(false);

    if (!result.ok) {
      setActionError(result.error);
      return;
    }

    router.push("/purchases");
  }

  if (!canAccessPurchases) {
    return (
      <section className="w-full max-w-5xl">
        <div className="border-l-2 border-danger pl-4">
          <p className="font-medium text-danger">Access denied</p>
          <p className="mt-1 text-sm text-ink-muted">
            You do not have permission to view purchase records.
          </p>
        </div>
      </section>
    );
  }

  if (loading) {
    return (
      <section className="w-full max-w-5xl">
        <p className="text-sm text-ink-muted">Loading purchase…</p>
      </section>
    );
  }

  if (loadError || !purchase) {
    return (
      <section className="w-full max-w-5xl">
        <div className="border-l-2 border-danger pl-4">
          <p className="font-medium text-danger">Unable to load purchase</p>
          <p className="mt-1 text-sm text-ink-muted">
            {loadError ?? "Purchase not found"}
          </p>
        </div>
      </section>
    );
  }

  const fields: Array<{ label: string; value: string }> = [
    { label: "Purchase No", value: purchase.purchaseNumber },
    { label: "Fiscal Year", value: purchase.fiscalYear },
    { label: "Purchase Date", value: formatIsoDate(purchase.purchaseDate) },
    {
      label: "Purchase Bill Date",
      value: formatIsoDate(purchase.purchaseBillDate),
    },
    { label: "Store Name", value: purchase.store.storeName },
    { label: "Party Name", value: purchase.party.partyName },
    { label: "Total Amount", value: formatPurchaseAmount(purchase.totalAmount) },
    { label: "PO Number", value: displayOrDash(purchase.poNumber) },
    { label: "GRN No.", value: displayOrDash(purchase.grnNumber) },
    {
      label: "Delivery Note No.",
      value: displayOrDash(purchase.deliveryNoteNumber),
    },
    {
      label: "Purchase Bill No",
      value: displayOrDash(purchase.purchaseBillNumber),
    },
    {
      label: "Request ID",
      value: displayOrDash(purchase.itemRequest?.requestNumber),
    },
    { label: "Remarks", value: displayOrDash(purchase.remarks) },
    { label: "Created By", value: createdByDisplayName(purchase.createdBy) },
  ];

  return (
    <section className="w-full max-w-5xl">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-accent sm:text-3xl">
            Purchase {purchase.purchaseNumber}
          </h1>
          <p className="mt-2 text-ink-muted">
            {purchase.party.partyName} · {purchase.store.storeName}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/purchases"
            className="rounded-md border border-border px-3 py-2 text-sm text-ink-muted hover:bg-paper"
          >
            Back to list
          </Link>
          {purchase.canEdit ? (
            <Link
              href={`/purchases/${purchase.id}/edit`}
              className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white hover:bg-accent-dark"
            >
              Edit
            </Link>
          ) : null}
          {purchase.canDelete ? (
            <button
              type="button"
              onClick={() => void handleDelete()}
              disabled={deleting}
              className="rounded-md border border-danger px-3 py-2 text-sm font-medium text-danger hover:bg-danger/10 disabled:opacity-60"
            >
              {deleting ? "Deleting…" : "Delete"}
            </button>
          ) : null}
        </div>
      </div>

      {actionError ? (
        <p className="mt-4 border-l-2 border-danger pl-3 text-sm text-danger" role="alert">
          {actionError}
        </p>
      ) : null}

      <dl className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {fields.map((field) => (
          <div key={field.label} className="rounded-lg border border-border bg-paper-elevated p-3">
            <dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
              {field.label}
            </dt>
            <dd className="mt-1 text-sm text-ink">{field.value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-8">
        <h2 className="text-lg font-semibold text-ink">Items</h2>
        <div className="ps-table-shell mt-3">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-border bg-accent-soft text-xs uppercase tracking-wider text-ink-muted">
              <tr>
                <th className="px-3 py-2 font-semibold">Item</th>
                <th className="px-3 py-2 font-semibold">Unit</th>
                <th className="px-3 py-2 font-semibold">Quantity</th>
                <th className="px-3 py-2 font-semibold">Rate</th>
                <th className="px-3 py-2 font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody>
              {purchase.lines.map((line) => (
                <tr
                  key={line.id}
                  className="border-b border-border last:border-b-0"
                >
                  <td className="px-3 py-3">
                    <div className="font-medium">{line.item.itemName}</div>
                    <div className="text-xs text-ink-muted">{line.item.itemCode}</div>
                  </td>
                  <td className="px-3 py-3">{line.item.unit.unitName}</td>
                  <td className="px-3 py-3 tabular-nums">{line.quantity}</td>
                  <td className="px-3 py-3 tabular-nums">
                    {formatPurchaseAmount(line.rate)}
                  </td>
                  <td className="px-3 py-3 tabular-nums">
                    {formatPurchaseAmount(line.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
