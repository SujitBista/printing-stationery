import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatAvailableStockQuantity } from "./item-issue-labels.js";

describe("formatAvailableStockQuantity", () => {
  it("shows zero with the item unit when there is no stock", () => {
    assert.equal(formatAvailableStockQuantity("0", "PAD"), "0 PAD");
    assert.equal(formatAvailableStockQuantity(null, "PAD"), "0 PAD");
  });

  it("groups thousands and keeps the item unit", () => {
    assert.equal(
      formatAvailableStockQuantity("7810", "PCS"),
      "7,810 PCS",
    );
  });
});
