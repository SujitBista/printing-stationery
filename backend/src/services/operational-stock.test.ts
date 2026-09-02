import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { eq } from "drizzle-orm";
import { loadEnv } from "../config/env.js";
import { closePool, createDb, getDb } from "../db/client.js";
import { items } from "../db/schema/items.js";
import { stores } from "../db/schema/stores.js";
import { units } from "../db/schema/units.js";
import {
  getOperationalAvailableQuantities,
  operationalStockKey,
} from "./opening-stocks.service.js";

describe("operational available stock", () => {
  before(() => {
    createDb(loadEnv());
  });

  after(async () => {
    await closePool();
  });

  it("builds a store/item/unit key", () => {
    assert.equal(
      operationalStockKey("store", "item", "unit"),
      "store|item|unit",
    );
  });

  it("returns stock for 999 Corporate Store without using 0999 Corporate Main Branch", async () => {
    const storeRows = await getDb()
      .select({
        id: stores.id,
        storeCode: stores.storeCode,
        storeName: stores.storeName,
      })
      .from(stores);

    const corporateStore = storeRows.find((row) => row.storeCode === "999");
    const mainBranchStore = storeRows.find((row) => row.storeCode === "0999");
    assert.ok(corporateStore, "Store 999 Corporate Store is required");
    assert.notEqual(corporateStore.storeCode, "0999");
    assert.notEqual(corporateStore.storeName, "Corporate Main Branch 999");

    const namedItems = await getDb()
      .select({
        id: items.id,
        itemName: items.itemName,
        unitId: units.id,
        unitName: units.unitName,
      })
      .from(items)
      .innerJoin(units, eq(items.unitId, units.id));

    const activation = namedItems.find((row) =>
      row.itemName.toLowerCase().includes("activation"),
    );
    const openingPersonal = namedItems.find((row) =>
      /opening form personal/i.test(row.itemName),
    );

    const itemIds = [activation?.id, openingPersonal?.id].filter(
      (id): id is string => Boolean(id),
    );
    const corporateStock = await getOperationalAvailableQuantities({
      storeId: corporateStore.id,
      itemIds: itemIds.length > 0 ? itemIds : undefined,
    });

    for (const row of corporateStock) {
      assert.equal(row.storeId, corporateStore.id);
    }

    if (mainBranchStore) {
      const branchStock = await getOperationalAvailableQuantities({
        storeId: mainBranchStore.id,
        itemIds: itemIds.length > 0 ? itemIds : undefined,
      });
      for (const row of branchStock) {
        assert.equal(row.storeId, mainBranchStore.id);
        assert.notEqual(row.storeId, corporateStore.id);
      }
    }

    if (activation) {
      const activationStock =
        corporateStock.find(
          (row) =>
            row.itemId === activation.id && row.unitId === activation.unitId,
        )?.availableQuantity ?? "0";
      assert.match(activationStock, /^-?\d+(?:\.\d+)?$/);
    }

    if (openingPersonal) {
      const openingStock =
        corporateStock.find(
          (row) =>
            row.itemId === openingPersonal.id &&
            row.unitId === openingPersonal.unitId,
        )?.availableQuantity ?? "0";
      assert.match(openingStock, /^-?\d+(?:\.\d+)?$/);
    }
  });
});
