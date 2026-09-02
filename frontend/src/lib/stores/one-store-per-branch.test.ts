import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getOccupiedBranchIds } from "./one-store-per-branch.js";

describe("one store per branch", () => {
  const stores = [
    { id: "store-1", branchId: "branch-a" },
    { id: "store-2", branchId: "branch-c" },
  ];

  it("treats branches with another store as occupied when creating", () => {
    const occupied = getOccupiedBranchIds(stores);

    assert.equal(occupied.has("branch-a"), true);
    assert.equal(occupied.has("branch-b"), false);
    assert.equal(occupied.has("branch-c"), true);
  });

  it("does not treat the current store's branch as occupied when editing", () => {
    const occupied = getOccupiedBranchIds(stores, "store-1");

    assert.equal(occupied.has("branch-a"), false);
    assert.equal(occupied.has("branch-c"), true);
  });
});
