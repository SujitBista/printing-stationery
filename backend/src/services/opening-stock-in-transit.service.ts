import { and, eq, inArray, sql } from "drizzle-orm";
import type {
  AuthenticatedUser,
  ConfirmLegacyOpeningInTransitInput,
  ConfirmLegacyOpeningInTransitResult,
} from "@printing-stationery/shared";
import {
  addQuantityStrings,
  compareQuantityStrings,
  formatQuantityString,
  isZeroQuantity,
  subtractQuantityStrings,
  userHasRole,
} from "@printing-stationery/shared";
import { getDb } from "../db/client.js";
import {
  openingStockBatches,
  openingStockLines,
  stockLedger,
} from "../db/schema/index.js";
import { AppError } from "../utils/errors.js";
import {
  databaseUnavailableError,
  isDatabaseUnavailableError,
  isStockLedgerReferenceLineUniqueViolation,
} from "../utils/db-errors.js";
import { listVisibleInventoryStores } from "./store-users.assignment.js";
import {
  getOperationalAvailableQuantities,
  lockStoreStockForUpdate,
} from "./opening-stocks.service.js";
import {
  buildLegacyOpeningInTransitLedgerValue,
  buildLegacyOpeningInTransitReceiptLedgerValues,
  classifyOpeningStockInTransitBackfill,
  legacyOpeningInTransitSourceKey,
} from "./opening-stock-in-transit.js";

const ALREADY_RECEIVED_MESSAGE =
  "This legacy opening in-transit quantity has already been received.";
const NO_REMAINING_MESSAGE =
  "There is no remaining legacy opening in-transit quantity to confirm.";
const STORE_FORBIDDEN_MESSAGE =
  "You do not have permission to confirm receipt for this store.";

function multiplyQuantityRateToAmount(quantity: string, rate: string): string {
  const toScaled = (value: string, scale: 4 | 2): bigint => {
    const trimmed = value.trim();
    const sign = trimmed.startsWith("-") ? -1n : 1n;
    const unsigned = trimmed.startsWith("-") ? trimmed.slice(1) : trimmed;
    const [whole = "0", fraction = ""] = unsigned.split(".");
    const padded = fraction.padEnd(scale, "0").slice(0, scale);
    return sign * (BigInt(whole || "0") * 10n ** BigInt(scale) + BigInt(padded || "0"));
  };
  const fromScaled = (value: bigint, scale: 4 | 2): string => {
    const sign = value < 0n ? "-" : "";
    const absolute = value < 0n ? -value : value;
    const divisor = 10n ** BigInt(scale);
    const whole = absolute / divisor;
    const fraction = (absolute % divisor).toString().padStart(scale, "0");
    const trimmed = fraction.replace(/0+$/, "");
    return trimmed.length > 0 ? `${sign}${whole}.${trimmed}` : `${sign}${whole}`;
  };
  const productScaled8 = toScaled(quantity, 4) * toScaled(rate, 4);
  const roundedToCents = (productScaled8 + 500_000n) / 1_000_000n;
  return fromScaled(roundedToCents, 2);
}

async function assertDestinationStoreAccess(
  actor: AuthenticatedUser,
  storeId: string,
): Promise<void> {
  if (userHasRole(actor.roles, "ADMIN")) {
    return;
  }
  const access = await listVisibleInventoryStores(actor);
  if (!access.stores.some((store) => store.id === storeId)) {
    throw new AppError(STORE_FORBIDDEN_MESSAGE, 403);
  }
}

function netQuantity(
  rows: Array<{ quantityIn: unknown; quantityOut: unknown }>,
): string {
  return rows.reduce(
    (total, row) =>
      subtractQuantityStrings(
        addQuantityStrings(total, String(row.quantityIn)),
        String(row.quantityOut),
      ),
    "0",
  );
}

