import { randomBytes } from "node:crypto";
import { and, asc, count, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import type {
  AuthenticatedUser,
  CancelOpeningStockInput,
  CreateManualOpeningStockInput,
  OpeningStockBatchLine,
  OpeningStockBatchSummary,
  OpeningStockItemSummary,
  OpeningStockListQuery,
  OpeningStockMappingStatus,
  OpeningStockPostResult,
  OpeningStockPreview,
  OpeningStockPreviewSummary,
  OpeningStockStoreSummary,
  OpeningStockUnitSummary,
  OpeningStockValidationResult,
  PaginatedOpeningStockResponse,
  PostOpeningStockInput,
  StockBalanceResponse,
  StockBalanceListQuery,
} from "@printing-stationery/shared";
import { getDb } from "../db/client.js";
import {
  applicationUsers,
  items,
  openingStockBatches,
  openingStockLines,
  stockLedger,
  stores,
  units,
} from "../db/schema/index.js";
import { AppError } from "../utils/errors.js";
import { databaseUnavailableError, isDatabaseUnavailableError } from "../utils/db-errors.js";

const HISTORICAL_CUTOVER_WARNING =
  "This cutover date is before today. Confirm this is intentional before posting.";
const IN_TRANSIT_WARNING =
  "Rows with In Transit quantity were detected and will not be posted as opening stock.";
const MASTER_DATA_REQUIRED_MESSAGE =
  "Create at least one store name in Store Setup and one item name in Item Setup before creating opening stock.";

function isAdmin(user: AuthenticatedUser): boolean {
  return user.roles.includes("ADMIN");
}

function requireOpeningStockAdmin(actor: AuthenticatedUser): void {
  if (!isAdmin(actor)) {
    throw new AppError("Forbidden", 403);
  }
}

function formatDateOnly(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

function stripCommas(value: string): string {
  return value.replace(/,/g, "");
}

function normalizeNumericCell(value: string): string {
  const trimmed = stripCommas(value.trim());
  if (trimmed === "-" || trimmed === "") {
    return "0";
  }
  if (!/^-?\d+(?:\.\d+)?$/.test(trimmed)) {
    throw new AppError(`Invalid numeric value "${value}".`, 400);
  }
  const [wholePart = "0", fraction = ""] = trimmed.split(".");
  const normalizedWhole = wholePart.replace(/^(-?)0+(?=\d)/, "$1") || "0";
  const normalizedFraction = fraction.replace(/0+$/, "");
  return normalizedFraction.length > 0
    ? `${normalizedWhole}.${normalizedFraction}`
    : normalizedWhole;
}

function parseScaled(value: string, scale: 4 | 2): bigint {
  const normalized = normalizeNumericCell(value);
  const sign = normalized.startsWith("-") ? -1n : 1n;
  const unsigned = normalized.startsWith("-") ? normalized.slice(1) : normalized;
  const parts = unsigned.split(".");
  const whole = parts[0] ?? "0";
  const fraction = parts[1] ?? "";
  const multiplier = 10n ** BigInt(scale);
  const padded = fraction.padEnd(scale, "0").slice(0, scale);
  return sign * (BigInt(whole || "0") * multiplier + BigInt(padded || "0"));
}

function formatScaled(value: bigint, scale: 4 | 2): string {
  const sign = value < 0n ? "-" : "";
  const absolute = value < 0n ? -value : value;
  const divisor = 10n ** BigInt(scale);
  const whole = absolute / divisor;
  const fraction = (absolute % divisor).toString().padStart(scale, "0");
  const trimmed = fraction.replace(/0+$/, "");
  return trimmed.length > 0 ? `${sign}${whole}.${trimmed}` : `${sign}${whole}`;
}

function multiplyQuantityRateToAmount(quantity: string, rate: string): string {
  const quantityScaled = parseScaled(quantity, 4);
  const rateScaled = parseScaled(rate, 4);
  const productScaled8 = quantityScaled * rateScaled;
  const roundedToCents = (productScaled8 + 500_000n) / 1_000_000n;
  return formatScaled(roundedToCents, 2);
}

async function getOpeningStockBatchSummaryById(id: string): Promise<OpeningStockBatchSummary> {
  const rows = await getDb()
    .select({
      batch: openingStockBatches,
      createdById: applicationUsers.id,
      createdByUsername: applicationUsers.username,
      lineCount: sql<number>`(
        select count(*)::int from ${openingStockLines}
        where ${openingStockLines.openingStockBatchId} = ${openingStockBatches.id}
      )`,
      validLineCount: sql<number>`(
        select count(*)::int from ${openingStockLines}
        where ${openingStockLines.openingStockBatchId} = ${openingStockBatches.id}
          and ${openingStockLines.mappingStatus} = 'MAPPED'
      )`,
      postableLineCount: sql<number>`(
        select count(*)::int from ${openingStockLines}
        where ${openingStockLines.openingStockBatchId} = ${openingStockBatches.id}
          and ${openingStockLines.mappingStatus} = 'MAPPED'
          and ${openingStockLines.isIncludedForPosting}
          and ${openingStockLines.openingQuantity} > 0
      )`,
    })
    .from(openingStockBatches)
    .innerJoin(
      applicationUsers,
      eq(openingStockBatches.createdByApplicationUserId, applicationUsers.id),
    )
    .where(eq(openingStockBatches.id, id))
    .limit(1);

  const row = rows[0];
  if (!row) {
    throw new AppError("Opening stock batch not found", 404);
  }

  return {
    id: row.batch.id,
    batchNumber: row.batch.batchNumber,
    sourceType: row.batch.sourceType,
    sourceFilename: row.batch.sourceFilename ?? null,
    sourceFileHash: row.batch.sourceFileHash ?? null,
    cutoverDate: row.batch.cutoverDate.toISOString().slice(0, 10),
    sourceReportFromDate: formatDateOnly(row.batch.sourceReportFromDate),
    sourceReportToDate: formatDateOnly(row.batch.sourceReportToDate),
    status: row.batch.status,
    remarks: row.batch.remarks ?? null,
    lineCount: Number(row.lineCount ?? 0),
    validLineCount: Number(row.validLineCount ?? 0),
    postableLineCount: Number(row.postableLineCount ?? 0),
    createdAt: row.batch.createdAt.toISOString(),
    updatedAt: row.batch.updatedAt.toISOString(),
    validatedAt: row.batch.validatedAt?.toISOString() ?? null,
    postedAt: row.batch.postedAt?.toISOString() ?? null,
    createdBy: {
      id: row.createdById,
      username: row.createdByUsername,
    },
  };
}

async function mapLineRow(
  line: typeof openingStockLines.$inferSelect,
): Promise<OpeningStockBatchLine> {
  const [storeRow, itemRow, unitRow] = await Promise.all([
    line.storeId
      ? getDb()
          .select({
            id: stores.id,
            storeCode: stores.storeCode,
            storeName: stores.storeName,
            isActive: stores.isActive,
          })
          .from(stores)
          .where(eq(stores.id, line.storeId))
          .limit(1)
      : Promise.resolve([]),
    line.itemId
      ? getDb()
          .select({
            id: items.id,
            itemCode: items.itemCode,
            itemName: items.itemName,
            isActive: items.isActive,
            unitId: units.id,
            unitName: units.unitName,
            unitActive: units.isActive,
          })
          .from(items)
          .innerJoin(units, eq(items.unitId, units.id))
          .where(eq(items.id, line.itemId))
          .limit(1)
      : Promise.resolve([]),
    line.unitId
      ? getDb()
          .select({
            id: units.id,
            unitName: units.unitName,
            isActive: units.isActive,
          })
          .from(units)
          .where(eq(units.id, line.unitId))
          .limit(1)
      : Promise.resolve([]),
  ]);

  const store: OpeningStockStoreSummary | null = storeRow[0]
    ? {
        id: storeRow[0].id,
        storeCode: storeRow[0].storeCode,
        storeName: storeRow[0].storeName,
        isActive: storeRow[0].isActive,
      }
    : null;
  const unit: OpeningStockUnitSummary | null = unitRow[0]
    ? {
        id: unitRow[0].id,
        unitName: unitRow[0].unitName,
        isActive: unitRow[0].isActive,
      }
    : null;
  const item: OpeningStockItemSummary | null = itemRow[0]
    ? {
        id: itemRow[0].id,
        itemCode: itemRow[0].itemCode,
        itemName: itemRow[0].itemName,
        isActive: itemRow[0].isActive,
        unit: {
          id: itemRow[0].unitId,
          unitName: itemRow[0].unitName,
          isActive: itemRow[0].unitActive,
        },
      }
    : null;

  return {
    id: line.id,
    sourceRowNumber: Number(line.sourceRowNumber),
    legacyStoreName: line.legacyStoreName,
    legacyCategoryName: line.legacyCategoryName,
    legacyItemName: line.legacyItemName,
    legacyUnitName: line.legacyUnitName,
    itemRate: String(line.itemRate),
    openingQuantity: String(line.sourceOpeningQuantity),
    openingAmount: String(line.sourceOpeningAmount),
    purchaseQuantity: String(line.sourcePurchaseQuantity),
    purchaseAmount: String(line.sourcePurchaseAmount),
    receivedQuantity: String(line.sourceReceivedQuantity),
    receivedAmount: String(line.sourceReceivedAmount),
    consumptionQuantity: String(line.sourceConsumptionQuantity),
    consumptionAmount: String(line.sourceConsumptionAmount),
    transferQuantity: String(line.sourceTransferQuantity),
    transferAmount: String(line.sourceTransferAmount),
    inTransitQuantity: String(line.sourceInTransitQuantity),
    inTransitAmount: String(line.sourceInTransitAmount),
    closingQuantity: String(line.openingQuantity),
    closingAmount: String(line.openingAmount),
    storeId: line.storeId,
    itemId: line.itemId,
    unitId: line.unitId,
    mappingStatus: line.mappingStatus,
    validationErrors: [...line.validationErrors],
    isIncludedForPosting: line.isIncludedForPosting,
    store,
    item,
    unit,
  };
}

function buildSummaryFromLines(
  lines: Array<{
    mappingStatus: OpeningStockMappingStatus;
    validationErrors: string[];
    legacyStoreName: string;
    legacyItemName: string;
    legacyUnitName: string;
    openingQuantity: string;
    inTransitQuantity: string;
    sourceRowSignature: string;
  }>,
  batch: OpeningStockBatchSummary,
  reportTitle: string | null,
  sourceFilename: string | null,
  sourceFileHash: string | null,
): OpeningStockPreviewSummary {
  const unmappedStores = new Set<string>();
  const unmappedItems = new Set<string>();
  const unmappedUnits = new Set<string>();
  const duplicateSignatures = new Set<string>();
  const seenSignatures = new Set<string>();
  let mappedRowCount = 0;
  let invalidNumericRowCount = 0;
  let zeroClosingRowCount = 0;
  let negativeClosingRowCount = 0;
  let inTransitRowCount = 0;
  let reconciliationErrorCount = 0;

  for (const line of lines) {
    if (line.mappingStatus === "MAPPED" && line.validationErrors.length === 0) {
      mappedRowCount += 1;
    }
    if (line.mappingStatus === "UNMAPPED_STORE" || line.mappingStatus === "AMBIGUOUS_STORE") {
      unmappedStores.add(line.legacyStoreName);
    }
    if (line.mappingStatus === "UNMAPPED_ITEM" || line.mappingStatus === "AMBIGUOUS_ITEM") {
      unmappedItems.add(line.legacyItemName);
    }
    if (
      line.mappingStatus === "UNMAPPED_UNIT" ||
      line.mappingStatus === "AMBIGUOUS_UNIT" ||
      line.mappingStatus === "UNIT_MISMATCH"
    ) {
      unmappedUnits.add(line.legacyUnitName);
    }
    if (line.validationErrors.some((error) => error.includes("reconcile"))) {
      reconciliationErrorCount += 1;
    }
    if (parseScaled(line.openingQuantity, 4) === 0n) {
      zeroClosingRowCount += 1;
    }
    if (parseScaled(line.openingQuantity, 4) < 0n) {
      negativeClosingRowCount += 1;
    }
    if (parseScaled(line.inTransitQuantity, 4) > 0n) {
      inTransitRowCount += 1;
    }
    if (line.validationErrors.some((error) => error.includes("Invalid numeric"))) {
      invalidNumericRowCount += 1;
    }
    if (seenSignatures.has(line.sourceRowSignature)) {
      duplicateSignatures.add(line.sourceRowSignature);
    }
    seenSignatures.add(line.sourceRowSignature);
  }

  const today = new Date();
  const cutover = new Date(batch.cutoverDate);
  const warnings = [HISTORICAL_CUTOVER_WARNING];
  if (inTransitRowCount > 0) {
    warnings.push(IN_TRANSIT_WARNING);
  }
  if (today.toISOString().slice(0, 10) <= batch.cutoverDate) {
    warnings.splice(warnings.indexOf(HISTORICAL_CUTOVER_WARNING), 1);
  }

  return {
    sourceFilename,
    sourceFileHash,
    reportTitle,
    sourceReportFromDate: batch.sourceReportFromDate,
    sourceReportToDate: batch.sourceReportToDate,
    cutoverDate: batch.cutoverDate,
    isHistoricalCutover: cutover.toISOString().slice(0, 10) < today.toISOString().slice(0, 10),
    totalStoreCount: new Set(lines.map((line) => line.legacyStoreName)).size,
    totalDetailRowCount: lines.length,
    mappedRowCount,
    unmappedStoreCount: unmappedStores.size,
    unmappedItemCount: unmappedItems.size,
    unmappedUnitCount: unmappedUnits.size,
    invalidNumericRowCount,
    duplicateSourceRowCount: duplicateSignatures.size,
    zeroClosingRowCount,
    negativeClosingRowCount,
    inTransitRowCount,
    reconciliationErrorCount,
    fileAlreadyImported: false,
    warningMessages: warnings,
  };
}

async function buildPreview(batchId: string): Promise<OpeningStockPreview> {
  const batch = await getOpeningStockBatchSummaryById(batchId);
  const lineRows = await getDb()
    .select()
    .from(openingStockLines)
    .where(eq(openingStockLines.openingStockBatchId, batchId))
    .orderBy(
      asc(openingStockLines.legacyStoreName),
      asc(openingStockLines.legacyCategoryName),
      asc(openingStockLines.sourceRowNumber),
      asc(openingStockLines.id),
    );

  const lines = await Promise.all(lineRows.map((line) => mapLineRow(line)));
  const batchRow = await getDb()
    .select()
    .from(openingStockBatches)
    .where(eq(openingStockBatches.id, batchId))
    .limit(1);
  const rawBatch = batchRow[0];
  if (!rawBatch) {
    throw new AppError("Opening stock batch not found", 404);
  }

  const summary = buildSummaryFromLines(
    lines.map((line) => ({
      mappingStatus: line.mappingStatus,
      validationErrors: line.validationErrors,
      legacyStoreName: line.legacyStoreName,
      legacyItemName: line.legacyItemName,
      legacyUnitName: line.legacyUnitName,
      openingQuantity: line.closingQuantity,
      inTransitQuantity: line.inTransitQuantity,
      sourceRowSignature: [
        line.legacyStoreName,
        line.legacyCategoryName,
        line.legacyItemName,
        line.legacyUnitName,
        line.itemRate,
      ].join("|"),
    })),
    batch,
    rawBatch.reportTitle ?? null,
    rawBatch.sourceFilename ?? null,
    rawBatch.sourceFileHash ?? null,
  );

  return {
    batch,
    summary,
    lines,
  };
}

function generateBatchNumber(prefix: string): string {
  const now = new Date();
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");
  return `${prefix}-${year}${month}${day}-${randomBytes(3).toString("hex").toUpperCase()}`;
}

export async function listOpeningStockBatches(
  actor: AuthenticatedUser,
  query: OpeningStockListQuery,
): Promise<PaginatedOpeningStockResponse> {
  requireOpeningStockAdmin(actor);

  const conditions: SQL[] = [];
  if (query.status !== "ALL") {
    conditions.push(eq(openingStockBatches.status, query.status));
  }
  if (query.sourceType !== "ALL") {
    conditions.push(eq(openingStockBatches.sourceType, query.sourceType));
  }
  if (query.search) {
    conditions.push(
      or(
        ilike(openingStockBatches.batchNumber, `%${query.search}%`),
        ilike(openingStockBatches.sourceFilename, `%${query.search}%`),
        ilike(openingStockBatches.remarks, `%${query.search}%`),
      )!,
    );
  }
  const where = conditions.length === 0 ? undefined : conditions.length === 1 ? conditions[0] : and(...conditions);

  const countBase = getDb().select({ value: count() }).from(openingStockBatches);
  const countRows = where ? await countBase.where(where) : await countBase;
  const totalItems = countRows[0]?.value ?? 0;
  const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / query.pageSize);
  const offset = (query.page - 1) * query.pageSize;

  const listBase = getDb()
    .select({ id: openingStockBatches.id })
    .from(openingStockBatches)
    .orderBy(desc(openingStockBatches.createdAt), desc(openingStockBatches.id))
    .limit(query.pageSize)
    .offset(offset);
  const rows = where ? await listBase.where(where) : await listBase;
  const items = await Promise.all(rows.map((row) => getOpeningStockBatchSummaryById(row.id)));
  return { items, page: query.page, pageSize: query.pageSize, totalItems, totalPages };
}

export async function getOpeningStockBatch(
  actor: AuthenticatedUser,
  batchId: string,
): Promise<OpeningStockPreview> {
  requireOpeningStockAdmin(actor);
  return buildPreview(batchId);
}

export async function createManualOpeningStockBatch(
  actor: AuthenticatedUser,
  input: CreateManualOpeningStockInput,
): Promise<OpeningStockPreview> {
  requireOpeningStockAdmin(actor);

  const [activeStoreCountRows, activeItemCountRows] = await Promise.all([
    getDb()
      .select({ value: count() })
      .from(stores)
      .where(eq(stores.isActive, true)),
    getDb()
      .select({ value: count() })
      .from(items)
      .where(eq(items.isActive, true)),
  ]);
  const activeStoreCount = Number(activeStoreCountRows[0]?.value ?? 0);
  const activeItemCount = Number(activeItemCountRows[0]?.value ?? 0);
  if (activeStoreCount === 0 || activeItemCount === 0) {
    throw new AppError(MASTER_DATA_REQUIRED_MESSAGE, 400);
  }

  const storeRows = await getDb()
    .select({ id: stores.id, storeName: stores.storeName, isActive: stores.isActive })
    .from(stores)
    .where(eq(stores.id, input.storeId))
    .limit(1);
  if (!storeRows[0]) {
    throw new AppError("Selected store was not found.", 400);
  }
  if (!storeRows[0].isActive) {
    throw new AppError("Selected store is inactive.", 400);
  }

  const itemIds = input.lines.map((line) => line.itemId);
  const itemRows = await getDb()
    .select({
      id: items.id,
      itemName: items.itemName,
      itemCode: items.itemCode,
      isActive: items.isActive,
      unitId: items.unitId,
      unitName: units.unitName,
      unitActive: units.isActive,
    })
    .from(items)
    .innerJoin(units, eq(items.unitId, units.id))
    .where(inArray(items.id, itemIds));
  const itemById = new Map(itemRows.map((row) => [row.id, row]));

  const inserted = await getDb().transaction(async (tx) => {
    const batchRows = await tx
      .insert(openingStockBatches)
      .values({
        batchNumber: generateBatchNumber("OSM"),
        sourceType: "MANUAL",
        cutoverDate: new Date(`${input.cutoverDate}T00:00:00.000Z`),
        status: "DRAFT",
        remarks: input.remarks,
        createdByApplicationUserId: actor.id,
      })
      .returning({ id: openingStockBatches.id });
    const batchId = batchRows[0]?.id;
    if (!batchId) {
      throw new AppError("Failed to create opening stock batch.", 500);
    }

    const lineValues: Array<typeof openingStockLines.$inferInsert> = input.lines.map((line, index) => {
      const item = itemById.get(line.itemId);
      if (!item) {
        throw new AppError("Selected item was not found.", 400);
      }
      if (!item.isActive) {
        throw new AppError("Selected item is inactive.", 400);
      }
      if (!item.unitActive) {
        throw new AppError("Selected item unit is inactive.", 400);
      }
      const amount = multiplyQuantityRateToAmount(line.quantity, line.rate);
      return {
        openingStockBatchId: batchId,
        storeId: input.storeId,
        itemId: item.id,
        unitId: item.unitId,
        legacyStoreName: storeRows[0]!.storeName,
        legacyCategoryName: "MANUAL",
        legacyItemName: item.itemName,
        legacyUnitName: item.unitName,
        itemRate: line.rate,
        sourceOpeningQuantity: "0",
        sourceOpeningAmount: "0",
        sourcePurchaseQuantity: "0",
        sourcePurchaseAmount: "0",
        sourceReceivedQuantity: "0",
        sourceReceivedAmount: "0",
        sourceConsumptionQuantity: "0",
        sourceConsumptionAmount: "0",
        sourceTransferQuantity: "0",
        sourceTransferAmount: "0",
        sourceInTransitQuantity: "0",
        sourceInTransitAmount: "0",
        openingQuantity: line.quantity,
        openingAmount: amount,
        mappingStatus: "MAPPED" as const,
        validationErrors: [] as string[],
        sourceRowNumber: String(index + 1),
        isIncludedForPosting: true,
      };
    });
    await tx.insert(openingStockLines).values(lineValues);
    return batchId;
  });

  return buildPreview(inserted);
}

export async function validateOpeningStockBatch(
  actor: AuthenticatedUser,
  batchId: string,
): Promise<OpeningStockValidationResult> {
  requireOpeningStockAdmin(actor);
  const preview = await buildPreview(batchId);
  const canPost = preview.lines.every(
    (line) =>
      line.mappingStatus === "MAPPED" &&
      line.validationErrors.every((error) => !error.includes("separate migration")) &&
      !line.validationErrors.some((error) =>
        /reconcile|Negative closing quantity|inactive|does not match/i.test(error),
      ),
  );

  await getDb()
    .update(openingStockBatches)
    .set({
      status: canPost ? "VALIDATED" : "FAILED",
      validatedByApplicationUserId: actor.id,
      validatedAt: new Date(),
      updatedAt: sql`now()`,
    })
    .where(eq(openingStockBatches.id, batchId));

  const refreshed = await buildPreview(batchId);
  return {
    batch: refreshed.batch,
    summary: refreshed.summary,
    canPost,
  };
}

export async function postOpeningStockBatch(
  actor: AuthenticatedUser,
  batchId: string,
  input: PostOpeningStockInput,
): Promise<OpeningStockPostResult> {
  requireOpeningStockAdmin(actor);

  try {
    return await getDb().transaction(async (tx) => {
      const batchRows = await tx
        .select()
        .from(openingStockBatches)
        .where(eq(openingStockBatches.id, batchId))
        .for("update");
      const batch = batchRows[0];
      if (!batch) {
        throw new AppError("Opening stock batch not found", 404);
      }
      if (batch.status === "POSTED") {
        throw new AppError("This opening-stock batch has already been posted.", 409);
      }
      if (batch.status === "CANCELLED") {
        throw new AppError("Cancelled opening-stock batches cannot be posted.", 409);
      }
      if (
        batch.cutoverDate.toISOString().slice(0, 10) <
          new Date().toISOString().slice(0, 10) &&
        !input.confirmHistoricalCutover
      ) {
        throw new AppError(HISTORICAL_CUTOVER_WARNING, 409);
      }

      const lineRows = await tx
        .select()
        .from(openingStockLines)
        .where(eq(openingStockLines.openingStockBatchId, batchId))
        .for("update");
      if (lineRows.length === 0) {
        throw new AppError("Opening stock batch has no lines.", 409);
      }

      const postableLines = lineRows.filter(
        (line) => line.isIncludedForPosting && parseScaled(String(line.openingQuantity), 4) > 0n,
      );

      for (const line of lineRows) {
        const hasBlockingError = line.validationErrors.some((error) =>
          /reconcile|Negative closing quantity|inactive|does not match/i.test(error),
        );
        if (line.mappingStatus !== "MAPPED" || hasBlockingError) {
          throw new AppError("All included opening-stock lines must be valid and mapped before posting.", 409);
        }
      }

      for (const line of postableLines) {
        if (parseScaled(String(line.sourceInTransitQuantity), 4) > 0n) {
          throw new AppError("Rows with In Transit quantity cannot be posted as ordinary opening stock.", 409);
        }
      }

      const duplicateConflictChecks = await Promise.all(
        postableLines.map((line) =>
          tx
            .select({ id: stockLedger.id })
            .from(stockLedger)
            .where(
              and(
                eq(stockLedger.storeId, line.storeId!),
                eq(stockLedger.itemId, line.itemId!),
                eq(stockLedger.unitId, line.unitId!),
                eq(stockLedger.rate, line.itemRate),
                eq(stockLedger.transactionDate, batch.cutoverDate),
              ),
            )
            .limit(1),
        ),
      );
      if (duplicateConflictChecks.some((rows) => rows[0])) {
        throw new AppError(
          "Opening stock already exists for one or more store/item/unit/rate combinations at this cutover date.",
          409,
        );
      }

      if (postableLines.length > 0) {
        await tx.insert(stockLedger).values(
          postableLines.map((line) => ({
            storeId: line.storeId!,
            itemId: line.itemId!,
            unitId: line.unitId!,
            rate: line.itemRate,
            movementType: "OPENING_STOCK" as const,
            quantityIn: line.openingQuantity,
            quantityOut: "0",
            amountIn: line.openingAmount,
            amountOut: "0",
            transactionDate: batch.cutoverDate,
            referenceType: "OPENING_STOCK" as const,
            referenceId: batch.id,
            referenceLineId: line.id,
            postedByApplicationUserId: actor.id,
            postedAt: new Date(),
          })),
        );
      }

      await tx
        .update(openingStockBatches)
        .set({
          status: "POSTED",
          postedByApplicationUserId: actor.id,
          postedAt: new Date(),
          updatedAt: sql`now()`,
        })
        .where(eq(openingStockBatches.id, batchId));

      const batchSummary = await getOpeningStockBatchSummaryById(batchId);
      const distinctBalanceRows = new Set(
        postableLines.map((line) => `${line.storeId}|${line.itemId}|${line.unitId}|${line.itemRate}`),
      );
      return {
        batch: batchSummary,
        postedLedgerLineCount: postableLines.length,
        postedBalanceGroupCount: distinctBalanceRows.size,
      };
    });
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      throw databaseUnavailableError(error);
    }
    throw error;
  }
}

