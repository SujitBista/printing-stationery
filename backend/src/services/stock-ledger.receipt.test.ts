import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fifoAllocationsForReceiptSlice } from "./stock-ledger.js";

describe("fifoAllocationsForReceiptSlice", () => {
  it("preserves dispatched rates and continues after a prior partial receipt", () => {
    const layers = [
      { rate: "10", quantity: "4", amount: "40" },
      { rate: "25", quantity: "6", amount: "150" },
    ];
    const first = fifoAllocationsForReceiptSlice({
      dispatchLayers: layers,
      previouslyConsumedQuantity: "0",
      receivedQuantity: "4",
    });
    assert.equal(first[0]?.rate, "10");
    assert.equal(first[0]?.quantity, "4");
    assert.equal(Number(first[0]?.amount), 40);

    const second = fifoAllocationsForReceiptSlice({
      dispatchLayers: layers,
      previouslyConsumedQuantity: "4",
      receivedQuantity: "3",
    });
    assert.equal(second[0]?.rate, "25");
    assert.equal(second[0]?.quantity, "3");
    assert.equal(Number(second[0]?.amount), 75);
  });
});