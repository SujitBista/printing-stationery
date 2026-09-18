import type {
  StockBalance,
  StockBalanceUnitSummary,
  StockLedgerCategory,
  StockLedgerCategoryFilter,
  StockLedgerMovementType,
} from "@printing-stationery/shared";
import { isNegativeQuantity, isZeroQuantity } from "@printing-stationery/shared";

export const STOCK_CATEGORY_LABELS: Record<StockLedgerCategory, string> = {
  AVAILABLE: "Available",
  IN_TRANSIT: "In Transit",
  DAMAGED: "Damaged",
  DISCREPANCY: "Discrepancy",
};

export const STOCK_CATEGORY_FILTER_LABELS: Record<
  StockLedgerCategoryFilter,
  string
> = {
  ALL: "All",
  ...STOCK_CATEGORY_LABELS,
};

export const STOCK_CATEGORY_TOOLTIPS: Record<StockLedgerCategory, string> = {
  AVAILABLE: "Physically received and usable stock.",
  IN_TRANSIT: "Dispatched to this store but not yet confirmed as received.",
  DAMAGED: "Physically received but unavailable for use.",
  DISCREPANCY:
    "Quantity under investigation because it is missing, incorrect, or unresolved.",
};

export const STOCK_MOVEMENT_LABELS: Record<StockLedgerMovementType, string> = {
  OPENING_STOCK: "Opening Stock",
  PURCHASE: "Purchase Receipt",
  ITEM_ISSUE: "Item Issue / Dispatch",
  ITEM_ISSUE_IN_TRANSIT: "In Transit",
  ITEM_ISSUE_RECEIPT: "Incoming Receipt",
  ITEM_ISSUE_DISCREPANCY: "Damaged / Discrepancy",
  DEPARTMENT_CONSUMPTION: "Department Consumption",
  LEGACY_OPENING_IN_TRANSIT: "Legacy Opening In Transit",
  LEGACY_OPENING_IN_TRANSIT_RECEIPT: "Legacy Opening Receipt",
};

export function quantityTone(
  quantity: string,
  kind: "available" | "warning",
): "danger" | "warning" | "neutral" {
  if (kind === "available" && isNegativeQuantity(quantity)) {
    return "danger";
  }
  if (kind === "warning" && !isZeroQuantity(quantity) && !quantity.startsWith("-")) {
    return "warning";
  }
  if (kind === "warning" && isNegativeQuantity(quantity)) {
    return "danger";
  }
  return "neutral";
}

export function quantityClassName(
  quantity: string,
  kind: "available" | "warning",
): string {
  const tone = quantityTone(quantity, kind);
  if (tone === "danger") {
    return "font-semibold text-danger";
  }
  if (tone === "warning") {
    return "font-semibold text-amber-800";
  }
  return "";
}

export function formatQuantityDisplay(value: string): string {
  return value;
}

export function ledgerSourceStoreDisplay(entry: {
  movementType: StockLedgerMovementType;
  sourceStore: { storeName: string } | null;
  sourceStoreLabel: string | null;
}): string {
  if (entry.sourceStore?.storeName) {
    return entry.sourceStore.storeName;
  }
  if (
    entry.movementType === "LEGACY_OPENING_IN_TRANSIT" ||
    entry.movementType === "LEGACY_OPENING_IN_TRANSIT_RECEIPT"
  ) {
    return entry.sourceStoreLabel ?? "Legacy Opening In Transit";
  }
  return "—";
}

export function formatMovementTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

export function emptyBalanceMessage(params: {
  emptyReason: "NONE" | "NO_MOVEMENTS" | "NO_MATCHES";
  storeSelected: boolean;
  hasFilters: boolean;
}): string {
  if (params.emptyReason === "NO_MOVEMENTS" && params.storeSelected) {
    return "No stock movements have been recorded for this store.";
  }
  if (params.emptyReason === "NO_MOVEMENTS") {
    return "No stock movements have been recorded.";
  }
  if (params.hasFilters) {
    return "No matching stock balances. Try adjusting the filters.";
  }
  return "No stock movements have been recorded.";
}

export function shouldShowNumericSummary(
  summaries: readonly StockBalanceUnitSummary[],
): boolean {
  return summaries.length === 1;
}

export function balanceRowKey(row: StockBalance): string {
  return `${row.storeId}|${row.itemId}|${row.unitId}`;
}
