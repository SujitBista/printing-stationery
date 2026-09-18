export const STOCK_LEDGER_CATEGORIES = [
  "AVAILABLE",
  "IN_TRANSIT",
  "DAMAGED",
  "DISCREPANCY",
] as const;

export type StockLedgerCategory = (typeof STOCK_LEDGER_CATEGORIES)[number];

export const STOCK_LEDGER_CATEGORY_FILTERS = [
  "ALL",
  ...STOCK_LEDGER_CATEGORIES,
] as const;

export type StockLedgerCategoryFilter =
  (typeof STOCK_LEDGER_CATEGORY_FILTERS)[number];

export const STOCK_LEDGER_MOVEMENT_TYPES = [
  "OPENING_STOCK",
  "PURCHASE",
  "ITEM_ISSUE",
  "ITEM_ISSUE_IN_TRANSIT",
  "ITEM_ISSUE_RECEIPT",
  "ITEM_ISSUE_DISCREPANCY",
  "DEPARTMENT_CONSUMPTION",
  "LEGACY_OPENING_IN_TRANSIT",
  "LEGACY_OPENING_IN_TRANSIT_RECEIPT",
] as const;

export type StockLedgerMovementType =
  (typeof STOCK_LEDGER_MOVEMENT_TYPES)[number];

export const LEGACY_OPENING_IN_TRANSIT_SOURCE_LABEL =
  "Legacy Opening In Transit";
export const UNKNOWN_LEGACY_SOURCE_LABEL = "Unknown legacy source";

export function isLegacyOpeningInTransitMovement(
  movementType: StockLedgerMovementType,
): boolean {
  return (
    movementType === "LEGACY_OPENING_IN_TRANSIT" ||
    movementType === "LEGACY_OPENING_IN_TRANSIT_RECEIPT"
  );
}

export function legacyOpeningInTransitSourceDisplay(params: {
  sourceStoreName?: string | null;
}): string {
  if (params.sourceStoreName && params.sourceStoreName.trim().length > 0) {
    return params.sourceStoreName;
  }
  return LEGACY_OPENING_IN_TRANSIT_SOURCE_LABEL;
}

export const STOCK_BALANCE_SORT_FIELDS = [
  "storeName",
  "itemCode",
  "itemName",
  "availableQuantity",
  "inTransitQuantity",
  "damagedQuantity",
  "discrepancyQuantity",
  "lastMovementAt",
] as const;

export type StockBalanceSortField = (typeof STOCK_BALANCE_SORT_FIELDS)[number];

const SIGNED_QUANTITY_PATTERN = /^-?(?:0|[1-9]\d{0,17})(?:\.\d{1,4})?$/;

export function isSignedQuantityString(value: string): boolean {
  return SIGNED_QUANTITY_PATTERN.test(value);
}

function toScaledQuantity(value: string): bigint {
  const trimmed = value.trim();
  if (!SIGNED_QUANTITY_PATTERN.test(trimmed)) {
    throw new Error(`Invalid quantity "${value}"`);
  }
  const negative = trimmed.startsWith("-");
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const [wholePart = "0", fractionPart = ""] = unsigned.split(".");
  const scaled =
    BigInt(wholePart) * 10_000n + BigInt(fractionPart.padEnd(4, "0"));
  return negative ? -scaled : scaled;
}

function fromScaledQuantity(value: bigint): string {
  const sign = value < 0n ? "-" : "";
  const absolute = value < 0n ? -value : value;
  const whole = absolute / 10_000n;
  const fraction = (absolute % 10_000n).toString().padStart(4, "0");
  const trimmedFraction = fraction.replace(/0+$/, "");
  return trimmedFraction.length > 0
    ? `${sign}${whole.toString()}.${trimmedFraction}`
    : `${sign}${whole.toString()}`;
}

export function formatQuantityString(value: string): string {
  return fromScaledQuantity(toScaledQuantity(value));
}

export function addQuantityStrings(left: string, right: string): string {
  return fromScaledQuantity(toScaledQuantity(left) + toScaledQuantity(right));
}

export function subtractQuantityStrings(left: string, right: string): string {
  return fromScaledQuantity(toScaledQuantity(left) - toScaledQuantity(right));
}

