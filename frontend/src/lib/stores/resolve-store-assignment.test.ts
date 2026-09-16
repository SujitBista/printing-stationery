import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  NO_ACTIVE_STORE_FOR_EMPLOYEE_BRANCH_MESSAGE,
  resolveStoreAssignment,
  STORE_MUST_MATCH_EMPLOYEE_BRANCH_MESSAGE,
  STORE_SELECTION_REQUIRED_MESSAGE,
} from "@printing-stationery/shared";

const STORE_A = "11111111-1111-4111-8111-111111111111";
const STORE_B = "22222222-2222-4222-8222-222222222222";
const STORE_C = "33333333-3333-4333-8333-333333333333";

describe("resolve store assignment for application users", () => {
  it("shows the no-store validation when a branch has no active store", () => {
    const resolution = resolveStoreAssignment({ activeStores: [] });
    assert.equal(resolution.status, "NONE");
    if (resolution.status === "NONE") {
      assert.equal(resolution.message, NO_ACTIVE_STORE_FOR_EMPLOYEE_BRANCH_MESSAGE);
    }
  });

  it("uses the only active store without a selection", () => {
    const resolution = resolveStoreAssignment({
      activeStores: [{ id: STORE_A }],
    });
    assert.equal(resolution.status, "SINGLE");
    if (resolution.status === "SINGLE") {
      assert.equal(resolution.storeId, STORE_A);
    }
  });

  it("requires a store selection when multiple active stores exist", () => {
    const resolution = resolveStoreAssignment({
      activeStores: [{ id: STORE_A }, { id: STORE_B }],
    });
    assert.equal(resolution.status, "SELECTION_REQUIRED");
    if (resolution.status === "SELECTION_REQUIRED") {
      assert.equal(resolution.message, STORE_SELECTION_REQUIRED_MESSAGE);
    }
  });

  it("rejects a store from another branch", () => {
    const resolution = resolveStoreAssignment({
      activeStores: [{ id: STORE_A }],
      selectedStoreId: STORE_C,
    });
    assert.equal(resolution.status, "INVALID");
    if (resolution.status === "INVALID") {
      assert.equal(resolution.message, STORE_MUST_MATCH_EMPLOYEE_BRANCH_MESSAGE);
    }
  });
});
