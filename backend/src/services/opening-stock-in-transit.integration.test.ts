import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { and, eq, like } from "drizzle-orm";
import type { AuthenticatedUser } from "@printing-stationery/shared";
import { loadEnv } from "../config/env.js";
import { closePool, createDb, getDb } from "../db/client.js";
import { applicationUsers, userRoles } from "../db/schema/auth.js";
import { branches } from "../db/schema/branches.js";
import { employees } from "../db/schema/employees.js";
import { items } from "../db/schema/items.js";
import {
  openingStockBatches,
  openingStockLines,
  stockLedger,
} from "../db/schema/opening-stocks.js";
import { stores } from "../db/schema/stores.js";
import { units } from "../db/schema/units.js";
import { AppError } from "../utils/errors.js";
import {
  getOperationalAvailableQuantities,
  postOpeningStockBatch,
} from "./opening-stocks.service.js";
import {
  backfillPostedOpeningStockInTransit,
  confirmLegacyOpeningInTransitReceipt,
} from "./opening-stock-in-transit.service.js";
import { listStockBalances, listStockLedgerEntries } from "./stock-balances.service.js";
import { legacyOpeningInTransitSourceKey } from "./opening-stock-in-transit.js";

const PREFIX = `OSIT-${Date.now().toString(36)}`;

async function loadActor(userId: string): Promise<AuthenticatedUser> {
  const rows = await getDb()
    .select({
      user: applicationUsers,
      employee: employees,
      branch: branches,
    })
    .from(applicationUsers)
    .leftJoin(employees, eq(applicationUsers.employeeId, employees.id))
    .leftJoin(branches, eq(employees.branchId, branches.id))
    .where(eq(applicationUsers.id, userId))
    .limit(1);
  const row = rows[0];
  if (!row) {
    throw new Error(`User ${userId} was not found`);
  }
  const roleRows = await getDb()
    .select({ role: userRoles.role })
    .from(userRoles)
    .where(eq(userRoles.userId, userId));
  return {
    id: row.user.id,
    username: row.user.username,
    mustChangePassword: row.user.mustChangePassword,
    roles: roleRows.map((item) => item.role),
    employee:
      row.employee && row.branch
        ? {
            id: row.employee.id,
            employeeCode: row.employee.employeeCode,
            employeeName: row.employee.employeeName,
            branch: {
              id: row.branch.id,
              branchCode: row.branch.branchCode,
              branchName: row.branch.branchName,
            },
          }
        : null,
  };
}

