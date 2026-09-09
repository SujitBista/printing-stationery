import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createPurchaseInputSchema,
  multiplyDecimalStrings,
  nepaliFiscalYearFromIsoDate,
  purchaseLineAmount,
  sumDecimalStrings,
} from "@printing-stationery/shared";

const STORE = "11111111-1111-4111-8111-111111111111";
const PARTY = "22222222-2222-4222-8222-222222222222";
const ITEM = "33333333-3333-4333-8333-333333333333";
const ITEM_B = "44444444-4444-4444-8444-444444444444";

describe("nepali fiscal year", () => {
  it("starts 2083-2084 on 16 July 2026", () => {
    assert.equal(nepaliFiscalYearFromIsoDate("2026-07-16"), "2083-2084");
  });

  it("stays on the previous year before 16 July", () => {
    assert.equal(nepaliFiscalYearFromIsoDate("2026-07-15"), "2082-2083");
  });
});

describe("purchase amounts", () => {
  it("multiplies quantity and rate to four decimal places", () => {
    assert.equal(purchaseLineAmount("10", "3360"), "33600");
    assert.equal(multiplyDecimalStrings("1.5", "2.5"), "3.75");
    assert.equal(sumDecimalStrings(["1.1", "2.2", "3.3"]), "6.6");
  });
});

describe("create purchase schema", () => {
  const valid = {
    storeId: STORE,
    partyId: PARTY,
    purchaseDate: "2026-09-08",
    purchaseBillDate: "2026-09-07",
    fiscalYear: "2083-2084",
    poNumber: null,
    grnNumber: null,
    deliveryNoteNumber: null,
    purchaseBillNumber: "273",
    itemRequestId: null,
    remarks: "Nepali Paper Purchased",
    lines: [{ itemId: ITEM, quantity: "10", rate: "3360" }],
  };

  it("accepts a complete purchase with one line", () => {
    const parsed = createPurchaseInputSchema.safeParse(valid);
    assert.equal(parsed.success, true);
  });

  it("rejects duplicate items", () => {
    const parsed = createPurchaseInputSchema.safeParse({
      ...valid,
      lines: [
        { itemId: ITEM, quantity: "1", rate: "10" },
        { itemId: ITEM, quantity: "2", rate: "10" },
      ],
    });
    assert.equal(parsed.success, false);
  });

  it("rejects an invalid fiscal year", () => {
    const parsed = createPurchaseInputSchema.safeParse({
      ...valid,
      fiscalYear: "2083",
    });
    assert.equal(parsed.success, false);
  });

  it("rejects a client-supplied purchase number", () => {
    const parsed = createPurchaseInputSchema.safeParse({
      ...valid,
      purchaseNumber: "128",
    });
    assert.equal(parsed.success, false);
  });

  it("accepts two different items", () => {
    const parsed = createPurchaseInputSchema.safeParse({
      ...valid,
      lines: [
        { itemId: ITEM, quantity: "1", rate: "10" },
        { itemId: ITEM_B, quantity: "2", rate: "5.5" },
      ],
    });
    assert.equal(parsed.success, true);
  });
});
