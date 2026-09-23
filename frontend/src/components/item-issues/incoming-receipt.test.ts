import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  actorCanAccessIncomingItems,
  destinationReceiptQuantityError,
  destinationReceiptRoleLabel,
  itemIssueReceiptStatusLabel,
} from "@printing-stationery/shared";
import { itemRequestNotificationHref } from "@/lib/notifications/href";

const incomingDir = dirname(fileURLToPath(import.meta.url));

describe("incoming receipt confirmation labels", () => {
  it("lets destination maker and checker open incoming items", () => {
    assert.equal(actorCanAccessIncomingItems(["BRANCH_MAKER"]), true);
    assert.equal(actorCanAccessIncomingItems(["BRANCH_CHECKER"]), true);
    assert.equal(actorCanAccessIncomingItems(["CORPORATE_MAKER"]), false);
    assert.equal(actorCanAccessIncomingItems(["CORPORATE_CHECKER"]), false);
  });

  it("maps old receipt verification statuses to pending confirmation", () => {
    assert.equal(itemIssueReceiptStatusLabel("DRAFT"), "Pending confirmation");
    assert.equal(
      itemIssueReceiptStatusLabel("PENDING_VERIFICATION"),
      "Pending confirmation",
    );
    assert.equal(itemIssueReceiptStatusLabel("RETURNED"), "Pending confirmation");
    assert.equal(itemIssueReceiptStatusLabel("CONFIRMED"), "Confirmed");
    assert.equal(
      destinationReceiptRoleLabel("BRANCH_MAKER"),
      "Destination Store Maker",
    );
    assert.equal(
      destinationReceiptRoleLabel("BRANCH_CHECKER"),
      "Destination Store Checker",
    );
  });

  it("shows a validation error before confirmation", () => {
    assert.equal(
      destinationReceiptQuantityError({
        lines: [
          {
            receivedQuantityNow: "8",
            damagedQuantity: "3",
            remainingInTransitQuantity: "10",
          },
        ],
      }),
      "Receipt quantity exceeds remaining in-transit quantity.",
    );
  });

  it("links a confirmed receipt notification to the item issue", () => {
    assert.equal(
      itemRequestNotificationHref({
        relatedEntityType: "ITEM_ISSUE",
        relatedEntityId: "55555555-5555-4555-8555-555555555555",
        type: "ITEM_ISSUE_RECEIPT_CONFIRMED",
      }),
      "/requests/item-issues/55555555-5555-4555-8555-555555555555",
    );
    assert.equal(
      itemRequestNotificationHref({
        relatedEntityType: "ITEM_ISSUE",
        relatedEntityId: "55555555-5555-4555-8555-555555555555",
        type: "ITEM_ISSUE_DISCREPANCY_REPORTED",
      }),
      "/requests/item-issues/55555555-5555-4555-8555-555555555555",
    );
  });

  it("does not expose the old receipt verification actions in incoming item screens", () => {
    const list = readFileSync(join(incomingDir, "incoming-items-page.tsx"), "utf8");
    const detail = readFileSync(
      join(incomingDir, "incoming-shipment-detail-page.tsx"),
      "utf8",
    );
    const screens = `${list}\n${detail}`;
    assert.match(screens, /Confirm Receipt/);
    assert.doesNotMatch(screens, /Awaiting Receipt Verification/);
    assert.doesNotMatch(screens, /Submit Receipt for Verification/);
    assert.doesNotMatch(screens, /Forward to Checker/);
    assert.doesNotMatch(screens, /Verify Receipt/);
    assert.doesNotMatch(screens, /Return for Correction/);
    assert.doesNotMatch(screens, /Record Receipt/);
  });
});