export async function cancelOpeningStockBatch(
  actor: AuthenticatedUser,
  batchId: string,
  input: CancelOpeningStockInput,
): Promise<OpeningStockPreview> {
  requireOpeningStockAdmin(actor);
  const rows = await getDb()
    .select()
    .from(openingStockBatches)
    .where(eq(openingStockBatches.id, batchId))
    .limit(1);
  const batch = rows[0];
  if (!batch) {
    throw new AppError("Opening stock batch not found", 404);
  }
  if (batch.status === "POSTED") {
    throw new AppError("Posted opening-stock batches cannot be cancelled.", 409);
  }
  await getDb()
    .update(openingStockBatches)
    .set({
      status: "CANCELLED",
      remarks: input.remarks ?? batch.remarks,
      cancelledByApplicationUserId: actor.id,
      cancelledAt: new Date(),
      updatedAt: sql`now()`,
    })
    .where(eq(openingStockBatches.id, batchId));
  return buildPreview(batchId);
}

export async function listStockBalances(
  actor: AuthenticatedUser,
  query: StockBalanceListQuery,
): Promise<StockBalanceResponse> {
  requireOpeningStockAdmin(actor);
  const conditions: SQL[] = [];
  if (query.storeId) {
    conditions.push(eq(stockLedger.storeId, query.storeId));
  }
  if (query.itemId) {
    conditions.push(eq(stockLedger.itemId, query.itemId));
  }
  const where = conditions.length === 0 ? undefined : conditions.length === 1 ? conditions[0] : and(...conditions);

  const grouped = await getDb()
    .select({
      storeId: stores.id,
      storeCode: stores.storeCode,
      storeName: stores.storeName,
      itemId: items.id,
      itemCode: items.itemCode,
      itemName: items.itemName,
      unitId: units.id,
      unitName: units.unitName,
      rate: stockLedger.rate,
      quantityIn: sql<string>`coalesce(sum(${stockLedger.quantityIn}), 0)::text`,
      quantityOut: sql<string>`coalesce(sum(${stockLedger.quantityOut}), 0)::text`,
      amountIn: sql<string>`coalesce(sum(${stockLedger.amountIn}), 0)::text`,
      amountOut: sql<string>`coalesce(sum(${stockLedger.amountOut}), 0)::text`,
    })
    .from(stockLedger)
    .innerJoin(stores, eq(stockLedger.storeId, stores.id))
    .innerJoin(items, eq(stockLedger.itemId, items.id))
    .innerJoin(units, eq(stockLedger.unitId, units.id))
    .where(where)
    .groupBy(
      stores.id,
      stores.storeCode,
      stores.storeName,
      items.id,
      items.itemCode,
      items.itemName,
      units.id,
      units.unitName,
      stockLedger.rate,
    )
    .orderBy(asc(stores.storeName), asc(items.itemName), asc(units.unitName), asc(stockLedger.rate));

  const balances = grouped.map((row) => {
    const quantityIn = row.quantityIn;
    const quantityOut = row.quantityOut;
    const amountIn = row.amountIn;
    const amountOut = row.amountOut;
    return {
      store: {
        id: row.storeId,
        storeCode: row.storeCode,
        storeName: row.storeName,
      },
      item: {
        id: row.itemId,
        itemCode: row.itemCode,
        itemName: row.itemName,
      },
      unit: {
        id: row.unitId,
        unitName: row.unitName,
      },
      rate: String(row.rate),
      quantityIn,
      quantityOut,
      availableQuantity: formatScaled(
        parseScaled(quantityIn, 4) - parseScaled(quantityOut, 4),
        4,
      ),
      amountIn,
      amountOut,
      availableAmount: formatScaled(
        parseScaled(amountIn, 2) - parseScaled(amountOut, 2),
        2,
      ),
    };
  });

  const operationalMap = new Map<string, bigint>();
  for (const balance of balances) {
    const key = `${balance.store.id}|${balance.item.id}|${balance.unit.id}`;
    operationalMap.set(
      key,
      (operationalMap.get(key) ?? 0n) + parseScaled(balance.availableQuantity, 4),
    );
  }

  return {
    balances,
    operationalSummaries: [...operationalMap.entries()].map(([key, quantity]) => {
      const [storeId, itemId, unitId] = key.split("|");
      return {
        storeId: storeId!,
        itemId: itemId!,
        unitId: unitId!,
        availableQuantity: formatScaled(quantity, 4),
      };
    }),
  };
}
