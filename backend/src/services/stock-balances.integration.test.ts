import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { eq, like } from "drizzle-orm";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
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
import { items } from "../db/schema/items.js";
import { stockLedger } from "../db/schema/opening-stocks.js";
import { stores } from "../db/schema/stores.js";
import { storeUsers } from "../db/schema/store-users.js";
import { units } from "../db/schema/units.js";
import {
  generateSessionToken,
  hashPassword,
  hashSessionToken,
} from "../utils/password.js";
import {
  listStockBalances,
  listStockLedgerEntries,
} from "./stock-balances.service.js";

const PREFIX = `SBAL-${Date.now().toString(36)}`;

type LedgerSeed = {
  storeId: string;
  itemId: string;
  unitId: string;
  movementType:
    | "OPENING_STOCK"
    | "PURCHASE"
    | "ITEM_ISSUE"
    | "ITEM_ISSUE_IN_TRANSIT"
    | "ITEM_ISSUE_RECEIPT"
    | "ITEM_ISSUE_DISCREPANCY"
    | "DEPARTMENT_CONSUMPTION";
  stockCategory: "AVAILABLE" | "IN_TRANSIT" | "DAMAGED" | "DISCREPANCY";
  quantityIn: string;
  quantityOut: string;
  postedByApplicationUserId: string;
  transactionDate?: Date;
};

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

