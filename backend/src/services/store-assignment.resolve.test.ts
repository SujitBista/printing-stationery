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

describe("resolveStoreAssignment", () => {
  it("returns a validation error when the branch has no active store", () => {
    const resolution = resolveStoreAssignment({
      activeStores: [],
      selectedStoreId: null,
    });

    assert.deepEqual(resolution, {
      status: "NONE",
      message: NO_ACTIVE_STORE_FOR_EMPLOYEE_BRANCH_MESSAGE,
    });
  });

  it("auto-selects the store when the branch has exactly one active store", () => {
    const resolution = resolveStoreAssignment({
      activeStores: [{ id: STORE_A }],
      selectedStoreId: null,
    });

    assert.deepEqual(resolution, { status: "SINGLE", storeId: STORE_A });
  });

  it("requires a selection when the branch has more than one active store", () => {
    const resolution = resolveStoreAssignment({
      activeStores: [{ id: STORE_A }, { id: STORE_B }],
      selectedStoreId: null,
    });

    assert.deepEqual(resolution, {
      status: "SELECTION_REQUIRED",
      message: STORE_SELECTION_REQUIRED_MESSAGE,
    });
  });

  it("accepts an explicit store from the same branch when multiple stores exist", () => {
    const resolution = resolveStoreAssignment({
      activeStores: [{ id: STORE_A }, { id: STORE_B }],
      selectedStoreId: STORE_B,
    });

    assert.deepEqual(resolution, { status: "MULTIPLE", storeId: STORE_B });
  });

  it("rejects a store that does not belong to the employee’s branch", () => {
    const resolution = resolveStoreAssignment({
      activeStores: [{ id: STORE_A }, { id: STORE_B }],
      selectedStoreId: STORE_C,
    });

    assert.deepEqual(resolution, {
      status: "INVALID",
      message: STORE_MUST_MATCH_EMPLOYEE_BRANCH_MESSAGE,
    });
  });
});