export async function confirmLegacyOpeningInTransitReceipt(
  actor: AuthenticatedUser,
  lineId: string,
  input: ConfirmLegacyOpeningInTransitInput,
): Promise<ConfirmLegacyOpeningInTransitResult> {
  try {
    return await getDb().transaction(async (tx) => {
      const lineRows = await tx
        .select({
          line: openingStockLines,
          batch: openingStockBatches,
        })
        .from(openingStockLines)
        .innerJoin(
          openingStockBatches,
          eq(openingStockLines.openingStockBatchId, openingStockBatches.id),
        )
        .where(eq(openingStockLines.id, lineId))
        .for("update");
      const row = lineRows[0];
      if (!row) {
        throw new AppError("Opening stock line not found", 404);
      }
      if (row.batch.status !== "POSTED") {
        throw new AppError(
          "In-transit receipt can only be confirmed for posted Opening Stock.",
          409,
        );
      }
      if (row.line.needsAdminReview) {
        throw new AppError(
          row.line.inTransitReviewReason ??
            "This imported in-transit quantity needs Admin review before receipt can be confirmed.",
          409,
        );
      }
      if (!row.line.storeId || !row.line.itemId || !row.line.unitId) {
        throw new AppError(
          "Imported in-transit quantity is missing a mapped destination store, item, or unit.",
          409,
        );
      }

      await assertDestinationStoreAccess(actor, row.line.storeId);
      await lockStoreStockForUpdate(tx, row.line.storeId, [row.line.itemId]);

      const existingReceipt = await tx
        .select({ id: stockLedger.id })
        .from(stockLedger)
        .where(
          and(
            eq(stockLedger.referenceLineId, row.line.id),
            eq(stockLedger.referenceType, "LEGACY_OPENING_IN_TRANSIT_RECEIPT"),
          ),
        )
        .limit(1);
      if (existingReceipt[0]) {
        throw new AppError(ALREADY_RECEIVED_MESSAGE, 409);
      }

      const inTransitRows = await tx
        .select({
          quantityIn: stockLedger.quantityIn,
          quantityOut: stockLedger.quantityOut,
        })
        .from(stockLedger)
        .where(
          and(
            eq(stockLedger.referenceLineId, row.line.id),
            eq(stockLedger.storeId, row.line.storeId),
            eq(stockLedger.stockCategory, "IN_TRANSIT"),
          ),
        );
      const remaining = netQuantity(inTransitRows);
      if (isZeroQuantity(remaining) || compareQuantityStrings(remaining, "0") <= 0) {
        throw new AppError(NO_REMAINING_MESSAGE, 409);
      }
      if (compareQuantityStrings(input.quantity, remaining) > 0) {
        throw new AppError(
          "Confirmed quantity cannot exceed remaining in-transit quantity.",
          409,
        );
      }

      const confirmedAt = new Date();
      const amount = multiplyQuantityRateToAmount(
        input.quantity,
        String(row.line.itemRate),
      );
      await tx.insert(stockLedger).values(
        buildLegacyOpeningInTransitReceiptLedgerValues({
          storeId: row.line.storeId,
          itemId: row.line.itemId,
          unitId: row.line.unitId,
          rate: String(row.line.itemRate),
          quantity: input.quantity,
          amount,
          transactionDate: confirmedAt,
          batchId: row.batch.id,
          lineId: row.line.id,
          postedByApplicationUserId: actor.id,
          postedAt: confirmedAt,
        }),
      );

      const remainingAfter = subtractQuantityStrings(remaining, input.quantity);
      const confirmedAfter = addQuantityStrings(
        String(row.line.confirmedReceivedQuantity),
        input.quantity,
      );
      await tx
        .update(openingStockLines)
        .set({
          remainingInTransitQuantity: remainingAfter,
          confirmedReceivedQuantity: confirmedAfter,
          updatedAt: sql`now()`,
        })
        .where(eq(openingStockLines.id, row.line.id));

      const balances = await getOperationalAvailableQuantities(
        {
          storeId: row.line.storeId,
          itemId: row.line.itemId,
        },
        tx,
      );
      const availableAfter =
        balances.find(
          (balance) =>
            balance.storeId === row.line.storeId &&
            balance.itemId === row.line.itemId &&
            balance.unitId === row.line.unitId,
        )?.availableQuantity ?? "0";

      return {
        openingStockLineId: row.line.id,
        openingStockBatchId: row.batch.id,
        confirmedQuantity: formatQuantityString(input.quantity),
        remainingInTransitQuantity: remainingAfter,
        availableQuantityAfter: availableAfter,
        inTransitQuantityAfter: remainingAfter,
      };
    });
  } catch (error) {
    if (isStockLedgerReferenceLineUniqueViolation(error)) {
      throw new AppError(ALREADY_RECEIVED_MESSAGE, 409, { cause: error });
    }
    if (isDatabaseUnavailableError(error)) {
      throw databaseUnavailableError(error);
    }
    throw error;
  }
}

export type OpeningStockInTransitBackfillResult = {
  insertedCount: number;
  skippedExistingCount: number;
  reviewCount: number;
  unchangedAvailableCount: number;
};

