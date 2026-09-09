import type { ItemRequestPersonSummary } from "@printing-stationery/shared";

export function formatIsoDate(value: string | null | undefined): string {
  if (!value) {
    return "—";
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) {
    return value;
  }
  return `${match[3]}/${match[2]}/${match[1]}`;
}

export function formatPurchaseAmount(value: string | null | undefined): string {
  if (!value) {
    return "—";
  }
  const amount = Number(value);
  if (!Number.isFinite(amount)) {
    return value;
  }
  return amount.toFixed(4);
}

export function createdByDisplayName(
  createdBy: ItemRequestPersonSummary | null | undefined,
): string {
  if (!createdBy) {
    return "—";
  }
  if (createdBy.employee) {
    return createdBy.employee.employeeName;
  }
  return createdBy.username;
}

export function displayOrDash(value: string | null | undefined): string {
  if (!value || value.trim().length === 0) {
    return "—";
  }
  return value;
}

export function todayIsoDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

type PurchaseStoreOption = {
  id: string;
  storeCode: string;
  storeName: string;
  underStoreId?: string | null;
};

export function isCorporatePurchaseStore(store: PurchaseStoreOption): boolean {
  if (store.storeCode.trim() === "999") {
    return true;
  }
  return (
    (store.underStoreId ?? null) === null &&
    store.storeName.trim().toLowerCase() === "corporate store"
  );
}

export function findCorporatePurchaseStore<T extends PurchaseStoreOption>(
  stores: T[],
): T | undefined {
  return stores.find((store) => isCorporatePurchaseStore(store));
}

export function purchaseStoreSearchOptions<T extends PurchaseStoreOption>(
  stores: T[],
  selectedStoreId: string,
): T[] {
  const others = stores.filter((store) => !isCorporatePurchaseStore(store));
  if (!selectedStoreId) {
    return others;
  }
  const selected = stores.find((store) => store.id === selectedStoreId);
  if (!selected || others.some((store) => store.id === selected.id)) {
    return others;
  }
  return [selected, ...others];
}
