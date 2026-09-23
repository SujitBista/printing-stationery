import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { and, eq, like, sql } from "drizzle-orm";
import type { AuthenticatedUser } from "@printing-stationery/shared";
import { createApp } from "../app.js";
import { loadEnv, type Env } from "../config/env.js";
import { closePool, createDb, getDb } from "../db/client.js";
import {
  applicationUsers,
  authSessions,
  userRoles,
} from "../db/schema/auth.js";
import { branches } from "../db/schema/branches.js";
import { employees } from "../db/schema/employees.js";
import { itemIssueShipments } from "../db/schema/item-issue-delivery.js";
import { items } from "../db/schema/items.js";
import {
  openingStockBatches,
  openingStockLines,
  stockLedger,
} from "../db/schema/opening-stocks.js";
import { stores } from "../db/schema/stores.js";
import { units } from "../db/schema/units.js";
import { AppError } from "../utils/errors.js";
import { generateSessionToken, hashSessionToken } from "../utils/password.js";
import { listIncomingShipments } from "./item-issue-receipts.service.js";
import {
  getOpeningStockBatch,
  getOperationalAvailableQuantities,
  postOpeningStockBatch,
  validateOpeningStockBatch,
} from "./opening-stocks.service.js";
import { listStockBalances, listStockLedgerEntries } from "./stock-balances.service.js";

const PREFIX = `OSIGN-${Date.now().toString(36)}`;
const IGNORED_WARNING =
  "Imported In-Transit Qty is ignored. In-transit stock is created only through dispatched Item Issues.";

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