export async function backfillPostedOpeningStockInTransit(): Promise<OpeningStockInTransitBackfillResult> {
  try {
    return await getDb().transaction(async (tx) => {
      const postedLines = await tx
        .select({
          line: openingStockLines,
          batch: openingStockBatches,
        })
        .from(openingStockLines)
        .innerJoin(
          openingStockBatches,
          eq(openingStockLines.openingStockBatchId, openingStockBatches.id),
        )
        .where(eq(openingStockBatches.status, "POSTED"));

      const lineIds = postedLines.map((row) => row.line.id);
      const existingInTransit =
        lineIds.length > 0
          ? await tx
              .select({
                referenceLineId: stockLedger.referenceLineId,
                sourceKey: stockLedger.sourceKey,
                quantityIn: stockLedger.quantityIn,
                quantityOut: stockLedger.quantityOut,
                stockCategory: stockLedger.stockCategory,
              })
              .from(stockLedger)
              .where(
                and(
                  inArray(stockLedger.referenceLineId, lineIds),
                  eq(stockLedger.stockCategory, "IN_TRANSIT"),
                ),
              )
          : [];
      const existingByLine = new Map<string, typeof existingInTransit>();
      for (const row of existingInTransit) {
        const current = existingByLine.get(row.referenceLineId) ?? [];
        current.push(row);
        existingByLine.set(row.referenceLineId, current);
      }

      const receiptLineIds =
        lineIds.length > 0
          ? new Set(
              (
                await tx
                  .select({ referenceLineId: stockLedger.referenceLineId })
                  .from(stockLedger)
                  .where(
                    and(
                      inArray(stockLedger.referenceLineId, lineIds),
                      eq(
                        stockLedger.referenceType,
                        "LEGACY_OPENING_IN_TRANSIT_RECEIPT",
                      ),
                    ),
                  )
              ).map((row) => row.referenceLineId),
            )
          : new Set<string>();

      const availableCountRows =
        lineIds.length > 0
          ? await tx
              .select({ id: stockLedger.id })
              .from(stockLedger)
              .where(
                and(
                  inArray(stockLedger.referenceLineId, lineIds),
                  eq(stockLedger.referenceType, "OPENING_STOCK"),
                  eq(stockLedger.stockCategory, "AVAILABLE"),
                ),
              )
          : [];

      let insertedCount = 0;
      let skippedExistingCount = 0;
      let reviewCount = 0;
      const inserts: ReturnType<typeof buildLegacyOpeningInTransitLedgerValue>[] =
        [];
      const reviewUpdates: Array<{ id: string; reason: string }> = [];
      const remainingUpdates: string[] = [];

      for (const { line, batch } of postedLines) {
        const expectedSourceKey = line.storeId
          ? legacyOpeningInTransitSourceKey({
              openingStockLineId: line.id,
              storeId: line.storeId,
              rate: String(line.itemRate),
            })
          : "";
        const existing = (existingByLine.get(line.id) ?? []).filter(
          (row) => compareQuantityStrings(String(row.quantityIn), "0") > 0,
        );
        const decision = classifyOpeningStockInTransitBackfill({
          sourceInTransitQuantity: String(line.sourceInTransitQuantity),
          storeId: line.storeId,
          itemId: line.itemId,
          unitId: line.unitId,
          mappingStatus: line.mappingStatus,
          expectedSourceKey,
          existingInTransitEntries: existing.map((row) => ({
            sourceKey: row.sourceKey,
            quantityIn: String(row.quantityIn),
            quantityOut: String(row.quantityOut),
          })),
        });

        if (decision.action === "NONE") {
          continue;
        }
        if (decision.action === "REVIEW") {
          reviewCount += 1;
          reviewUpdates.push({ id: line.id, reason: decision.reason });
          continue;
        }
        if (decision.action === "SKIP_EXISTING") {
          skippedExistingCount += 1;
          if (!receiptLineIds.has(line.id)) {
            remainingUpdates.push(line.id);
          }
          continue;
        }

        inserts.push(
          buildLegacyOpeningInTransitLedgerValue({
            storeId: line.storeId!,
            itemId: line.itemId!,
            unitId: line.unitId!,
            rate: String(line.itemRate),
            quantityIn: String(line.sourceInTransitQuantity),
            amountIn: String(line.sourceInTransitAmount),
            transactionDate: batch.cutoverDate,
            batchId: batch.id,
            lineId: line.id,
            postedByApplicationUserId:
              batch.postedByApplicationUserId ?? batch.createdByApplicationUserId,
            postedAt: batch.postedAt ?? batch.updatedAt,
          }),
        );
        remainingUpdates.push(line.id);
        insertedCount += 1;
      }

      if (inserts.length > 0) {
        await tx.insert(stockLedger).values(inserts).onConflictDoNothing({
          target: stockLedger.sourceKey,
        });
      }

      for (const update of reviewUpdates) {
        await tx
          .update(openingStockLines)
          .set({
            needsAdminReview: true,
            inTransitReviewReason: update.reason,
            updatedAt: sql`now()`,
          })
          .where(eq(openingStockLines.id, update.id));
      }

      if (remainingUpdates.length > 0) {
        await tx
          .update(openingStockLines)
          .set({
            remainingInTransitQuantity: sql`${openingStockLines.sourceInTransitQuantity}`,
            updatedAt: sql`now()`,
          })
          .where(inArray(openingStockLines.id, remainingUpdates));
      }

      return {
        insertedCount,
        skippedExistingCount,
        reviewCount,
        unchangedAvailableCount: availableCountRows.length,
      };
    });
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      throw databaseUnavailableError(error);
    }
    throw error;
  }
}
