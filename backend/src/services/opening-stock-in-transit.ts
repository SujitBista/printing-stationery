import {
  compareQuantityStrings,
  isNegativeQuantity,
  isZeroQuantity,
  LEGACY_OPENING_IN_TRANSIT_SOURCE_LABEL,
  UNKNOWN_LEGACY_SOURCE_LABEL,
} from "@printing-stationery/shared";
import type { NewStockLedgerRow } from "../db/schema/opening-stocks.js";
import { stockLedgerSourceKey } from "./stock-ledger.js";

export {
  LEGACY_OPENING_IN_TRANSIT_SOURCE_LABEL,
  UNKNOWN_LEGACY_SOURCE_LABEL,
};

export const LEGACY_OPENING_IN_TRANSIT_REVIEW_REASONS = {
  INCOMPLETE_MAPPING:
    "Imported in-transit quantity is missing a mapped destination store, item, or unit and needs Admin review.",
  NEGATIVE_QUANTITY:
    "Imported in-transit quantity is negative and needs Admin review.",
  AMBIGUOUS_EXISTING_LEDGER:
    "Existing in-transit ledger rows for this Opening Stock line are ambiguous and need Admin review.",
  SOURCE_KEY_MISMATCH:
    "An existing in-transit ledger row does not match the deterministic source key and needs Admin review.",
  QUANTITY_MISMATCH:
    "Existing in-transit quantity does not match the imported in-transit quantity and needs Admin review.",
} as const;

export type LegacyOpeningInTransitReviewReason =
  (typeof LEGACY_OPENING_IN_TRANSIT_REVIEW_REASONS)[keyof typeof LEGACY_OPENING_IN_TRANSIT_REVIEW_REASONS];

export type OpeningStockInTransitBackfillDecision =
  | { action: "NONE" }
  | { action: "INSERT" }
  | { action: "SKIP_EXISTING" }
  | { action: "REVIEW"; reason: LegacyOpeningInTransitReviewReason };

export type ExistingInTransitLedger = {
  sourceKey: string;
  quantityIn: string;
  quantityOut: string;
};

export function legacyOpeningInTransitSourceKey(params: {
  openingStockLineId: string;
  storeId: string;
  rate: string;
}): string {
  return stockLedgerSourceKey({
    referenceType: "LEGACY_OPENING_IN_TRANSIT",
    referenceLineId: params.openingStockLineId,
    storeId: params.storeId,
    movementType: "LEGACY_OPENING_IN_TRANSIT",
    stockCategory: "IN_TRANSIT",
    rate: String(params.rate),
  });
}

export function legacyOpeningInTransitReceiptAvailableSourceKey(params: {
  openingStockLineId: string;
  storeId: string;
  rate: string;
}): string {
  return stockLedgerSourceKey({
    referenceType: "LEGACY_OPENING_IN_TRANSIT_RECEIPT",
    referenceLineId: params.openingStockLineId,
    storeId: params.storeId,
    movementType: "LEGACY_OPENING_IN_TRANSIT_RECEIPT",
    stockCategory: "AVAILABLE",
    rate: String(params.rate),
  });
}

export function legacyOpeningInTransitReceiptOutSourceKey(params: {
  openingStockLineId: string;
  storeId: string;
  rate: string;
}): string {
  return stockLedgerSourceKey({
    referenceType: "LEGACY_OPENING_IN_TRANSIT_RECEIPT",
    referenceLineId: params.openingStockLineId,
    storeId: params.storeId,
    movementType: "LEGACY_OPENING_IN_TRANSIT",
    stockCategory: "IN_TRANSIT",
    rate: String(params.rate),
  });
}

