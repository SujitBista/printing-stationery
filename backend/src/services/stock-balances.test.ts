import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addQuantityStrings,
  hasNonZeroTrackedQuantity,
  ledgerNetQuantity,
  summarizeBalancesByUnit,
  totalTrackedQuantity,
  withCategoryRunningBalances,
} from "@printing-stationery/shared";

describe("stock balance formulas", () => {
  it("treats posted opening stock plus receipt minus consumption as available quantity", () => {
    const available = addQuantityStrings(
      addQuantityStrings("20", "5"),
      ledgerNetQuantity("0", "3"),
    );
    assert.equal(available, "22");
    assert.equal(
      totalTrackedQuantity({
        availableQuantity: "22",
        inTransitQuantity: "2",
        damagedQuantity: "1",
        discrepancyQuantity: "1",
      }),
      "26",
    );
  });

  it("keeps available, in-transit, damaged, and discrepancy separate", () => {
    const tracked = totalTrackedQuantity({
      availableQuantity: "22",
      inTransitQuantity: "2",
      damagedQuantity: "1",
      discrepancyQuantity: "1",
    });
    assert.notEqual(tracked, "22");
    assert.equal(tracked, "26");
  });

  it("returns zero rather than omitting a category with no movements", () => {
    assert.equal(ledgerNetQuantity("0", "0"), "0");
    assert.equal(
      hasNonZeroTrackedQuantity({
        availableQuantity: "0",
        inTransitQuantity: "0",
        damagedQuantity: "0",
        discrepancyQuantity: "0",
      }),
      false,
    );
  });

  it("does not sum mixed units into one total", () => {
    const summaries = summarizeBalancesByUnit([
      {
        unitId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        unitName: "PCS",
        availableQuantity: "22",
        inTransitQuantity: "2",
        damagedQuantity: "1",
        discrepancyQuantity: "1",
      },
      {
        unitId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        unitName: "KG",
        availableQuantity: "4",
        inTransitQuantity: "0",
        damagedQuantity: "0",
        discrepancyQuantity: "0",
      },
    ]);
    assert.equal(summaries.length, 2);
    assert.equal(
      summaries.find((row) => row.unitName === "PCS")?.availableQuantity,
      "22",
    );
    assert.equal(
      summaries.find((row) => row.unitName === "KG")?.availableQuantity,
      "4",
    );
  });

  it("computes per-category running balances in deterministic order", () => {
    const rows = withCategoryRunningBalances([
      {
        id: "1",
        stockCategory: "AVAILABLE",
        quantityIn: "20",
        quantityOut: "0",
      },
      {
        id: "2",
        stockCategory: "IN_TRANSIT",
        quantityIn: "5",
        quantityOut: "0",
      },
      {
        id: "3",
        stockCategory: "AVAILABLE",
        quantityIn: "5",
        quantityOut: "0",
      },
      {
        id: "4",
        stockCategory: "IN_TRANSIT",
        quantityIn: "0",
        quantityOut: "5",
      },
      {
        id: "5",
        stockCategory: "AVAILABLE",
        quantityIn: "0",
        quantityOut: "3",
      },
    ]);
    assert.deepEqual(
      rows.map((row) => row.categoryRunningBalance),
      ["20", "5", "25", "0", "22"],
    );
  });
});
