import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { itemRequestNotificationHref } from "./href.js";

describe("itemRequestNotificationHref", () => {
  it("opens a submitted item request instead of the removed submitted list", () => {
    const requestId = "55555555-5555-4555-8555-555555555555";
    const href = itemRequestNotificationHref({
      relatedEntityType: "ITEM_REQUEST",
      relatedEntityId: requestId,
      type: "ITEM_REQUEST_SUBMITTED",
    });

    assert.equal(href, `/requests/item-requests/${requestId}`);
    assert.equal(href?.includes("/submitted"), false);
  });

  it("links item-request notifications to the request detail page", () => {
    assert.equal(
      itemRequestNotificationHref({
        relatedEntityType: "ITEM_REQUEST",
        relatedEntityId: "55555555-5555-4555-8555-555555555555",
        type: "ITEM_REQUEST_APPROVED",
      }),
      "/requests/item-requests/55555555-5555-4555-8555-555555555555",
    );
  });

  it("links item-issue notifications to the issue detail page", () => {
    assert.equal(
      itemRequestNotificationHref({
        relatedEntityType: "ITEM_ISSUE",
        relatedEntityId: "55555555-5555-4555-8555-555555555555",
        type: "ITEM_ISSUE_POSTED",
      }),
      "/requests/item-issues/55555555-5555-4555-8555-555555555555",
    );
  });

  it("links dispatched issue notifications to Incoming Items", () => {
    assert.equal(
      itemRequestNotificationHref({
        relatedEntityType: "ITEM_ISSUE",
        relatedEntityId: "55555555-5555-4555-8555-555555555555",
        type: "ITEM_ISSUE_DISPATCHED",
      }),
      "/requests/incoming-items",
    );
  });
});
