import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createdByDisplayName,
  findCorporatePurchaseStore,
  formatIsoDate,
  formatPurchaseAmount,
  purchaseStoreSearchOptions,
} from "./purchase-labels.js";

describe("purchase labels", () => {
  it("formats ISO dates as DD/MM/YYYY", () => {
    assert.equal(formatIsoDate("2026-09-08"), "08/09/2026");
  });

  it("formats amounts to four decimal places", () => {
    assert.equal(formatPurchaseAmount("33600"), "33600.0000");
  });

  it("prefers the employee name for Created By", () => {
    assert.equal(
      createdByDisplayName({
        id: "1",
        username: "msoni",
        isActive: true,
        employee: {
          id: "2",
          employeeCode: "E1",
          employeeName: "Mukesh Soni",
          isActive: true,
        },
      }),
      "Mukesh Soni",
    );
  });
});

describe("purchase store default", () => {
  const corporate = {
    id: "c",
    storeCode: "999",
    storeName: "Corporate Store",
    underStoreId: null,
  };
  const branch = {
    id: "b",
    storeCode: "001",
    storeName: "Tankisinwari Store",
    underStoreId: "c",
  };
  const nested = {
    id: "n",
    storeCode: "0999",
    storeName: "Corporate Main Branch 999",
    underStoreId: "c",
  };

  it("finds Corporate Store 999 as the default", () => {
    assert.equal(
      findCorporatePurchaseStore([branch, corporate, nested])?.id,
      "c",
    );
  });

  it("keeps only other stores searchable after Corporate Store is removed", () => {
    const cleared = purchaseStoreSearchOptions(
      [corporate, branch, nested],
      "",
    );
    assert.deepEqual(
      cleared.map((store) => store.id),
      ["b", "n"],
    );
  });

  it("still shows Corporate Store when it is the selected value", () => {
    const selected = purchaseStoreSearchOptions(
      [corporate, branch, nested],
      "c",
    );
    assert.deepEqual(
      selected.map((store) => store.id),
      ["c", "b", "n"],
    );
  });
});
