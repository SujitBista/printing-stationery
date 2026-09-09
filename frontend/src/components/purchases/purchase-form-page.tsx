"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  createPurchaseInputSchema,
  nepaliFiscalYearFromIsoDate,
  purchaseLineAmount,
  sumDecimalStrings,
  type Item,
  type ItemRequestListItem,
  type Party,
  type Purchase,
  type Store,
} from "@printing-stationery/shared";
import { fetchItems } from "@/lib/api/items";
import { fetchItemRequests } from "@/lib/api/item-requests";
import { fetchParties } from "@/lib/api/parties";
import {
  createPurchase,
  fetchPurchase,
  updatePurchase,
} from "@/lib/api/purchases";
import { fetchStores } from "@/lib/api/stores";
import { loadAllPaginatedOptions } from "@/lib/api/load-paginated-options";
import { useAuth } from "@/lib/auth/auth-context";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { formatPurchaseAmount, todayIsoDate } from "./purchase-labels";

type LineState = {
  key: string;
  itemId: string;
  quantity: string;
  rate: string;
};

type PurchaseFormPageProps = {
  mode: "create" | "edit";
  purchaseId?: string;
};

function newLineKey(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function itemOptionLabel(item: Pick<Item, "itemCode" | "itemName" | "unit">): string {
  return `${item.itemCode} — ${item.itemName} (${item.unit.unitName})`;
}

export function PurchaseFormPage({ mode, purchaseId }: PurchaseFormPageProps) {
  const router = useRouter();
  const { canMutatePurchases } = useAuth();
  const [existing, setExisting] = useState<Purchase | null>(null);
  const [stores, setStores] = useState<Store[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [requests, setRequests] = useState<ItemRequestListItem[]>([]);
  const [storeId, setStoreId] = useState("");
  const [partyId, setPartyId] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(todayIsoDate());
  const [purchaseBillDate, setPurchaseBillDate] = useState(todayIsoDate());
  const [fiscalYear, setFiscalYear] = useState(
    nepaliFiscalYearFromIsoDate(todayIsoDate()),
  );
  const [poNumber, setPoNumber] = useState("");
  const [grnNumber, setGrnNumber] = useState("");
  const [deliveryNoteNumber, setDeliveryNoteNumber] = useState("");
  const [purchaseBillNumber, setPurchaseBillNumber] = useState("");
  const [itemRequestId, setItemRequestId] = useState("");
  const [remarks, setRemarks] = useState("");
  const [lines, setLines] = useState<LineState[]>([
    { key: newLineKey(), itemId: "", quantity: "", rate: "" },
  ]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setLoadError(null);

      const [storesResult, partiesResult, itemsResult, requestsResult, existingResult] =
        await Promise.all([
          loadAllPaginatedOptions(fetchStores, "ACTIVE"),
          loadAllPaginatedOptions(fetchParties, "ACTIVE"),
          loadAllPaginatedOptions(fetchItems, "ACTIVE"),
          fetchItemRequests({ page: 1, pageSize: 100, status: "ALL" }),
          mode === "edit" && purchaseId
            ? fetchPurchase(purchaseId)
            : Promise.resolve(null),
        ]);

      if (!storesResult.ok) {
        setLoadError(storesResult.error);
        setLoading(false);
        return;
      }
      if (!partiesResult.ok) {
        setLoadError(partiesResult.error);
        setLoading(false);
        return;
      }
      if (!itemsResult.ok) {
        setLoadError(itemsResult.error);
        setLoading(false);
        return;
      }

      setStores(storesResult.data);
      setParties(partiesResult.data);
      setItems(itemsResult.data);
      if (requestsResult.ok) {
        setRequests(requestsResult.data.items);
      }

      if (existingResult) {
        if (!existingResult.ok) {
          setLoadError(existingResult.error);
          setLoading(false);
          return;
        }
        if (!existingResult.data.canEdit) {
          setLoadError("This purchase cannot be edited.");
          setLoading(false);
          return;
        }

        const purchase = existingResult.data;
        setExisting(purchase);
        setStoreId(purchase.storeId);
        setPartyId(purchase.partyId);
        setPurchaseDate(purchase.purchaseDate);
        setPurchaseBillDate(purchase.purchaseBillDate);
        setFiscalYear(purchase.fiscalYear);
        setPoNumber(purchase.poNumber ?? "");
        setGrnNumber(purchase.grnNumber ?? "");
        setDeliveryNoteNumber(purchase.deliveryNoteNumber ?? "");
        setPurchaseBillNumber(purchase.purchaseBillNumber ?? "");
        setItemRequestId(purchase.itemRequestId ?? "");
        setRemarks(purchase.remarks ?? "");
        setLines(
          purchase.lines.map((line) => ({
            key: line.id,
            itemId: line.itemId,
            quantity: line.quantity,
            rate: line.rate,
          })),
        );
      }

      setLoading(false);
    }

    if (canMutatePurchases) {
      void load();
    } else {
      setLoading(false);
    }
  }, [canMutatePurchases, mode, purchaseId]);

  const itemById = useMemo(() => {
    const map = new Map<string, Item | Purchase["lines"][number]["item"]>();
    for (const item of items) {
      map.set(item.id, item);
    }
    if (existing) {
      for (const line of existing.lines) {
        if (!map.has(line.itemId)) {
          map.set(line.itemId, line.item);
        }
      }
    }
    return map;
  }, [existing, items]);

  const selectedItemIds = useMemo(
    () => new Set(lines.map((line) => line.itemId).filter(Boolean)),
    [lines],
  );

  const totalAmount = useMemo(() => {
    const amounts: string[] = [];
    for (const line of lines) {
      if (!line.quantity || !line.rate) {
        continue;
      }
      try {
        amounts.push(purchaseLineAmount(line.quantity, line.rate));
      } catch {
        // Ignore incomplete line totals while typing.
      }
    }
    return amounts.length === 0 ? "0" : sumDecimalStrings(amounts);
  }, [lines]);

  function updateLine(key: string, patch: Partial<LineState>) {
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );
  }

  function handlePurchaseDateChange(value: string) {
    setPurchaseDate(value);
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      try {
        setFiscalYear(nepaliFiscalYearFromIsoDate(value));
      } catch {
        // Keep the current fiscal year if the date is incomplete/invalid.
      }
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) {
      return;
    }

    setFormError(null);
    const payload = {
      storeId,
      partyId,
      purchaseDate,
      purchaseBillDate,
      fiscalYear,
      poNumber: poNumber || null,
      grnNumber: grnNumber || null,
      deliveryNoteNumber: deliveryNoteNumber || null,
      purchaseBillNumber: purchaseBillNumber || null,
      itemRequestId: itemRequestId || null,
      remarks: remarks || null,
      lines: lines
        .filter((line) => line.itemId)
        .map((line) => ({
          itemId: line.itemId,
          quantity: line.quantity,
          rate: line.rate,
        })),
    };

    const parsed = createPurchaseInputSchema.safeParse(payload);
    if (!parsed.success) {
      setFormError(
        parsed.error.issues[0]?.message ?? "Please correct the highlighted fields.",
      );
      return;
    }

    setSaving(true);
    const result =
      mode === "edit" && existing
        ? await updatePurchase(existing.id, {
            ...parsed.data,
            expectedVersion: existing.version,
          })
        : await createPurchase(parsed.data);
    setSaving(false);

    if (!result.ok) {
      setFormError(result.error);
      return;
    }

    router.push(`/purchases/${result.data.id}`);
  }

  if (!canMutatePurchases) {
    return (
      <section className="w-full max-w-5xl">
        <div className="border-l-2 border-danger pl-4">
          <p className="font-medium text-danger">Access denied</p>
          <p className="mt-1 text-sm text-ink-muted">
            You can view purchases but cannot create or edit them.
          </p>
        </div>
      </section>
    );
  }

  if (loading) {
    return (
      <section className="w-full max-w-5xl">
        <p className="text-sm text-ink-muted">Loading purchase form…</p>
      </section>
    );
  }

  if (loadError) {
    return (
      <section className="w-full max-w-5xl">
        <div className="border-l-2 border-danger pl-4">
          <p className="font-medium text-danger">Unable to load the form</p>
          <p className="mt-1 text-sm text-ink-muted">{loadError}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="w-full max-w-5xl">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-accent sm:text-3xl">
            {mode === "create" ? "Add Purchase" : "Edit Purchase"}
          </h1>
          <p className="mt-2 text-ink-muted">
            {mode === "create"
              ? "Enter header details and at least one item line."
              : `Editing purchase ${existing?.purchaseNumber ?? ""}.`}
          </p>
        </div>
        <Link
          href={existing ? `/purchases/${existing.id}` : "/purchases"}
          className="text-sm font-medium text-accent hover:underline"
        >
          Back
        </Link>
      </div>

      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-6" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">Store Name</span>
            <SearchableSelect
              value={storeId}
              onChange={setStoreId}
              placeholder="Select store"
              searchPlaceholder="Search stores…"
              options={(existing?.store && !stores.some((store) => store.id === existing.store.id)
                ? [
                    ...stores,
                    {
                      id: existing.store.id,
                      storeCode: existing.store.storeCode,
                      storeName: existing.store.storeName,
                    },
                  ]
                : stores
              ).map((store) => ({
                value: store.id,
                label: `${store.storeCode} — ${store.storeName}`,
              }))}
              disabled={saving}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">Party Name</span>
            <SearchableSelect
              value={partyId}
              onChange={setPartyId}
              placeholder="Select party"
              searchPlaceholder="Search parties…"
              emptyMessage="No parties. Add one in Party Setup."
              options={(existing?.party && !parties.some((party) => party.id === existing.party.id)
                ? [
                    ...parties,
                    {
                      id: existing.party.id,
                      partyCode: existing.party.partyCode,
                      partyName: existing.party.partyName,
                    },
                  ]
                : parties
              ).map((party) => ({
                value: party.id,
                label: `${party.partyCode} — ${party.partyName}`,
              }))}
              disabled={saving}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">Purchase Date</span>
            <input
              type="date"
              value={purchaseDate}
              onChange={(event) => handlePurchaseDateChange(event.target.value)}
              disabled={saving}
              className="rounded-md border border-border bg-paper-elevated px-3 py-2 outline-none focus:ring-2 focus:ring-accent/30"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">Purchase Bill Date</span>
            <input
              type="date"
              value={purchaseBillDate}
              onChange={(event) => setPurchaseBillDate(event.target.value)}
              disabled={saving}
              className="rounded-md border border-border bg-paper-elevated px-3 py-2 outline-none focus:ring-2 focus:ring-accent/30"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">Fiscal Year</span>
            <input
              value={fiscalYear}
              onChange={(event) => setFiscalYear(event.target.value)}
              disabled={saving}
              placeholder="2083-2084"
              className="rounded-md border border-border bg-paper-elevated px-3 py-2 outline-none focus:ring-2 focus:ring-accent/30"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">Purchase Bill No</span>
            <input
              value={purchaseBillNumber}
              onChange={(event) => setPurchaseBillNumber(event.target.value)}
              disabled={saving}
              className="rounded-md border border-border bg-paper-elevated px-3 py-2 outline-none focus:ring-2 focus:ring-accent/30"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">PO Number</span>
            <input
              value={poNumber}
              onChange={(event) => setPoNumber(event.target.value)}
              disabled={saving}
              className="rounded-md border border-border bg-paper-elevated px-3 py-2 outline-none focus:ring-2 focus:ring-accent/30"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">GRN No.</span>
            <input
              value={grnNumber}
              onChange={(event) => setGrnNumber(event.target.value)}
              disabled={saving}
              className="rounded-md border border-border bg-paper-elevated px-3 py-2 outline-none focus:ring-2 focus:ring-accent/30"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">Delivery Note No.</span>
            <input
              value={deliveryNoteNumber}
              onChange={(event) => setDeliveryNoteNumber(event.target.value)}
              disabled={saving}
              className="rounded-md border border-border bg-paper-elevated px-3 py-2 outline-none focus:ring-2 focus:ring-accent/30"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">Request ID</span>
            <SearchableSelect
              value={itemRequestId}
              onChange={setItemRequestId}
              placeholder="Optional linked request"
              searchPlaceholder="Search request number…"
              options={(itemRequestId &&
              existing?.itemRequest &&
              !requests.some((request) => request.id === itemRequestId)
                ? [
                    {
                      id: existing.itemRequest.id,
                      requestNumber: existing.itemRequest.requestNumber,
                    },
                    ...requests,
                  ]
                : requests
              ).map((request) => ({
                value: request.id,
                label: request.requestNumber,
              }))}
              disabled={saving}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            <span className="font-medium text-ink">Remarks</span>
            <textarea
              value={remarks}
              onChange={(event) => setRemarks(event.target.value)}
              disabled={saving}
              rows={2}
              className="rounded-md border border-border bg-paper-elevated px-3 py-2 outline-none focus:ring-2 focus:ring-accent/30"
            />
          </label>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-ink">Items</h2>
            <button
              type="button"
              onClick={() =>
                setLines((current) => [
                  ...current,
                  { key: newLineKey(), itemId: "", quantity: "", rate: "" },
                ])
              }
              disabled={saving}
              className="text-sm font-medium text-accent hover:underline disabled:opacity-60"
            >
              Add line
            </button>
          </div>
          <div className="ps-table-shell">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-border bg-accent-soft text-xs uppercase tracking-wider text-ink-muted">
                <tr>
                  <th className="px-3 py-2 font-semibold">Item</th>
                  <th className="w-32 px-3 py-2 font-semibold">Quantity</th>
                  <th className="w-32 px-3 py-2 font-semibold">Rate</th>
                  <th className="w-32 px-3 py-2 font-semibold">Amount</th>
                  <th className="w-20 px-3 py-2 font-semibold"> </th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => {
                  const item = itemById.get(line.itemId);
                  let amount = "—";
                  try {
                    if (line.quantity && line.rate) {
                      amount = formatPurchaseAmount(
                        purchaseLineAmount(line.quantity, line.rate),
                      );
                    }
                  } catch {
                    amount = "—";
                  }
                  return (
                    <tr key={line.key} className="border-b border-border last:border-b-0">
                      <td className="px-3 py-2">
                        <SearchableSelect
                          value={line.itemId}
                          onChange={(itemId) => {
                            const selected = itemById.get(itemId);
                            const nextRate =
                              selected && "purchaseRate" in selected
                                ? selected.purchaseRate
                                : line.rate;
                            updateLine(line.key, { itemId, rate: nextRate });
                          }}
                          placeholder="Select item"
                          searchPlaceholder="Search items…"
                          options={[
                            ...items.filter(
                              (option) =>
                                option.id === line.itemId ||
                                !selectedItemIds.has(option.id),
                            ),
                            ...(!items.some((option) => option.id === line.itemId) &&
                            item &&
                            line.itemId
                              ? [
                                  {
                                    id: line.itemId,
                                    itemCode: item.itemCode,
                                    itemName: item.itemName,
                                    unit: item.unit,
                                  },
                                ]
                              : []),
                          ].map((option) => ({
                            value: option.id,
                            label: itemOptionLabel(option),
                          }))}
                          disabled={saving}
                          size="sm"
                        />
                        {item ? (
                          <p className="mt-1 text-xs text-ink-muted">
                            Unit: {item.unit.unitName}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-3 py-2">
                        <input
                          value={line.quantity}
                          onChange={(event) =>
                            updateLine(line.key, { quantity: event.target.value })
                          }
                          disabled={saving}
                          inputMode="decimal"
                          className="w-full rounded-md border border-border bg-paper-elevated px-2 py-1.5 outline-none focus:ring-2 focus:ring-accent/30"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          value={line.rate}
                          onChange={(event) =>
                            updateLine(line.key, { rate: event.target.value })
                          }
                          disabled={saving}
                          inputMode="decimal"
                          className="w-full rounded-md border border-border bg-paper-elevated px-2 py-1.5 outline-none focus:ring-2 focus:ring-accent/30"
                        />
                      </td>
                      <td className="px-3 py-2 tabular-nums">{amount}</td>
                      <td className="px-3 py-2">
                        {lines.length > 1 ? (
                          <button
                            type="button"
                            onClick={() =>
                              setLines((current) =>
                                current.filter((entry) => entry.key !== line.key),
                              )
                            }
                            disabled={saving}
                            className="text-sm text-danger hover:underline disabled:opacity-60"
                          >
                            Remove
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-right text-sm font-semibold text-ink">
            Total amount {formatPurchaseAmount(totalAmount)}
          </p>
        </div>

        {formError ? (
          <p className="border-l-2 border-danger pl-3 text-sm text-danger" role="alert">
            {formError}
          </p>
        ) : null}

        <div className="flex justify-end gap-2">
          <Link
            href={existing ? `/purchases/${existing.id}` : "/purchases"}
            className="rounded-md border border-border px-3 py-2 text-sm text-ink-muted hover:bg-paper"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-dark disabled:opacity-60"
          >
            {saving ? "Saving…" : mode === "create" ? "Save Purchase" : "Save Changes"}
          </button>
        </div>
      </form>
    </section>
  );
}
