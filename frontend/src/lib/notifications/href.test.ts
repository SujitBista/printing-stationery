import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { itemRequestNotificationHref } from "./href.js";

describe("itemRequestNotificationHref", () => {
  it("links item-request notifications to the request detail page", () => {
    assert.equal(
      itemRequestNotificationHref({
        relatedEntityType: "ITEM_REQUEST",
        relatedEntityId: "55555555-5555-4555-8555-555555555555",
      }),
      "/requests/item-requests/55555555-5555-4555-8555-555555555555",
    );
  });
});