describe("opening stock import ignores in-transit quantity", { concurrency: false }, () => {
  let admin: AuthenticatedUser;
  let storeId = "";
  let itemId = "";
  let unitId = "";
  let storeName = "";
  let itemName = "";
  let unitName = "";
  let env: Env;
  let server: Server;
  let baseUrl = "";
  let adminToken = "";
  let baselineAvailableCount = 0;
  let baselineAvailableQty = 0;

  async function cleanup(): Promise<void> {
    const db = getDb();
    const batchRows = await db
      .select({ id: openingStockBatches.id })
      .from(openingStockBatches)
      .where(like(openingStockBatches.batchNumber, `${PREFIX}%`));
    for (const batch of batchRows) {
      const lines = await db
        .select({ id: openingStockLines.id })
        .from(openingStockLines)
        .where(eq(openingStockLines.openingStockBatchId, batch.id));
      for (const line of lines) {
        await db.delete(stockLedger).where(eq(stockLedger.referenceLineId, line.id));
      }
      await db.delete(stockLedger).where(eq(stockLedger.referenceId, batch.id));
      await db
        .delete(openingStockLines)
        .where(eq(openingStockLines.openingStockBatchId, batch.id));
      await db.delete(openingStockBatches).where(eq(openingStockBatches.id, batch.id));
    }
  }

  async function availableOpeningSnapshot(): Promise<{ count: number; quantity: number }> {
    const rows = await getDb()
      .select({
        count: sql<string>`count(*)::text`,
        quantity: sql<string>`coalesce(sum(${stockLedger.quantityIn}), 0)::text`,
      })
      .from(stockLedger)
      .where(
        and(
          eq(stockLedger.movementType, "OPENING_STOCK"),
          eq(stockLedger.stockCategory, "AVAILABLE"),
          sql`${stockLedger.storeId} <> ${storeId}`,
        ),
      );
    return {
      count: Number(rows[0]?.count ?? 0),
      quantity: Number(rows[0]?.quantity ?? 0),
    };
  }

  async function insertBatch(params: {
    suffix: string;
    openingQuantity: string;
    openingAmount: string;
    inTransitQuantity: string;
    inTransitAmount: string;
    rate: string;
  }): Promise<{ batchId: string; lineId: string }> {
    const batchRows = await getDb()
      .insert(openingStockBatches)
      .values({
        batchNumber: `${PREFIX}-${params.suffix}`,
        sourceType: "LEGACY_IMPORT",
        cutoverDate: new Date("2026-09-18T00:00:00.000Z"),
        status: "VALIDATED",
        createdByApplicationUserId: admin.id,
      })
      .returning({ id: openingStockBatches.id });
    const batchId = batchRows[0]!.id;
    const lineRows = await getDb()
      .insert(openingStockLines)
      .values({
        openingStockBatchId: batchId,
        storeId,
        itemId,
        unitId,
        legacyStoreName: storeName,
        legacyCategoryName: "PrintingItem",
        legacyItemName: itemName,
        legacyUnitName: unitName,
        itemRate: params.rate,
        sourceOpeningQuantity: params.openingQuantity,
        sourceOpeningAmount: params.openingAmount,
        sourcePurchaseQuantity: "0",
        sourcePurchaseAmount: "0",
        sourceReceivedQuantity: "0",
        sourceReceivedAmount: "0",
        sourceConsumptionQuantity: "0",
        sourceConsumptionAmount: "0",
        sourceTransferQuantity: "0",
        sourceTransferAmount: "0",
        sourceInTransitQuantity: params.inTransitQuantity,
        sourceInTransitAmount: params.inTransitAmount,
        openingQuantity: params.openingQuantity,
        openingAmount: params.openingAmount,
        mappingStatus: "MAPPED",
        validationErrors: [],
        sourceRowNumber: "1",
        isIncludedForPosting: params.openingQuantity !== "0",
      })
      .returning({ id: openingStockLines.id });
    return { batchId, lineId: lineRows[0]!.id };
  }

  before(async () => {
    env = loadEnv();
    createDb(env);
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
        itemName: items.itemName,
        unitId: items.unitId,
        unitName: units.unitName,
      })
      .from(items)
      .innerJoin(units, eq(items.unitId, units.id))
      .where(and(eq(items.isActive, true), eq(units.isActive, true)))
      .limit(1);
    const item = itemRows[0];
    if (!item) {
      throw new Error("An active item is required");
    }
    itemId = item.id;
    unitId = item.unitId;
    itemName = item.itemName;
    unitName = item.unitName;

    const branch = await getDb()
      .insert(branches)
      .values({
        branchCode: `${PREFIX}-B`,
        branchName: "Ignored In Transit Branch",
        branchType: "BRANCH",
        isActive: true,
      })
      .returning({ id: branches.id });
    const store = await getDb()
      .insert(stores)
      .values({
        storeCode: `${PREFIX}-S`,
        storeName: "Ignored In Transit Store",
        branchId: branch[0]!.id,
        isActive: true,
      })
      .returning({ id: stores.id, storeName: stores.storeName });
    storeId = store[0]!.id;
    storeName = store[0]!.storeName;

    const baseline = await availableOpeningSnapshot();
    baselineAvailableCount = baseline.count;
    baselineAvailableQty = baseline.quantity;

    const sessionToken = generateSessionToken();
    await getDb().insert(authSessions).values({
      userId: admin.id,
      tokenHash: hashSessionToken(sessionToken),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    adminToken = sessionToken;
    const app = createApp(env);
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", () => resolve()));
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  after(async () => {
    const afterSnapshot = await availableOpeningSnapshot();
    assert.equal(afterSnapshot.count, baselineAvailableCount);
    assert.equal(afterSnapshot.quantity, baselineAvailableQty);
    try {
      await cleanup();
      await getDb().delete(authSessions).where(eq(authSessions.tokenHash, hashSessionToken(adminToken)));
      await getDb().delete(stores).where(eq(stores.id, storeId));
      await getDb().delete(branches).where(like(branches.branchCode, `${PREFIX}%`));
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
      await closePool();
    }
  });

  it("posts opening stock when imported in-transit quantity is zero", async () => {
    const { batchId, lineId } = await insertBatch({
      suffix: "ZERO",
      openingQuantity: "100",
      openingAmount: "1000",
      inTransitQuantity: "0",
      inTransitAmount: "0",
      rate: "10",
    });
    const validated = await validateOpeningStockBatch(admin, batchId);
    assert.equal(validated.canPost, true);
    assert.equal(validated.summary.inTransitRowCount, 0);
    assert.equal(validated.summary.warningMessages.includes(IGNORED_WARNING), false);

    const posted = await postOpeningStockBatch(admin, batchId, {
      confirmHistoricalCutover: true,
    });
    assert.equal(posted.postedLedgerLineCount, 1);

    const ledgerRows = await getDb()
      .select()
      .from(stockLedger)
      .where(eq(stockLedger.referenceLineId, lineId));
    assert.equal(ledgerRows.length, 1);
    assert.equal(ledgerRows[0]?.movementType, "OPENING_STOCK");
    assert.equal(ledgerRows[0]?.stockCategory, "AVAILABLE");
    assert.equal(Number(ledgerRows[0]?.quantityIn), 100);
    assert.equal(Number(ledgerRows[0]?.amountIn), 1000);
  });

  it("posts non-zero imported in-transit as available opening stock only", async () => {
    const { batchId, lineId } = await insertBatch({
      suffix: "IGNORE",
      openingQuantity: "100",
      openingAmount: "1000",
      inTransitQuantity: "20",
      inTransitAmount: "200",
      rate: "12",
    });
    const preview = await getOpeningStockBatch(admin, batchId);
    assert.deepEqual(preview.lines[0]?.validationErrors, []);
    assert.equal(Number(preview.lines[0]?.inTransitQuantity), 20);
    assert.equal(preview.summary.inTransitRowCount, 1);
    assert.equal(preview.summary.reconciliationErrorCount, 0);
    assert.equal(preview.summary.warningMessages.includes(IGNORED_WARNING), true);

    const validated = await validateOpeningStockBatch(admin, batchId);
    assert.equal(validated.canPost, true);

    const posted = await postOpeningStockBatch(admin, batchId, {
      confirmHistoricalCutover: true,
    });
    assert.equal(posted.postedLedgerLineCount, 1);

    const ledgerRows = await getDb()
      .select()
      .from(stockLedger)
      .where(eq(stockLedger.referenceLineId, lineId));
    assert.equal(ledgerRows.length, 1);
    assert.equal(ledgerRows[0]?.movementType, "OPENING_STOCK");
    assert.equal(ledgerRows[0]?.stockCategory, "AVAILABLE");
    assert.equal(Number(ledgerRows[0]?.quantityIn), 100);
    assert.equal(Number(ledgerRows[0]?.amountIn), 1000);
    assert.equal(
      ledgerRows.some((row) => row.stockCategory === "IN_TRANSIT"),
      false,
    );
    assert.equal(
      ledgerRows.some((row) => row.movementType === "LEGACY_OPENING_IN_TRANSIT"),
      false,
    );

    const shipments = await getDb()
      .select({ id: itemIssueShipments.id })
      .from(itemIssueShipments)
      .where(eq(itemIssueShipments.toStoreId, storeId));
    assert.equal(shipments.length, 0);

    const available = await getOperationalAvailableQuantities({ storeId, itemId });
    const thisItem = available.filter((row) => row.unitId === unitId);
    const availableQty = thisItem.reduce(
      (sum, row) => sum + Number(row.availableQuantity),
      0,
    );
    assert.equal(availableQty, 200);

    const balances = await listStockBalances(admin, {
      storeId,
      itemId,
      page: 1,
      pageSize: 20,
      includeZeroBalance: true,
      sortBy: "itemName",
      sortOrder: "asc",
    });
    const balance = balances.data.find((row) => row.unitId === unitId);
    assert.ok(balance);
    assert.equal(Number(balance.inTransitQuantity), 0);
    assert.equal(Number(balance.availableQuantity), 200);
    assert.equal(Number(balance.damagedQuantity), 0);
    assert.equal(Number(balance.discrepancyQuantity), 0);
    assert.equal(Number(balance.totalTrackedQuantity), 200);

    const ledger = await listStockLedgerEntries(admin, {
      storeId,
      itemId,
      unitId,
      stockCategory: "ALL",
      page: 1,
      pageSize: 50,
    });
    assert.equal(
      ledger.items.some((entry) => entry.stockCategory === "IN_TRANSIT"),
      false,
    );
    const fifoRows = await getDb()
      .select({
        quantity: sql<string>`coalesce(sum(${stockLedger.quantityIn} - ${stockLedger.quantityOut}), 0)::text`,
        amount: sql<string>`coalesce(sum(${stockLedger.amountIn} - ${stockLedger.amountOut}), 0)::text`,
      })
      .from(stockLedger)
      .where(
        and(
          eq(stockLedger.storeId, storeId),
          eq(stockLedger.itemId, itemId),
          eq(stockLedger.unitId, unitId),
          eq(stockLedger.stockCategory, "AVAILABLE"),
        ),
      );
    assert.equal(Number(fifoRows[0]?.quantity), 200);
    assert.equal(Number(fifoRows[0]?.amount), 2000);

    const incoming = await listIncomingShipments(admin, {
      page: 1,
      pageSize: 50,
      queue: "in-transit",
    });
    assert.equal(
      incoming.items.some((item) => item.toStore.id === storeId),
      false,
    );

    const response = await fetch(
      `${baseUrl}/api/stock-balances/legacy-opening-in-transit`,
      {
        headers: {
          cookie: `${env.SESSION_COOKIE_NAME}=${adminToken}`,
          origin: env.FRONTEND_ORIGIN,
        },
      },
    );
    assert.equal(response.status, 404);

    const source = await getDb()
      .select({
        quantity: openingStockLines.sourceInTransitQuantity,
        amount: openingStockLines.sourceInTransitAmount,
      })
      .from(openingStockLines)
      .where(eq(openingStockLines.id, lineId));
    assert.equal(Number(source[0]?.quantity), 20);
    assert.equal(Number(source[0]?.amount), 200);
  });

  it("rejects a second opening-stock post for the same store, item, unit, and rate", async () => {
    const { batchId } = await insertBatch({
      suffix: "DUP",
      openingQuantity: "4",
      openingAmount: "40",
      inTransitQuantity: "9",
      inTransitAmount: "90",
      rate: "10",
    });
    await assert.rejects(
      () =>
        postOpeningStockBatch(admin, batchId, {
          confirmHistoricalCutover: true,
        }),
      (error: unknown) =>
        error instanceof AppError &&
        error.statusCode === 409 &&
        /already exists/i.test(error.message),
    );
  });
});
