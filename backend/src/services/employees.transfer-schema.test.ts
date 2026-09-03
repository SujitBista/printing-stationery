import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  transferEmployeeInputSchema,
  updateEmployeeInputSchema,
} from "@printing-stationery/shared";

const BRANCH_A = "11111111-1111-4111-8111-111111111111";
const BRANCH_B = "22222222-2222-4222-8222-222222222222";
const STORE_B = "33333333-3333-4333-8333-333333333333";
const SUPERVISOR_B = "44444444-4444-4444-8444-444444444444";

describe("employee transfer input schema", () => {
  it("accepts a branch-only transfer", () => {
    const parsed = transferEmployeeInputSchema.safeParse({
      toBranchId: BRANCH_B,
      effectiveDate: "2026-09-02",
      reason: "Moved to cover a vacancy at the destination branch.",
    });
    assert.equal(parsed.success, true);
    if (parsed.success) {
      assert.equal(parsed.data.toStoreId, null);
      assert.equal(parsed.data.toSupervisorApplicationUserId, null);
    }
  });

  it("requires store and supervisor together", () => {
    const parsed = transferEmployeeInputSchema.safeParse({
      toBranchId: BRANCH_B,
      effectiveDate: "2026-09-02",
      reason: "Moved to cover a vacancy at the destination branch.",
      toStoreId: STORE_B,
    });
    assert.equal(parsed.success, false);
  });

  it("rejects the same-day invalid date", () => {
    const parsed = transferEmployeeInputSchema.safeParse({
      toBranchId: BRANCH_B,
      effectiveDate: "2026-13-40",
      reason: "Moved to cover a vacancy at the destination branch.",
    });
    assert.equal(parsed.success, false);
  });

  it("accepts store and supervisor together", () => {
    const parsed = transferEmployeeInputSchema.safeParse({
      toBranchId: BRANCH_B,
      effectiveDate: "2026-09-02",
      reason: "Moved to cover a vacancy at the destination branch.",
      toStoreId: STORE_B,
      toSupervisorApplicationUserId: SUPERVISOR_B,
    });
    assert.equal(parsed.success, true);
  });

  it("rejects an empty reason", () => {
    const parsed = transferEmployeeInputSchema.safeParse({
      toBranchId: BRANCH_B,
      effectiveDate: "2026-09-02",
      reason: "   ",
    });
    assert.equal(parsed.success, false);
  });
});

describe("employee update schema", () => {
  it("does not allow branch changes on the normal edit payload", () => {
    const parsed = updateEmployeeInputSchema.safeParse({
      employeeCode: "E-1",
      employeeName: "Ada Lovelace",
      branchId: BRANCH_A,
    });
    assert.equal(parsed.success, false);
  });
});
