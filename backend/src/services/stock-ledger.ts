import { and, asc, eq, sql } from "drizzle-orm";
import { multiplyDecimalStrings } from "@printing-stationery/shared";
import { AppError } from "../utils/errors.js";
import { getDb } from "../db/client.js";
import { stockLedger } from "../db/schema/opening-stocks.js";

export type StockLedgerCategory =
  | "AVAILABLE"
  | "IN_TRANSIT"
  | "DISCREPANCY"
  | "DAMAGED";

export type StockLedgerMovementType =
  | "OPENING_STOCK"
  | "PURCHASE"
  | "ITEM_ISSUE"
  | "ITEM_ISSUE_IN_TRANSIT"
  | "ITEM_ISSUE_RECEIPT"
  | "ITEM_ISSUE_DISCREPANCY"
  | "DEPARTMENT_CONSUMPTION";

export type StockLedgerReferenceType = StockLedgerMovementType;

export function stockLedgerSourceKey(params: {
  referenceType: StockLedgerReferenceType;
  referenceLineId: string;
  storeId: string;
  movementType: StockLedgerMovementType;
  stockCategory: StockLedgerCategory;
  rate: string;
}): string {
  return [
    params.referenceType,
    params.referenceLineId,
    params.storeId,
    params.movementType,
    params.stockCategory,
    params.rate,
  ].join(":");
}

function parseQuantityToScaled(value: string): bigint {
  const trimmed = value.trim();
  if (!/^-?\d+(?:\.\d{1,4})?$/.test(trimmed)) {
    throw new AppError("Invalid quantity format", 400);
  }
  const negative = trimmed.startsWith("-");
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const [wholePart = "0", fractionPart = ""] = unsigned.split(".");
  const normalizedWhole = wholePart.replace(/^0+(?=\d)/, "") || "0";
  const normalizedFraction = fractionPart.padEnd(4, "0");
  const scaled = BigInt(normalizedWhole) * 10_000n + BigInt(normalizedFraction);
  return negative ? -scaled : scaled;
}

function scaledToQuantity(value: bigint): string {
  const sign = value < 0n ? "-" : "";
  const absolute = value < 0n ? -value : value;
  const whole = absolute / 10_000n;
  const fraction = (absolute % 10_000n).toString().padStart(4, "0");
  const trimmedFraction = fraction.replace(/0+$/, "");
  return trimmedFraction.length > 0
    ? `${sign}${whole.toString()}.${trimmedFraction}`
    : `${sign}${whole.toString()}`;
}

export type FifoAllocation = {
  rate: string;
  quantity: string;
  amount: string;
};

export async function allocateFifoCost(
  params: {
    storeId: string;
    itemId: string;
    unitId: string;
    quantity: string;
  },
  executor: Pick<ReturnType<typeof getDb>, "select"> = getDb(),
): Promise<{ allocations: FifoAllocation[]; totalAmount: string; averageRate: string }> {
  const required = parseQuantityToScaled(params.quantity);
  if (required <= 0n) {
    throw new AppError("Quantity must be greater than zero", 400);
  }

  const layers = await executor
    .select({
      rate: stockLedger.rate,
      remainingQuantity: sql<string>`(
        coalesce(sum(${stockLedger.quantityIn}), 0) - coalesce(sum(${stockLedger.quantityOut}), 0)
      )::text`,
    })
    .from(stockLedger)
    .where(
      and(
        eq(stockLedger.storeId, params.storeId),
        eq(stockLedger.itemId, params.itemId),
        eq(stockLedger.unitId, params.unitId),
        eq(stockLedger.stockCategory, "AVAILABLE"),
      ),
    )
    .groupBy(stockLedger.rate)
    .having(
      sql`(coalesce(sum(${stockLedger.quantityIn}), 0) - coalesce(sum(${stockLedger.quantityOut}), 0)) > 0`,
    )
    .orderBy(sql`min(${stockLedger.transactionDate})`, asc(stockLedger.rate));

  const allocations: FifoAllocation[] = [];
  let remaining = required;

  for (const layer of layers) {
    if (remaining <= 0n) {
      break;
    }
    const available = parseQuantityToScaled(layer.remainingQuantity);
    if (available <= 0n) {
      continue;
    }
    const take = available < remaining ? available : remaining;
    const quantity = scaledToQuantity(take);
    allocations.push({
      rate: String(layer.rate),
      quantity,
      amount: multiplyDecimalStrings(quantity, String(layer.rate), 2),
    });
    remaining -= take;
  }

  if (remaining > 0n) {
    throw new AppError("Insufficient Corporate Store stock.", 409);
  }

  const totalAmountScaled = allocations.reduce(
    (sum, row) => sum + parseQuantityToScaled(row.amount),
    0n,
  );
  const totalAmount = scaledToQuantity(totalAmountScaled);
  const averageRate =
    required === 0n
      ? "0"
      : scaledToQuantity((totalAmountScaled * 10_000n) / required);

  return { allocations, totalAmount, averageRate };
}

export function copyFifoAllocationsForReceipt(
  allocations: FifoAllocation[],
  quantity: string,
): FifoAllocation[] {
  const required = parseQuantityToScaled(quantity);
  let remaining = required;
  const copied: FifoAllocation[] = [];
  for (const layer of allocations) {
    if (remaining <= 0n) {
      break;
    }
    const available = parseQuantityToScaled(layer.quantity);
    const take = available < remaining ? available : remaining;
    const qty = scaledToQuantity(take);
    copied.push({
      rate: layer.rate,
      quantity: qty,
      amount: multiplyDecimalStrings(qty, layer.rate, 2),
    });
    remaining -= take;
  }
  if (remaining > 0n && allocations.length > 0) {
    const last = allocations[allocations.length - 1]!;
    const qty = scaledToQuantity(remaining);
    copied.push({
      rate: last.rate,
      quantity: qty,
      amount: multiplyDecimalStrings(qty, last.rate, 2),
    });
  }
  return copied;
}
