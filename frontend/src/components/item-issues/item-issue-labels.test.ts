import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatAvailableStockQuantity,
  itemIssueDisplayedRemainingQuantity,
  itemIssueQtyColumnLabel,
  itemIssueRemainingColumnLabel,
} from "./item-issue-labels.js";

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

describe("item issue remaining quantity labels", () => {
  const line = {
    requestLineId: "11111111-1111-4111-8111-111111111111",
    itemId: "22222222-2222-4222-8222-222222222222",
    itemCode: "PEN-01",
    itemName: "Pen",
    unit: { id: "33333333-3333-4333-8333-333333333333", unitName: "Pcs" },
    requestedQuantity: "10",
    previouslyIssuedQuantity: "0",
    thisIssueQuantity: "5",
    outstandingBeforeThisIssue: "10",
    remainingQuantity: "5",
    remainingAfterIssue: "5",
    availableStockQuantity: "20",
    stockBalanceKnown: true,
  };

  it("labels posted remaining as Remaining After Issue", () => {
    assert.equal(itemIssueRemainingColumnLabel("POSTED"), "Remaining After Issue");
    assert.equal(itemIssueQtyColumnLabel("POSTED"), "Qty Issued Now");
    assert.equal(itemIssueDisplayedRemainingQuantity(line, "POSTED"), "5");
  });

  it("does not present outstanding as remaining on draft or submitted issues", () => {
    const draftLine = {
      ...line,
      remainingQuantity: "10",
      remainingAfterIssue: null,
    };
    assert.equal(
      itemIssueRemainingColumnLabel("DRAFT"),
      "Outstanding Before This Issue",
    );
    assert.equal(
      itemIssueRemainingColumnLabel("PENDING_VERIFICATION"),
      "Outstanding Before This Issue",
    );
    assert.equal(itemIssueQtyColumnLabel("DRAFT"), "Issue Qty");
    assert.equal(
      itemIssueDisplayedRemainingQuantity(draftLine, "DRAFT"),
      "10",
    );
  });
});
