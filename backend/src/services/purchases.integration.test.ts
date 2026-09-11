import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { and, eq } from "drizzle-orm";
import type { AuthenticatedUser } from "@printing-stationery/shared";
import { loadEnv } from "../config/env.js";
import { closePool, createDb, getDb } from "../db/client.js";
import {
  applicationUsers,
  userRoles,
} from "../db/schema/auth.js";
import { branches } from "../db/schema/branches.js";
import { employees } from "../db/schema/employees.js";
import { items } from "../db/schema/items.js";
import { stockLedger } from "../db/schema/opening-stocks.js";
import { parties } from "../db/schema/parties.js";
import { purchases } from "../db/schema/purchases.js";
import { stores } from "../db/schema/stores.js";
import { getOperationalAvailableQuantities } from "./opening-stocks.service.js";
import {
  createPurchase,
  deletePurchase,
  updatePurchase,
} from "./purchases.service.js";

const TEST_REMARKS = "PURLED-TEST purchase stock posting";

async function availableQuantity(storeId: string, itemId: string): Promise<number> {
  const rows = await getOperationalAvailableQuantities({
    storeId,
    itemIds: [itemId],
  });
  return Number(rows[0]?.availableQuantity ?? "0");
}

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

async function cleanupTestPurchases(): Promise<void> {
  const leftover = await getDb()
    .select({ id: purchases.id })
    .from(purchases)
    .where(eq(purchases.remarks, TEST_REMARKS));
  for (const row of leftover) {
    await getDb()
      .delete(stockLedger)
      .where(
        and(
          eq(stockLedger.referenceType, "PURCHASE"),
          eq(stockLedger.referenceId, row.id),
        ),
      );
    await getDb().delete(purchases).where(eq(purchases.id, row.id));
  }
}

describe("purchase stock ledger posting", { concurrency: false }, () => {
  let admin: AuthenticatedUser;
  let storeId = "";
  let partyId = "";
  let itemId = "";

  before(async () => {
    createDb(loadEnv());
    await cleanupTestPurchases();

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

    const storeRows = await getDb()
      .select({ id: stores.id, storeCode: stores.storeCode })
      .from(stores)
      .where(eq(stores.isActive, true));
    const corporate = storeRows.find((row) => row.storeCode === "999");
    const store = corporate ?? storeRows[0];
    if (!store) {
      throw new Error("An active store is required");
    }
    storeId = store.id;

    const partyRows = await getDb()
      .select({ id: parties.id })
      .from(parties)
      .where(eq(parties.isActive, true))
      .limit(1);
    if (!partyRows[0]) {
      throw new Error("An active party is required");
    }
    partyId = partyRows[0].id;

    const itemRows = await getDb()
      .select({ id: items.id })
      .from(items)
      .where(eq(items.isActive, true))
      .limit(1);
    if (!itemRows[0]) {
      throw new Error("An active item is required");
    }
    itemId = itemRows[0].id;
  });

  after(async () => {
    await cleanupTestPurchases();
    await closePool();
  });

  it("adds purchased quantity to available store stock and removes it on delete", async () => {
    const before = await availableQuantity(storeId, itemId);
    const created = await createPurchase(admin, {
      storeId,
      partyId,
      purchaseDate: "2026-09-11",
      purchaseBillDate: "2026-09-11",
      poNumber: null,
      grnNumber: null,
      deliveryNoteNumber: null,
      purchaseBillNumber: "PURLED-1",
      remarks: TEST_REMARKS,
      lines: [{ itemId, quantity: "100", rate: "10" }],
    });

    try {
      const ledgerRows = await getDb()
        .select({
          movementType: stockLedger.movementType,
          quantityIn: stockLedger.quantityIn,
          quantityOut: stockLedger.quantityOut,
          referenceType: stockLedger.referenceType,
          storeId: stockLedger.storeId,
          itemId: stockLedger.itemId,
        })
        .from(stockLedger)
        .where(
          and(
            eq(stockLedger.referenceType, "PURCHASE"),
            eq(stockLedger.referenceId, created.id),
          ),
        );
      assert.equal(ledgerRows.length, 1);
      assert.equal(ledgerRows[0]?.movementType, "PURCHASE");
      assert.equal(ledgerRows[0]?.storeId, storeId);
      assert.equal(ledgerRows[0]?.itemId, itemId);
      assert.equal(Number(ledgerRows[0]?.quantityIn), 100);
      assert.equal(Number(ledgerRows[0]?.quantityOut), 0);
      assert.equal(await availableQuantity(storeId, itemId), before + 100);

      const updated = await updatePurchase(created.id, admin, {
        storeId,
        partyId,
        purchaseDate: "2026-09-11",
        purchaseBillDate: "2026-09-11",
        poNumber: null,
        grnNumber: null,
        deliveryNoteNumber: null,
        purchaseBillNumber: "PURLED-1",
        remarks: TEST_REMARKS,
        expectedVersion: created.version,
        lines: [{ itemId, quantity: "40", rate: "10" }],
      });
      assert.equal(await availableQuantity(storeId, itemId), before + 40);

      await deletePurchase(updated.id, admin, updated.version);
      assert.equal(await availableQuantity(storeId, itemId), before);
    } catch (error) {
      await cleanupTestPurchases();
      throw error;
    }
  });
});