export function classifyOpeningStockInTransitBackfill(params: {
  sourceInTransitQuantity: string | null | undefined;
  storeId: string | null;
  itemId: string | null;
  unitId: string | null;
  mappingStatus: string;
  expectedSourceKey: string;
  existingInTransitEntries: readonly ExistingInTransitLedger[];
}): OpeningStockInTransitBackfillDecision {
  const quantity = params.sourceInTransitQuantity?.trim() || "0";
  if (isZeroQuantity(quantity)) {
    return { action: "NONE" };
  }
  if (isNegativeQuantity(quantity)) {
    return {
      action: "REVIEW",
      reason: LEGACY_OPENING_IN_TRANSIT_REVIEW_REASONS.NEGATIVE_QUANTITY,
    };
  }
  if (
    !params.storeId ||
    !params.itemId ||
    !params.unitId ||
    params.mappingStatus !== "MAPPED"
  ) {
    return {
      action: "REVIEW",
      reason: LEGACY_OPENING_IN_TRANSIT_REVIEW_REASONS.INCOMPLETE_MAPPING,
    };
  }

  const existing = params.existingInTransitEntries;
  if (existing.length > 1) {
    return {
      action: "REVIEW",
      reason: LEGACY_OPENING_IN_TRANSIT_REVIEW_REASONS.AMBIGUOUS_EXISTING_LEDGER,
    };
  }
  if (existing.length === 1) {
    const row = existing[0]!;
    if (row.sourceKey !== params.expectedSourceKey) {
      return {
        action: "REVIEW",
        reason: LEGACY_OPENING_IN_TRANSIT_REVIEW_REASONS.SOURCE_KEY_MISMATCH,
      };
    }
    if (compareQuantityStrings(row.quantityIn, quantity) !== 0) {
      return {
        action: "REVIEW",
        reason: LEGACY_OPENING_IN_TRANSIT_REVIEW_REASONS.QUANTITY_MISMATCH,
      };
    }
    return { action: "SKIP_EXISTING" };
  }

  return { action: "INSERT" };
}

export function buildLegacyOpeningInTransitLedgerValue(params: {
  storeId: string;
  itemId: string;
  unitId: string;
  rate: string;
  quantityIn: string;
  amountIn: string;
  transactionDate: Date;
  batchId: string;
  lineId: string;
  postedByApplicationUserId: string;
  postedAt: Date;
}): NewStockLedgerRow {
  return {
    storeId: params.storeId,
    itemId: params.itemId,
    unitId: params.unitId,
    rate: params.rate,
    movementType: "LEGACY_OPENING_IN_TRANSIT",
    stockCategory: "IN_TRANSIT",
    quantityIn: params.quantityIn,
    quantityOut: "0",
    amountIn: params.amountIn,
    amountOut: "0",
    transactionDate: params.transactionDate,
    referenceType: "LEGACY_OPENING_IN_TRANSIT",
    referenceId: params.batchId,
    referenceLineId: params.lineId,
    sourceKey: legacyOpeningInTransitSourceKey({
      openingStockLineId: params.lineId,
      storeId: params.storeId,
      rate: params.rate,
    }),
    postedByApplicationUserId: params.postedByApplicationUserId,
    postedAt: params.postedAt,
  };
}

export function buildLegacyOpeningInTransitReceiptLedgerValues(params: {
  storeId: string;
  itemId: string;
  unitId: string;
  rate: string;
  quantity: string;
  amount: string;
  transactionDate: Date;
  batchId: string;
  lineId: string;
  postedByApplicationUserId: string;
  postedAt: Date;
}): NewStockLedgerRow[] {
  return [
    {
      storeId: params.storeId,
      itemId: params.itemId,
      unitId: params.unitId,
      rate: params.rate,
      movementType: "LEGACY_OPENING_IN_TRANSIT_RECEIPT",
      stockCategory: "AVAILABLE",
      quantityIn: params.quantity,
      quantityOut: "0",
      amountIn: params.amount,
      amountOut: "0",
      transactionDate: params.transactionDate,
      referenceType: "LEGACY_OPENING_IN_TRANSIT_RECEIPT",
      referenceId: params.batchId,
      referenceLineId: params.lineId,
      sourceKey: legacyOpeningInTransitReceiptAvailableSourceKey({
        openingStockLineId: params.lineId,
        storeId: params.storeId,
        rate: params.rate,
      }),
      postedByApplicationUserId: params.postedByApplicationUserId,
      postedAt: params.postedAt,
    },
    {
      storeId: params.storeId,
      itemId: params.itemId,
      unitId: params.unitId,
      rate: params.rate,
      movementType: "LEGACY_OPENING_IN_TRANSIT",
      stockCategory: "IN_TRANSIT",
      quantityIn: "0",
      quantityOut: params.quantity,
      amountIn: "0",
      amountOut: params.amount,
      transactionDate: params.transactionDate,
      referenceType: "LEGACY_OPENING_IN_TRANSIT_RECEIPT",
      referenceId: params.batchId,
      referenceLineId: params.lineId,
      sourceKey: legacyOpeningInTransitReceiptOutSourceKey({
        openingStockLineId: params.lineId,
        storeId: params.storeId,
        rate: params.rate,
      }),
      postedByApplicationUserId: params.postedByApplicationUserId,
      postedAt: params.postedAt,
    },
  ];
}
