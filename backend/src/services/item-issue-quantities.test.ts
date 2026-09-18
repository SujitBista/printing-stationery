import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  itemIssueLineQuantities,
  remainingRequestedQuantity,
  remainingInTransitQuantity,
  shipmentLineQuantityBalance,
} from "@printing-stationery/shared";

describe("remainingRequestedQuantity", () => {
  it("is requested minus total posted issue qty", () => {
    assert.equal(remainingRequestedQuantity("10", "5"), "5");
    assert.equal(remainingRequestedQuantity("10", "0"), "10");
    assert.equal(remainingRequestedQuantity("10", "10"), "0");
  });

  it("floors remaining at zero when posted exceeds requested", () => {
    assert.equal(remainingRequestedQuantity("10", "12"), "0");
  });
});

describe("itemIssueLineQuantities", () => {
  it("shows remaining after the first partial posted issue", () => {
    const quantities = itemIssueLineQuantities({
      requestedQuantity: "10",
      previouslyIssuedQuantity: "0",
      thisIssueQuantity: "5",
      currentIssuePosted: true,
    });

    assert.equal(quantities.requestedQuantity, "10");
    assert.equal(quantities.previouslyIssuedQuantity, "0");
    assert.equal(quantities.thisIssueQuantity, "5");
    assert.equal(quantities.outstandingBeforeThisIssue, "10");
    assert.equal(quantities.remainingAfterIssue, "5");
    assert.equal(quantities.remainingQuantity, "5");
    assert.equal(quantities.postedIssuedQuantity, "5");
  });

  it("keeps previously issued as earlier posted qty only across multiple posted issues", () => {
    const quantities = itemIssueLineQuantities({
      requestedQuantity: "10",
      previouslyIssuedQuantity: "4",
      thisIssueQuantity: "6",
      currentIssuePosted: true,
    });

    assert.equal(quantities.previouslyIssuedQuantity, "4");
    assert.equal(quantities.thisIssueQuantity, "6");
    assert.equal(quantities.remainingAfterIssue, "0");
    assert.equal(quantities.remainingQuantity, "0");
    assert.equal(quantities.postedIssuedQuantity, "10");
  });

  it("does not reduce remaining for a draft or submitted issue", () => {
    for (const thisIssueQuantity of ["5", "3"]) {
      const quantities = itemIssueLineQuantities({
        requestedQuantity: "10",
        previouslyIssuedQuantity: "0",
        thisIssueQuantity,
        currentIssuePosted: false,
      });

      assert.equal(quantities.outstandingBeforeThisIssue, "10");
      assert.equal(quantities.remainingAfterIssue, null);
      assert.equal(quantities.remainingQuantity, "10");
      assert.equal(quantities.postedIssuedQuantity, "0");
    }
  });

  it("shows remaining quantity 0 for a fully issued request", () => {
    const quantities = itemIssueLineQuantities({
      requestedQuantity: "10",
      previouslyIssuedQuantity: "10",
      thisIssueQuantity: "0",
      currentIssuePosted: false,
    });

    assert.equal(quantities.remainingQuantity, "0");
    assert.equal(quantities.outstandingBeforeThisIssue, "0");
    assert.equal(quantities.remainingAfterIssue, null);
  });

  it("keeps request remaining and posted issue remaining after issue consistent", () => {
    const requestRemaining = remainingRequestedQuantity("10", "5");
    const issueQuantities = itemIssueLineQuantities({
      requestedQuantity: "10",
      previouslyIssuedQuantity: "0",
      thisIssueQuantity: "5",
      currentIssuePosted: true,
    });

    assert.equal(requestRemaining, "5");
    assert.equal(issueQuantities.remainingAfterIssue, requestRemaining);
    assert.equal(issueQuantities.remainingQuantity, requestRemaining);
  });
});

describe("remainingInTransitQuantity", () => {
  it("is dispatched minus confirmed usable receipts", () => {
    assert.equal(remainingInTransitQuantity("5", "0"), "5");
    assert.equal(remainingInTransitQuantity("5", "3"), "2");
    assert.equal(remainingInTransitQuantity("5", "5"), "0");
  });

  it("does not count unverified receipts as received", () => {
    assert.equal(remainingInTransitQuantity("5", "0"), "5");
  });

  it("subtracts finalized missing discrepancy from remaining in transit", () => {
    assert.equal(remainingInTransitQuantity("5", "4", "1"), "0");
  });

  it("keeps remaining in transit when one unit is still expected", () => {
    assert.equal(remainingInTransitQuantity("5", "4", "0"), "1");
  });

  it("does not reduce remaining for a pending or unverified discrepancy", () => {
    assert.equal(remainingInTransitQuantity("5", "0", "0"), "5");
    assert.equal(remainingInTransitQuantity("5", "4"), "1");
  });

  it("balances dispatched across confirmed usable, remaining, and finalized discrepancy", () => {
    const remaining = remainingInTransitQuantity("5", "4", "1");
    assert.equal(
      shipmentLineQuantityBalance({
        dispatchedQuantity: "5",
        confirmedUsableReceivedQuantity: "4",
        remainingInTransitQuantity: remaining,
        finalizedDiscrepancyQuantity: "1",
      }),
      "5",
    );
    const stillExpected = remainingInTransitQuantity("5", "4", "0");
    assert.equal(
      shipmentLineQuantityBalance({
        dispatchedQuantity: "5",
        confirmedUsableReceivedQuantity: "4",
        remainingInTransitQuantity: stillExpected,
        finalizedDiscrepancyQuantity: "0",
      }),
      "5",
    );
  });
});
