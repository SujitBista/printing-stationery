import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isNegativeQuantity,
  summarizeBalancesByUnit,
  withCategoryRunningBalances,
} from "@printing-stationery/shared";
import {
  emptyBalanceMessage,
  ledgerSourceStoreDisplay,
  quantityClassName,
  shouldShowNumericSummary,
} from "./stock-balance-labels";

describe("stock balance labels", () => {
  it("highlights negative available quantity", () => {
    assert.equal(isNegativeQuantity("-1"), true);
    assert.match(quantityClassName("-2", "available"), /text-danger/);
    assert.equal(quantityClassName("0", "available"), "");
  });

  it("highlights damaged and discrepancy quantities above zero", () => {
    assert.match(quantityClassName("1", "warning"), /text-amber-800/);
    assert.equal(quantityClassName("0", "warning"), "");
  });

  it("does not describe a zero balance as unavailable", () => {
    assert.equal(
      emptyBalanceMessage({
        emptyReason: "NO_MOVEMENTS",
        storeSelected: true,
        hasFilters: false,
      }),
      "No stock movements have been recorded for this store.",
    );
    assert.doesNotMatch(
      emptyBalanceMessage({
        emptyReason: "NO_MATCHES",
        storeSelected: true,
        hasFilters: true,
      }),
      /unavailable/i,
    );
  });

  it("does not combine numeric summary cards across different units", () => {
    const summaries = summarizeBalancesByUnit([
      {
        unitId: "11111111-1111-4111-8111-111111111111",
        unitName: "PCS",
        availableQuantity: "22",
        inTransitQuantity: "2",
        damagedQuantity: "1",
        discrepancyQuantity: "1",
      },
      {
        unitId: "22222222-2222-4222-8222-222222222222",
        unitName: "REAM",
        availableQuantity: "10",
        inTransitQuantity: "0",
        damagedQuantity: "0",
        discrepancyQuantity: "0",
      },
    ]);
    assert.equal(summaries.length, 2);
    assert.equal(shouldShowNumericSummary(summaries), false);
    assert.equal(
      summaries.find((row) => row.unitName === "PCS")?.availableQuantity,
      "22",
    );
  });

  it("keeps running balances separate when all categories are included", () => {
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
    assert.equal(rows[0]?.categoryRunningBalance, "20");
    assert.equal(rows[1]?.categoryRunningBalance, "5");
    assert.equal(rows[2]?.categoryRunningBalance, "25");
    assert.equal(rows[3]?.categoryRunningBalance, "0");
    assert.equal(rows[4]?.categoryRunningBalance, "22");
  });

  it("does not invent a source store when the ledger row has none", () => {
    assert.equal(
      ledgerSourceStoreDisplay({
        movementType: "OPENING_STOCK",
        sourceStore: null,
        sourceStoreLabel: null,
      }),
      "—",
    );
    assert.equal(
      ledgerSourceStoreDisplay({
        movementType: "ITEM_ISSUE_IN_TRANSIT",
        sourceStore: { storeName: "Corporate Store" },
        sourceStoreLabel: null,
      }),
      "Corporate Store",
    );
  });
});