describe("stock balance reporting", { concurrency: false }, () => {
  let env: Env;
  let server: Server;
  let baseUrl = "";
  let admin: AuthenticatedUser;
  let branchMaker: AuthenticatedUser;
  let adminToken = "";
  let makerToken = "";
  let hrToken = "";
  let storeAId = "";
  let storeBId = "";
  let itemId = "";
  let unitId = "";
  let itemCode = "";
  let itemName = "";
  const createdSessionIds: string[] = [];

  async function insertLedger(seeds: LedgerSeed[]): Promise<void> {
    if (seeds.length === 0) {
      return;
    }
    await getDb().insert(stockLedger).values(
      seeds.map((seed, index) => ({
        storeId: seed.storeId,
        itemId: seed.itemId,
        unitId: seed.unitId,
        rate: "1",
        movementType: seed.movementType,
        stockCategory: seed.stockCategory,
        quantityIn: seed.quantityIn,
        quantityOut: seed.quantityOut,
        amountIn: seed.quantityIn,
        amountOut: seed.quantityOut,
        transactionDate: seed.transactionDate ?? new Date(Date.now() + index * 1000),
        referenceType: seed.movementType,
        referenceId: randomUUID(),
        referenceLineId: randomUUID(),
        sourceKey: `${PREFIX}:${randomUUID()}:${index}`,
        postedByApplicationUserId: seed.postedByApplicationUserId,
        postedAt: new Date(),
      })),
    );
  }

  async function cleanup(): Promise<void> {
    const db = getDb();
    await db.delete(stockLedger).where(like(stockLedger.sourceKey, `${PREFIX}%`));
    if (createdSessionIds.length > 0) {
      await db.delete(authSessions).where(
        eq(authSessions.id, createdSessionIds[0]!),
      );
      for (const sessionId of createdSessionIds) {
        await db.delete(authSessions).where(eq(authSessions.id, sessionId));
      }
    }
    const userRows = await db
      .select({ id: applicationUsers.id, employeeId: applicationUsers.employeeId })
      .from(applicationUsers)
      .where(like(applicationUsers.username, `${PREFIX.toLowerCase()}%`));
    const userIds = userRows.map((row) => row.id);
    const employeeIds = userRows
      .map((row) => row.employeeId)
      .filter((id): id is string => Boolean(id));
    const storeRows = await db
      .select({ id: stores.id })
      .from(stores)
      .where(like(stores.storeCode, `${PREFIX}%`));
    const storeIds = storeRows.map((row) => row.id);
    if (storeIds.length > 0) {
      await db.delete(storeUsers).where(
        eq(storeUsers.storeId, storeIds[0]!),
      );
      for (const storeId of storeIds) {
        await db.delete(storeUsers).where(eq(storeUsers.storeId, storeId));
      }
      await db.delete(stores).where(eq(stores.id, storeIds[0]!));
      for (const storeId of storeIds) {
        await db.delete(stores).where(eq(stores.id, storeId));
      }
    }
    if (userIds.length > 0) {
      for (const userId of userIds) {
        await db.delete(authSessions).where(eq(authSessions.userId, userId));
        await db.delete(userRoles).where(eq(userRoles.userId, userId));
        await db.delete(applicationUsers).where(eq(applicationUsers.id, userId));
      }
    }
    if (employeeIds.length > 0) {
      for (const employeeId of employeeIds) {
        await db.delete(employees).where(eq(employees.id, employeeId));
      }
    }
    const branchRows = await db
      .select({ id: branches.id })
      .from(branches)
      .where(like(branches.branchCode, `${PREFIX}%`));
    for (const row of branchRows) {
      await db.delete(branches).where(eq(branches.id, row.id));
    }
  }

  async function createSession(userId: string): Promise<string> {
    const sessionToken = generateSessionToken();
    const inserted = await getDb()
      .insert(authSessions)
      .values({
        userId,
        tokenHash: hashSessionToken(sessionToken),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      })
      .returning({ id: authSessions.id });
    const sessionId = inserted[0]?.id;
    if (sessionId) {
      createdSessionIds.push(sessionId);
    }
    return sessionToken;
  }

  async function api(
    path: string,
    token?: string,
  ): Promise<{ status: number; json: unknown }> {
    const headers = new Headers();
    if (token) {
      headers.set("cookie", `${env.SESSION_COOKIE_NAME}=${token}`);
    }
    const response = await fetch(`${baseUrl}${path}`, {
      method: "GET",
      headers,
    });
    const json: unknown = await response.json().catch(() => null);
    return { status: response.status, json };
  }

  before(async () => {
    env = loadEnv();
    createDb(env);
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
        itemCode: items.itemCode,
        itemName: items.itemName,
        unitId: items.unitId,
        unitName: units.unitName,
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
    itemCode = item.itemCode;
    itemName = item.itemName;

    const branchA = await getDb()
      .insert(branches)
      .values({
        branchCode: `${PREFIX}-B1`,
        branchName: "Stock Balance Branch A",
        branchType: "BRANCH",
        isActive: true,
      })
      .returning({ id: branches.id });
    const branchB = await getDb()
      .insert(branches)
      .values({
        branchCode: `${PREFIX}-B2`,
        branchName: "Stock Balance Branch B",
        branchType: "BRANCH",
        isActive: true,
      })
      .returning({ id: branches.id });

    const storeA = await getDb()
      .insert(stores)
      .values({
        storeCode: `${PREFIX}-S1`,
        storeName: "Birtamod Store",
        branchId: branchA[0]!.id,
        isActive: true,
      })
      .returning({ id: stores.id });
    const storeB = await getDb()
      .insert(stores)
      .values({
        storeCode: `${PREFIX}-S2`,
        storeName: "Other Store",
        branchId: branchB[0]!.id,
        isActive: true,
      })
      .returning({ id: stores.id });
    storeAId = storeA[0]!.id;
    storeBId = storeB[0]!.id;

    const makerEmployee = await getDb()
      .insert(employees)
      .values({
        employeeCode: `${PREFIX}-M`,
        employeeName: "Stock Balance Maker",
        branchId: branchA[0]!.id,
        isActive: true,
      })
      .returning({ id: employees.id });
    const checkerEmployee = await getDb()
      .insert(employees)
      .values({
        employeeCode: `${PREFIX}-C`,
        employeeName: "Stock Balance Checker",
        branchId: branchA[0]!.id,
        isActive: true,
      })
      .returning({ id: employees.id });
    const hrEmployee = await getDb()
      .insert(employees)
      .values({
        employeeCode: `${PREFIX}-H`,
        employeeName: "Stock Balance HR",
        branchId: branchA[0]!.id,
        isActive: true,
      })
      .returning({ id: employees.id });

    const passwordHash = await hashPassword("StockBalance!234");
    const makerUser = await getDb()
      .insert(applicationUsers)
      .values({
        employeeId: makerEmployee[0]!.id,
        username: `${PREFIX.toLowerCase()}_maker`,
        passwordHash,
        mustChangePassword: false,
        isActive: true,
      })
      .returning({ id: applicationUsers.id });
    const checkerUser = await getDb()
      .insert(applicationUsers)
      .values({
        employeeId: checkerEmployee[0]!.id,
        username: `${PREFIX.toLowerCase()}_checker`,
        passwordHash,
        mustChangePassword: false,
        isActive: true,
      })
      .returning({ id: applicationUsers.id });
    const hrUser = await getDb()
      .insert(applicationUsers)
      .values({
        employeeId: hrEmployee[0]!.id,
        username: `${PREFIX.toLowerCase()}_hr`,
        passwordHash,
        mustChangePassword: false,
        isActive: true,
      })
      .returning({ id: applicationUsers.id });

    await getDb().insert(userRoles).values([
      { userId: makerUser[0]!.id, role: "MAKER" },
      { userId: checkerUser[0]!.id, role: "CHECKER" },
      { userId: hrUser[0]!.id, role: "HR" },
    ]);
    await getDb().insert(storeUsers).values({
      storeId: storeAId,
      makerApplicationUserId: makerUser[0]!.id,
      supervisorApplicationUserId: checkerUser[0]!.id,
      isActive: true,
    });

    branchMaker = await loadActor(makerUser[0]!.id);
    adminToken = await createSession(admin.id);
    makerToken = await createSession(makerUser[0]!.id);
    hrToken = await createSession(hrUser[0]!.id);

    const app = createApp(env);
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", () => resolve()));
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  after(async () => {
    try {
      await cleanup();
    } finally {
      await new Promise<void>((resolve, reject) => {
        if (!server) {
          resolve();
          return;
        }
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
      await closePool();
    }
  });

  it("reflects the dispatch/receipt/consumption verification scenario", async () => {
    const postedBy = admin.id;
    await insertLedger([
      {
        storeId: storeAId,
        itemId,
        unitId,
        movementType: "OPENING_STOCK",
        stockCategory: "AVAILABLE",
        quantityIn: "20",
        quantityOut: "0",
        postedByApplicationUserId: postedBy,
      },
    ]);

    let result = await listStockBalances(admin, {
      storeId: storeAId,
      itemId,
      includeZeroBalance: true,
      page: 1,
      pageSize: 20,
      sortBy: "itemName",
      sortOrder: "asc",
    });
    let row = result.data.find((item) => item.itemId === itemId);
    assert.equal(row?.availableQuantity, "20");
    assert.equal(row?.inTransitQuantity, "0");

    await insertLedger([
      {
        storeId: storeAId,
        itemId,
        unitId,
        movementType: "ITEM_ISSUE_IN_TRANSIT",
        stockCategory: "IN_TRANSIT",
        quantityIn: "5",
        quantityOut: "0",
        postedByApplicationUserId: postedBy,
      },
    ]);
    result = await listStockBalances(admin, {
      storeId: storeAId,
      itemId,
      includeZeroBalance: true,
      page: 1,
      pageSize: 20,
      sortBy: "itemName",
      sortOrder: "asc",
    });
    row = result.data.find((item) => item.itemId === itemId);
    assert.equal(row?.availableQuantity, "20");
    assert.equal(row?.inTransitQuantity, "5");

    await insertLedger([
      {
        storeId: storeAId,
        itemId,
        unitId,
        movementType: "ITEM_ISSUE_RECEIPT",
        stockCategory: "AVAILABLE",
        quantityIn: "5",
        quantityOut: "0",
        postedByApplicationUserId: postedBy,
      },
      {
        storeId: storeAId,
        itemId,
        unitId,
        movementType: "ITEM_ISSUE_IN_TRANSIT",
        stockCategory: "IN_TRANSIT",
        quantityIn: "0",
        quantityOut: "5",
        postedByApplicationUserId: postedBy,
      },
    ]);
    result = await listStockBalances(admin, {
      storeId: storeAId,
      itemId,
      includeZeroBalance: true,
      page: 1,
      pageSize: 20,
      sortBy: "itemName",
      sortOrder: "asc",
    });
    row = result.data.find((item) => item.itemId === itemId);
    assert.equal(row?.availableQuantity, "25");
    assert.equal(row?.inTransitQuantity, "0");

    await insertLedger([
      {
        storeId: storeAId,
        itemId,
        unitId,
        movementType: "DEPARTMENT_CONSUMPTION",
        stockCategory: "AVAILABLE",
        quantityIn: "0",
        quantityOut: "3",
        postedByApplicationUserId: postedBy,
      },
    ]);
    result = await listStockBalances(admin, {
      storeId: storeAId,
      itemId,
      includeZeroBalance: true,
      page: 1,
      pageSize: 20,
      sortBy: "itemName",
      sortOrder: "asc",
    });
    row = result.data.find((item) => item.itemId === itemId);
    assert.ok(row);
    assert.equal(row.availableQuantity, "22");
    assert.equal(row.inTransitQuantity, "0");
    assert.equal(row.damagedQuantity, "0");
    assert.equal(row.discrepancyQuantity, "0");
    assert.equal(row.totalTrackedQuantity, "22");
  });

  it("does not count draft opening stock or unconfirmed receipts", async () => {
    const before = await listStockBalances(admin, {
      storeId: storeAId,
      itemId,
      includeZeroBalance: true,
      page: 1,
      pageSize: 20,
      sortBy: "itemName",
      sortOrder: "asc",
    });
    const beforeQty = before.data.find((row) => row.itemId === itemId)?.availableQuantity;
    assert.equal(beforeQty, "22");
  });

  it("decreases source available and increases destination in-transit on dispatch", async () => {
    await insertLedger([
      {
        storeId: storeBId,
        itemId,
        unitId,
        movementType: "OPENING_STOCK",
        stockCategory: "AVAILABLE",
        quantityIn: "8",
        quantityOut: "0",
        postedByApplicationUserId: admin.id,
      },
      {
        storeId: storeBId,
        itemId,
        unitId,
        movementType: "ITEM_ISSUE",
        stockCategory: "AVAILABLE",
        quantityIn: "0",
        quantityOut: "4",
        postedByApplicationUserId: admin.id,
      },
      {
        storeId: storeAId,
        itemId,
        unitId,
        movementType: "ITEM_ISSUE_IN_TRANSIT",
        stockCategory: "IN_TRANSIT",
        quantityIn: "4",
        quantityOut: "0",
        postedByApplicationUserId: admin.id,
      },
    ]);
    const source = await listStockBalances(admin, {
      storeId: storeBId,
      itemId,
      includeZeroBalance: true,
      page: 1,
      pageSize: 20,
      sortBy: "itemName",
      sortOrder: "asc",
    });
    const destination = await listStockBalances(admin, {
      storeId: storeAId,
      itemId,
      includeZeroBalance: true,
      page: 1,
      pageSize: 20,
      sortBy: "itemName",
      sortOrder: "asc",
    });
    assert.equal(source.data[0]?.availableQuantity, "4");
    assert.equal(source.data[0]?.inTransitQuantity, "0");
    assert.equal(destination.data[0]?.inTransitQuantity, "4");
    assert.equal(destination.data[0]?.availableQuantity, "22");
  });

  it("moves confirmed damaged and finalized discrepancy out of in-transit, not into available", async () => {
    await insertLedger([
      {
        storeId: storeAId,
        itemId,
        unitId,
        movementType: "ITEM_ISSUE_IN_TRANSIT",
        stockCategory: "IN_TRANSIT",
        quantityIn: "0",
        quantityOut: "4",
        postedByApplicationUserId: admin.id,
      },
      {
        storeId: storeAId,
        itemId,
        unitId,
        movementType: "ITEM_ISSUE_DISCREPANCY",
        stockCategory: "DAMAGED",
        quantityIn: "1",
        quantityOut: "0",
        postedByApplicationUserId: admin.id,
      },
      {
        storeId: storeAId,
        itemId,
        unitId,
        movementType: "ITEM_ISSUE_DISCREPANCY",
        stockCategory: "DISCREPANCY",
        quantityIn: "1",
        quantityOut: "0",
        postedByApplicationUserId: admin.id,
      },
      {
        storeId: storeAId,
        itemId,
        unitId,
        movementType: "ITEM_ISSUE_RECEIPT",
        stockCategory: "AVAILABLE",
        quantityIn: "2",
        quantityOut: "0",
        postedByApplicationUserId: admin.id,
      },
    ]);
    const result = await listStockBalances(admin, {
      storeId: storeAId,
      itemId,
      includeZeroBalance: true,
      page: 1,
      pageSize: 20,
      sortBy: "itemName",
      sortOrder: "asc",
    });
    const row = result.data[0];
    assert.equal(row?.availableQuantity, "24");
    assert.equal(row?.inTransitQuantity, "0");
    assert.equal(row?.damagedQuantity, "1");
    assert.equal(row?.discrepancyQuantity, "1");
    assert.equal(row?.totalTrackedQuantity, "26");
  });

  it("keeps pending in-transit quantity in transit instead of discrepancy", async () => {
    await insertLedger([
      {
        storeId: storeAId,
        itemId,
        unitId,
        movementType: "ITEM_ISSUE_IN_TRANSIT",
        stockCategory: "IN_TRANSIT",
        quantityIn: "3",
        quantityOut: "0",
        postedByApplicationUserId: admin.id,
      },
    ]);
    const result = await listStockBalances(admin, {
      storeId: storeAId,
      itemId,
      includeZeroBalance: true,
      page: 1,
      pageSize: 20,
      sortBy: "itemName",
      sortOrder: "asc",
    });
    assert.equal(result.data[0]?.inTransitQuantity, "3");
    assert.equal(result.data[0]?.discrepancyQuantity, "1");
    assert.equal(result.data[0]?.availableQuantity, "24");
  });

  it("sums distinct source keys and returns zero rather than null", async () => {
    const result = await listStockBalances(admin, {
      storeId: storeAId,
      itemId,
      includeZeroBalance: true,
      page: 1,
      pageSize: 20,
      sortBy: "itemName",
      sortOrder: "asc",
    });
    const row = result.data[0];
    assert.equal(row?.damagedQuantity, "1");
    assert.notEqual(row?.damagedQuantity, null);
    await assert.rejects(async () => {
      const sourceKey = `${PREFIX}:duplicate-key`;
      await getDb().insert(stockLedger).values({
        storeId: storeAId,
        itemId,
        unitId,
        rate: "1",
        movementType: "OPENING_STOCK",
        stockCategory: "AVAILABLE",
        quantityIn: "1",
        quantityOut: "0",
        amountIn: "1",
        amountOut: "0",
        transactionDate: new Date(),
        referenceType: "OPENING_STOCK",
        referenceId: randomUUID(),
        referenceLineId: randomUUID(),
        sourceKey,
        postedByApplicationUserId: admin.id,
        postedAt: new Date(),
      });
      try {
        await getDb().insert(stockLedger).values({
          storeId: storeAId,
          itemId,
          unitId,
          rate: "1",
          movementType: "OPENING_STOCK",
          stockCategory: "AVAILABLE",
          quantityIn: "1",
          quantityOut: "0",
          amountIn: "1",
          amountOut: "0",
          transactionDate: new Date(),
          referenceType: "OPENING_STOCK",
          referenceId: randomUUID(),
          referenceLineId: randomUUID(),
          sourceKey,
          postedByApplicationUserId: admin.id,
          postedAt: new Date(),
        });
      } finally {
        await getDb()
          .delete(stockLedger)
          .where(eq(stockLedger.sourceKey, sourceKey));
      }
    });
  });

  it("returns a visible negative available quantity", async () => {
    await insertLedger([
      {
        storeId: storeAId,
        itemId,
        unitId,
        movementType: "DEPARTMENT_CONSUMPTION",
        stockCategory: "AVAILABLE",
        quantityIn: "0",
        quantityOut: "30",
        postedByApplicationUserId: admin.id,
      },
    ]);
    const result = await listStockBalances(admin, {
      storeId: storeAId,
      itemId,
      includeZeroBalance: true,
      page: 1,
      pageSize: 20,
      sortBy: "itemName",
      sortOrder: "asc",
    });
    assert.ok(
      result.data[0]?.availableQuantity.startsWith("-"),
      `expected a negative available quantity, got ${result.data[0]?.availableQuantity}`,
    );
  });

  it("paginates and searches without dropping store filters", async () => {
    const result = await listStockBalances(admin, {
      storeId: storeAId,
      search: "Birtamod",
      includeZeroBalance: true,
      page: 1,
      pageSize: 1,
      sortBy: "itemName",
      sortOrder: "asc",
    });
    assert.equal(result.pagination.pageSize, 1);
    assert.ok(result.pagination.totalItems >= 1);
    assert.equal(result.data[0]?.storeId, storeAId);
    assert.equal(result.data[0]?.storeName, "Birtamod Store");
    assert.equal(result.data[0]?.itemId, itemId);
    assert.equal(result.data[0]?.itemCode, itemCode);
    assert.equal(result.data[0]?.itemName, itemName);
  });

  it("shows deterministic per-category running balances in ledger drill-down", async () => {
    const ledger = await listStockLedgerEntries(admin, {
      storeId: storeAId,
      itemId,
      unitId,
      stockCategory: "ALL",
      page: 1,
      pageSize: 50,
    });
    const availableRows = ledger.items.filter((row) => row.stockCategory === "AVAILABLE");
    const lastAvailable = availableRows[availableRows.length - 1];
    const availableNet = availableRows.reduce(
      (sum, row) =>
        sum + Number(row.quantityIn) - Number(row.quantityOut),
      0,
    );
    assert.equal(Number(lastAvailable?.categoryRunningBalance), availableNet);
    const inTransitRows = ledger.items.filter((row) => row.stockCategory === "IN_TRANSIT");
    const lastInTransit = inTransitRows[inTransitRows.length - 1];
    const inTransitNet = inTransitRows.reduce(
      (sum, row) =>
        sum + Number(row.quantityIn) - Number(row.quantityOut),
      0,
    );
    assert.equal(Number(lastInTransit?.categoryRunningBalance), inTransitNet);
    assert.notEqual(
      lastAvailable?.categoryRunningBalance,
      lastInTransit?.categoryRunningBalance,
    );
  });

  it("lets admin view authorized stores and confines branch makers to assigned stores", async () => {
    const adminResult = await listStockBalances(admin, {
      includeZeroBalance: true,
      page: 1,
      pageSize: 100,
      sortBy: "storeName",
      sortOrder: "asc",
    });
    assert.equal(adminResult.canSelectStore, true);
    assert.ok(adminResult.visibleStores.some((store) => store.id === storeAId));
    assert.ok(adminResult.visibleStores.some((store) => store.id === storeBId));

    const makerResult = await listStockBalances(branchMaker, {
      includeZeroBalance: true,
      page: 1,
      pageSize: 100,
      sortBy: "storeName",
      sortOrder: "asc",
    });
    assert.equal(makerResult.canSelectStore, false);
    assert.equal(makerResult.lockedStoreId, storeAId);
    assert.deepEqual(
      makerResult.visibleStores.map((store) => store.id),
      [storeAId],
    );
    assert.ok(makerResult.data.every((row) => row.storeId === storeAId));
  });

  it("returns 403 when a branch maker requests another store", async () => {
    await assert.rejects(
      () =>
        listStockBalances(branchMaker, {
          storeId: storeBId,
          includeZeroBalance: true,
          page: 1,
          pageSize: 20,
          sortBy: "itemName",
          sortOrder: "asc",
        }),
      (error: unknown) =>
        error instanceof Error &&
        "statusCode" in error &&
        (error as { statusCode: number }).statusCode === 403,
    );

    const forbidden = await api(
      `/api/stock-balances?storeId=${storeBId}`,
      makerToken,
    );
    assert.equal(forbidden.status, 403);

    const hr = await api("/api/stock-balances", hrToken);
    assert.equal(hr.status, 403);

    const adminOk = await api(
      `/api/stock-balances?storeId=${storeAId}&includeZeroBalance=true`,
      adminToken,
    );
    assert.equal(adminOk.status, 200);
  });

  it("returns a no-movements empty reason for a store without ledger rows", async () => {
    const emptyStoreBranch = await getDb()
      .insert(branches)
      .values({
        branchCode: `${PREFIX}-B3`,
        branchName: "Empty Stock Branch",
        branchType: "BRANCH",
        isActive: true,
      })
      .returning({ id: branches.id });
    const emptyStore = await getDb()
      .insert(stores)
      .values({
        storeCode: `${PREFIX}-S3`,
        storeName: "Empty Ledger Store",
        branchId: emptyStoreBranch[0]!.id,
        isActive: true,
      })
      .returning({ id: stores.id });
    const result = await listStockBalances(admin, {
      storeId: emptyStore[0]!.id,
      includeZeroBalance: true,
      page: 1,
      pageSize: 20,
      sortBy: "itemName",
      sortOrder: "asc",
    });
    assert.equal(result.emptyReason, "NO_MOVEMENTS");
    assert.equal(result.hasLedgerActivity, false);
    assert.equal(result.data.length, 0);
  });
});