describe("legacy opening stock in-transit", { concurrency: false }, () => {
  let admin: AuthenticatedUser;
  let storeId = "";
  let itemId = "";
  let unitId = "";
  let branchId = "";

  async function cleanup(): Promise<void> {
    const db = getDb();
    const batchRows = await db
      .select({ id: openingStockBatches.id })
      .from(openingStockBatches)
      .where(like(openingStockBatches.batchNumber, `${PREFIX}%`));
    const batchIds = batchRows.map((row) => row.id);
    if (batchIds.length > 0) {
      const lineRows = await db
        .select({ id: openingStockLines.id })
        .from(openingStockLines)
        .where(eq(openingStockLines.openingStockBatchId, batchIds[0]!));
      for (const batchId of batchIds) {
        const lines = await db
          .select({ id: openingStockLines.id })
          .from(openingStockLines)
          .where(eq(openingStockLines.openingStockBatchId, batchId));
        const lineIds = lines.map((line) => line.id);
        if (lineIds.length > 0) {
          for (const lineId of lineIds) {
            await db.delete(stockLedger).where(eq(stockLedger.referenceLineId, lineId));
          }
        }
        await db
          .delete(stockLedger)
          .where(eq(stockLedger.referenceId, batchId));
        await db
          .delete(openingStockLines)
          .where(eq(openingStockLines.openingStockBatchId, batchId));
        await db.delete(openingStockBatches).where(eq(openingStockBatches.id, batchId));
      }
      void lineRows;
    }
    const storeRows = await db
      .select({ id: stores.id })
      .from(stores)
      .where(like(stores.storeCode, `${PREFIX}%`));
    for (const row of storeRows) {
      await db.delete(stockLedger).where(eq(stockLedger.storeId, row.id));
      await db.delete(stores).where(eq(stores.id, row.id));
    }
    const branchRows = await db
      .select({ id: branches.id })
      .from(branches)
      .where(like(branches.branchCode, `${PREFIX}%`));
    for (const row of branchRows) {
      await db.delete(branches).where(eq(branches.id, row.id));
    }
  }

  async function insertBatch(params: {
    status?: "VALIDATED" | "POSTED";
    openingQuantity: string;
    inTransitQuantity: string;
    mappingStatus?: "MAPPED" | "UNMAPPED_STORE";
    storeId?: string | null;
    suffix: string;
    rate: string;
  }): Promise<{ batchId: string; lineId: string }> {
    const cutoverDate = new Date("2026-09-18T00:00:00.000Z");
    const batchRows = await getDb()
      .insert(openingStockBatches)
      .values({
        batchNumber: `${PREFIX}-${params.suffix}`,
        sourceType: "LEGACY_IMPORT",
        cutoverDate,
        status: params.status ?? "VALIDATED",
        createdByApplicationUserId: admin.id,
        postedByApplicationUserId: params.status === "POSTED" ? admin.id : null,
        postedAt: params.status === "POSTED" ? cutoverDate : null,
      })
      .returning({ id: openingStockBatches.id });
    const batchId = batchRows[0]!.id;
    const destinationStoreId =
      params.storeId === undefined ? storeId : params.storeId;
    const lineRows = await getDb()
      .insert(openingStockLines)
      .values({
        openingStockBatchId: batchId,
        storeId: destinationStoreId,
        itemId: destinationStoreId ? itemId : null,
        unitId: destinationStoreId ? unitId : null,
        legacyStoreName: "Legacy Branch Store",
        legacyCategoryName: "PrintingItem",
        legacyItemName: "Register Book",
        legacyUnitName: "PCS",
        itemRate: params.rate,
        sourceOpeningQuantity: params.openingQuantity,
        sourceOpeningAmount: "0",
        sourcePurchaseQuantity: "0",
        sourcePurchaseAmount: "0",
        sourceReceivedQuantity: "0",
        sourceReceivedAmount: "0",
        sourceConsumptionQuantity: "0",
        sourceConsumptionAmount: "0",
        sourceTransferQuantity: "0",
        sourceTransferAmount: "0",
        sourceInTransitQuantity: params.inTransitQuantity,
        sourceInTransitAmount: params.inTransitQuantity === "0" ? "0" : "50",
        openingQuantity: params.openingQuantity,
        openingAmount: params.openingQuantity === "0" ? "0" : "200",
        mappingStatus: params.mappingStatus ?? "MAPPED",
        validationErrors: [],
        sourceRowNumber: "1",
        isIncludedForPosting: params.openingQuantity !== "0",
      })
      .returning({ id: openingStockLines.id });
    return { batchId, lineId: lineRows[0]!.id };
  }

  before(async () => {
    createDb(loadEnv());
    await cleanup();

    const adminRows = await getDb()
      .select({ id: applicationUsers.id })
      .from(applicationUsers)
      .innerJoin(userRoles, eq(userRoles.userId, applicationUsers.id))
      .where(eq(userRoles.role, "ADMIN"))
      .limit(1);
    if (!adminRows[0]) {
      throw new Error("An ADMIN application user is required");
    }
    admin = await loadActor(adminRows[0].id);

    const itemRows = await getDb()
      .select({
        id: items.id,
        unitId: items.unitId,
      })
      .from(items)
      .innerJoin(units, eq(items.unitId, units.id))
      .where(eq(items.isActive, true))
      .limit(1);
    const item = itemRows[0];
    if (!item) {
      throw new Error("An active item is required");
    }
    itemId = item.id;
    unitId = item.unitId;

    const branch = await getDb()
      .insert(branches)
      .values({
        branchCode: `${PREFIX}-B`,
        branchName: "Legacy Opening In Transit Branch",
        branchType: "BRANCH",
        isActive: true,
      })
      .returning({ id: branches.id });
    branchId = branch[0]!.id;
    const store = await getDb()
      .insert(stores)
      .values({
        storeCode: `${PREFIX}-S`,
        storeName: "Destination Branch Store",
        branchId,
        isActive: true,
      })
      .returning({ id: stores.id });
    storeId = store[0]!.id;
  });

  beforeEach(async () => {
    await cleanup();
    const branch = await getDb()
      .select({ id: branches.id })
      .from(branches)
      .where(eq(branches.branchCode, `${PREFIX}-B`))
      .limit(1);
    if (!branch[0]) {
      const created = await getDb()
        .insert(branches)
        .values({
          branchCode: `${PREFIX}-B`,
          branchName: "Legacy Opening In Transit Branch",
          branchType: "BRANCH",
          isActive: true,
        })
        .returning({ id: branches.id });
      branchId = created[0]!.id;
    } else {
      branchId = branch[0].id;
    }
    const store = await getDb()
      .select({ id: stores.id })
      .from(stores)
      .where(eq(stores.storeCode, `${PREFIX}-S`))
      .limit(1);
    if (!store[0]) {
      const created = await getDb()
        .insert(stores)
        .values({
          storeCode: `${PREFIX}-S`,
          storeName: "Destination Branch Store",
          branchId,
          isActive: true,
        })
        .returning({ id: stores.id });
      storeId = created[0]!.id;
    } else {
      storeId = store[0].id;
    }
  });

  after(async () => {
    try {
      await cleanup();
    } finally {
      await closePool();
    }
  });

  it("posts 20 available and 5 imported in transit without increasing AVAILABLE", async () => {
    const { batchId, lineId } = await insertBatch({
      openingQuantity: "20",
      inTransitQuantity: "5",
      suffix: "POST",
      rate: "10",
    });
    const result = await postOpeningStockBatch(admin, batchId, {
      confirmHistoricalCutover: true,
    });
    assert.equal(result.postedLedgerLineCount, 2);

    const ledgerRows = await getDb()
      .select()
      .from(stockLedger)
      .where(eq(stockLedger.referenceLineId, lineId));
    const available = ledgerRows.find(
      (row) => row.stockCategory === "AVAILABLE" && row.movementType === "OPENING_STOCK",
    );
    const inTransit = ledgerRows.find(
      (row) =>
        row.stockCategory === "IN_TRANSIT" &&
        row.referenceType === "LEGACY_OPENING_IN_TRANSIT",
    );
    assert.equal(Number(available?.quantityIn), 20);
    assert.equal(Number(inTransit?.quantityIn), 5);
    assert.equal(inTransit?.storeId, storeId);
    assert.equal(
      inTransit?.sourceKey,
      legacyOpeningInTransitSourceKey({
        openingStockLineId: lineId,
        storeId,
        rate: String(inTransit.rate),
      }),
    );

    const operational = await getOperationalAvailableQuantities({
      storeId,
      itemId,
    });
    assert.equal(
      operational.find((row) => row.unitId === unitId)?.availableQuantity,
      "20",
    );

    const balances = await listStockBalances(admin, {
      storeId,
      itemId,
      includeZeroBalance: true,
      page: 1,
      pageSize: 20,
      sortBy: "itemName",
      sortOrder: "asc",
    });
    const row = balances.data.find((item) => item.unitId === unitId);
    assert.equal(row?.availableQuantity, "20");
    assert.equal(row?.inTransitQuantity, "5");

    const ledger = await listStockLedgerEntries(admin, {
      storeId,
      itemId,
      unitId,
      stockCategory: "IN_TRANSIT",
      page: 1,
      pageSize: 50,
    });
    const inTransitEntry = ledger.items.find(
      (entry) => entry.movementType === "LEGACY_OPENING_IN_TRANSIT",
    );
    assert.ok(inTransitEntry);
    assert.equal(inTransitEntry?.quantityIn, "5");
    assert.equal(inTransitEntry?.sourceStore, null);
    assert.equal(inTransitEntry?.sourceStoreLabel, "Legacy Opening In Transit");
    assert.equal(inTransitEntry?.destinationStore?.id, storeId);
    assert.equal(inTransitEntry?.referenceNumber?.startsWith(PREFIX), true);
    assert.ok(inTransitEntry?.transactionDate);
  });

  it("confirms receipt of 5 from 20 available and 5 in transit", async () => {
    const { batchId, lineId } = await insertBatch({
      openingQuantity: "20",
      inTransitQuantity: "5",
      suffix: "RCPT",
      rate: "11",
    });
    await postOpeningStockBatch(admin, batchId, {
      confirmHistoricalCutover: true,
    });
    const confirmed = await confirmLegacyOpeningInTransitReceipt(admin, lineId, {
      quantity: "5",
    });
    assert.equal(confirmed.availableQuantityAfter, "25");
    assert.equal(confirmed.inTransitQuantityAfter, "0");

    const balances = await listStockBalances(admin, {
      storeId,
      itemId,
      includeZeroBalance: true,
      page: 1,
      pageSize: 20,
      sortBy: "itemName",
      sortOrder: "asc",
    });
    const row = balances.data.find((item) => item.unitId === unitId);
    assert.equal(row?.availableQuantity, "25");
    assert.equal(row?.inTransitQuantity, "0");

    await assert.rejects(
      () =>
        confirmLegacyOpeningInTransitReceipt(admin, lineId, {
          quantity: "5",
        }),
      (error: unknown) =>
        error instanceof AppError &&
        error.statusCode === 409 &&
        /already been received/i.test(error.message),
    );
  });

  it("backfills already-posted batches without duplicating AVAILABLE or IN_TRANSIT", async () => {
    const { batchId, lineId } = await insertBatch({
      status: "POSTED",
      openingQuantity: "20",
      inTransitQuantity: "5",
      suffix: "BF1",
      rate: "12",
    });
    await getDb().insert(stockLedger).values({
      storeId,
      itemId,
      unitId,
      rate: "10",
      movementType: "OPENING_STOCK",
      stockCategory: "AVAILABLE",
      quantityIn: "20",
      quantityOut: "0",
      amountIn: "200",
      amountOut: "0",
      transactionDate: new Date("2026-09-18T00:00:00.000Z"),
      referenceType: "OPENING_STOCK",
      referenceId: batchId,
      referenceLineId: lineId,
      sourceKey: `${PREFIX}:available:${lineId}`,
      postedByApplicationUserId: admin.id,
      postedAt: new Date(),
    });

    const first = await backfillPostedOpeningStockInTransit();
    assert.ok(first.insertedCount >= 1);

    const afterFirst = await getDb()
      .select()
      .from(stockLedger)
      .where(eq(stockLedger.referenceLineId, lineId));
    assert.equal(
      afterFirst.filter((row) => row.stockCategory === "AVAILABLE").length,
      1,
    );
    assert.equal(
      afterFirst.filter(
        (row) =>
          row.stockCategory === "IN_TRANSIT" &&
          row.referenceType === "LEGACY_OPENING_IN_TRANSIT" &&
          Number(row.quantityIn) > 0,
      ).length,
      1,
    );

    const second = await backfillPostedOpeningStockInTransit();
    assert.equal(second.insertedCount, 0);

    const afterSecond = await getDb()
      .select()
      .from(stockLedger)
      .where(eq(stockLedger.referenceLineId, lineId));
    assert.equal(
      afterSecond.filter((row) => row.stockCategory === "AVAILABLE").length,
      1,
    );
    assert.equal(
      afterSecond.filter(
        (row) =>
          row.stockCategory === "IN_TRANSIT" &&
          row.referenceType === "LEGACY_OPENING_IN_TRANSIT" &&
          Number(row.quantityIn) > 0,
      ).length,
      1,
    );

    const operational = await getOperationalAvailableQuantities({
      storeId,
      itemId,
    });
    const available = operational.find((row) => row.unitId === unitId);
    assert.equal(available?.availableQuantity, "20");
  });

  it("creates no ledger entry when imported in-transit quantity is zero", async () => {
    const { batchId, lineId } = await insertBatch({
      openingQuantity: "8",
      inTransitQuantity: "0",
      suffix: "ZERO",
      rate: "13",
    });
    await postOpeningStockBatch(admin, batchId, {
      confirmHistoricalCutover: true,
    });
    const ledgerRows = await getDb()
      .select()
      .from(stockLedger)
      .where(
        and(
          eq(stockLedger.referenceLineId, lineId),
          eq(stockLedger.stockCategory, "IN_TRANSIT"),
        ),
      );
    assert.equal(ledgerRows.length, 0);
  });

  it("marks incomplete historical in-transit data for Admin review", async () => {
    const { lineId } = await insertBatch({
      status: "POSTED",
      openingQuantity: "20",
      inTransitQuantity: "4",
      mappingStatus: "UNMAPPED_STORE",
      storeId: null,
      suffix: "REV",
      rate: "14",
    });
    const result = await backfillPostedOpeningStockInTransit();
    assert.ok(result.reviewCount >= 1);
    const line = await getDb()
      .select()
      .from(openingStockLines)
      .where(eq(openingStockLines.id, lineId))
      .limit(1);
    assert.equal(line[0]?.needsAdminReview, true);
    assert.match(String(line[0]?.inTransitReviewReason), /Admin review/);
    const ledgerRows = await getDb()
      .select()
      .from(stockLedger)
      .where(eq(stockLedger.referenceLineId, lineId));
    assert.equal(ledgerRows.length, 0);
  });

  it("does not invent a source store for unknown legacy in-transit", async () => {
    const { batchId, lineId } = await insertBatch({
      openingQuantity: "3",
      inTransitQuantity: "2",
      suffix: "SRC",
      rate: "15",
    });
    await postOpeningStockBatch(admin, batchId, {
      confirmHistoricalCutover: true,
    });
    const ledger = await listStockLedgerEntries(admin, {
      storeId,
      itemId,
      unitId,
      stockCategory: "ALL",
      page: 1,
      pageSize: 50,
    });
    const inTransitEntry = ledger.items.find(
      (entry) =>
        entry.referenceLineId === lineId &&
        entry.movementType === "LEGACY_OPENING_IN_TRANSIT",
    );
    assert.equal(inTransitEntry?.sourceStore, null);
    assert.equal(inTransitEntry?.sourceStoreLabel, "Legacy Opening In Transit");
    assert.equal(inTransitEntry?.remarks, "Unknown legacy source");
    assert.notEqual(inTransitEntry?.destinationStore?.id, randomUUID());
    assert.equal(inTransitEntry?.destinationStore?.id, storeId);
  });
});