export function ledgerNetQuantity(
  quantityIn: string,
  quantityOut: string,
): string {
  return subtractQuantityStrings(quantityIn, quantityOut);
}

export function totalTrackedQuantity(params: {
  availableQuantity: string;
  inTransitQuantity: string;
  damagedQuantity: string;
  discrepancyQuantity: string;
}): string {
  return addQuantityStrings(
    addQuantityStrings(params.availableQuantity, params.inTransitQuantity),
    addQuantityStrings(params.damagedQuantity, params.discrepancyQuantity),
  );
}

export function isZeroQuantity(value: string): boolean {
  return toScaledQuantity(value) === 0n;
}

export function isNegativeQuantity(value: string): boolean {
  return toScaledQuantity(value) < 0n;
}

export function compareQuantityStrings(left: string, right: string): number {
  const delta = toScaledQuantity(left) - toScaledQuantity(right);
  if (delta < 0n) {
    return -1;
  }
  if (delta > 0n) {
    return 1;
  }
  return 0;
}

export function hasNonZeroTrackedQuantity(params: {
  availableQuantity: string;
  inTransitQuantity: string;
  damagedQuantity: string;
  discrepancyQuantity: string;
}): boolean {
  return !isZeroQuantity(totalTrackedQuantity(params));
}

export type StockLedgerRunningBalanceInput = {
  id: string;
  stockCategory: StockLedgerCategory;
  quantityIn: string;
  quantityOut: string;
};

export function withCategoryRunningBalances<
  T extends StockLedgerRunningBalanceInput,
>(rows: readonly T[]): Array<T & { categoryRunningBalance: string }> {
  const running = new Map<StockLedgerCategory, bigint>(
    STOCK_LEDGER_CATEGORIES.map((category) => [category, 0n]),
  );

  return rows.map((row) => {
    const next =
      (running.get(row.stockCategory) ?? 0n) +
      toScaledQuantity(ledgerNetQuantity(row.quantityIn, row.quantityOut));
    running.set(row.stockCategory, next);
    return {
      ...row,
      categoryRunningBalance: fromScaledQuantity(next),
    };
  });
}

export type StockBalanceUnitSummaryInput = {
  unitId: string;
  unitName: string;
  availableQuantity: string;
  inTransitQuantity: string;
  damagedQuantity: string;
  discrepancyQuantity: string;
};

export type StockBalanceUnitSummary = StockBalanceUnitSummaryInput & {
  rowCount: number;
  totalTrackedQuantity: string;
};

export function summarizeBalancesByUnit(
  rows: readonly StockBalanceUnitSummaryInput[],
): StockBalanceUnitSummary[] {
  const byUnit = new Map<
    string,
    {
      unitId: string;
      unitName: string;
      available: bigint;
      inTransit: bigint;
      damaged: bigint;
      discrepancy: bigint;
      rowCount: number;
    }
  >();

  for (const row of rows) {
    const existing = byUnit.get(row.unitId);
    if (existing) {
      existing.available += toScaledQuantity(row.availableQuantity);
      existing.inTransit += toScaledQuantity(row.inTransitQuantity);
      existing.damaged += toScaledQuantity(row.damagedQuantity);
      existing.discrepancy += toScaledQuantity(row.discrepancyQuantity);
      existing.rowCount += 1;
      continue;
    }
    byUnit.set(row.unitId, {
      unitId: row.unitId,
      unitName: row.unitName,
      available: toScaledQuantity(row.availableQuantity),
      inTransit: toScaledQuantity(row.inTransitQuantity),
      damaged: toScaledQuantity(row.damagedQuantity),
      discrepancy: toScaledQuantity(row.discrepancyQuantity),
      rowCount: 1,
    });
  }

  return [...byUnit.values()]
    .map((row) => ({
      unitId: row.unitId,
      unitName: row.unitName,
      availableQuantity: fromScaledQuantity(row.available),
      inTransitQuantity: fromScaledQuantity(row.inTransit),
      damagedQuantity: fromScaledQuantity(row.damaged),
      discrepancyQuantity: fromScaledQuantity(row.discrepancy),
      rowCount: row.rowCount,
      totalTrackedQuantity: fromScaledQuantity(
        row.available + row.inTransit + row.damaged + row.discrepancy,
      ),
    }))
    .sort((left, right) => left.unitName.localeCompare(right.unitName));
}
