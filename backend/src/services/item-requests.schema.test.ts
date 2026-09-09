import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createItemRequestInputSchema,
  eligibleItemRequestStoreListQuerySchema,
} from "@printing-stationery/shared";

const SOURCE = "11111111-1111-4111-8111-111111111111";
const DESTINATION = "22222222-2222-4222-8222-222222222222";
const ITEM = "33333333-3333-4333-8333-333333333333";
const EMPLOYEE = "44444444-4444-4444-8444-444444444444";
const USER = "55555555-5555-4555-8555-555555555555";

describe("create item request store pair schema", () => {
  it("requires source and destination stores", () => {
    const parsed = createItemRequestInputSchema.safeParse({
      requestedByEmployeeId: EMPLOYEE,
      remarks: null,
      lines: [{ itemId: ITEM, requestedQuantity: "1" }],
    });
    assert.equal(parsed.success, false);
  });

  it("requires requestedByEmployeeId", () => {
    const parsed = createItemRequestInputSchema.safeParse({
      sourceStoreId: SOURCE,
      destinationStoreId: DESTINATION,
      remarks: null,
      lines: [{ itemId: ITEM, requestedQuantity: "1" }],
    });
    assert.equal(parsed.success, false);
  });

  it("rejects a client-supplied Created By identity", () => {
    const parsed = createItemRequestInputSchema.safeParse({
      sourceStoreId: SOURCE,
      destinationStoreId: DESTINATION,
      requestedByEmployeeId: EMPLOYEE,
      createdByUserId: USER,
      createdByApplicationUserId: USER,
      remarks: null,
      lines: [{ itemId: ITEM, requestedQuantity: "1" }],
    });
    assert.equal(parsed.success, false);
  });

  it("rejects the same store for Request From and Request To", () => {
    const parsed = createItemRequestInputSchema.safeParse({
      sourceStoreId: SOURCE,
      destinationStoreId: SOURCE,
      requestedByEmployeeId: EMPLOYEE,
      remarks: null,
      lines: [{ itemId: ITEM, requestedQuantity: "1" }],
    });
    assert.equal(parsed.success, false);
    if (!parsed.success) {
      assert.match(
        parsed.error.issues[0]?.message ?? "",
        /must be different/i,
      );
    }
  });

  it("accepts different source and destination stores", () => {
    const parsed = createItemRequestInputSchema.safeParse({
      sourceStoreId: SOURCE,
      destinationStoreId: DESTINATION,
      requestedByEmployeeId: EMPLOYEE,
      remarks: null,
      lines: [{ itemId: ITEM, requestedQuantity: "1.5" }],
    });
    assert.equal(parsed.success, true);
  });
});

describe("eligible supplying store search query", () => {
  it("defaults to a page size larger than five", () => {
    const parsed = eligibleItemRequestStoreListQuerySchema.safeParse({});
    assert.equal(parsed.success, true);
    if (parsed.success) {
      assert.equal(parsed.data.page, 1);
      assert.ok(parsed.data.pageSize > 5);
      assert.equal(parsed.data.search, undefined);
    }
  });

  it("keeps an explicit search that can match stores beyond the first page", () => {
    const parsed = eligibleItemRequestStoreListQuerySchema.safeParse({
      page: 1,
      pageSize: 5,
      search: "Zulu Distant",
    });
    assert.equal(parsed.success, true);
    if (parsed.success) {
      assert.equal(parsed.data.pageSize, 5);
      assert.equal(parsed.data.search, "Zulu Distant");
    }
  });
});
