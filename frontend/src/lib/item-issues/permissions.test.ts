import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canAccessOpeningStock } from "@/lib/auth/permissions";
import {
  isItemIssueAccessDenied,
  shouldShowCreateItemIssueButton,
} from "./permissions.js";

describe("item issue frontend visibility", () => {
  it("shows Create Item Issue for the supplying-store checker", () => {
    assert.equal(
      shouldShowCreateItemIssueButton({
        requestCanCreateIssue: true,
        eligibilityOk: true,
        eligibilityCanCreate: true,
      }),
      true,
    );
  });

  it("hides Create Item Issue from makers", () => {
    assert.equal(
      shouldShowCreateItemIssueButton({
        requestCanCreateIssue: false,
        eligibilityOk: false,
        eligibilityCanCreate: false,
      }),
      false,
    );
  });

  it("hides Create Item Issue when eligibility is forbidden", () => {
    assert.equal(
      shouldShowCreateItemIssueButton({
        requestCanCreateIssue: true,
        eligibilityOk: false,
        eligibilityCanCreate: false,
      }),
      false,
    );
  });

  it("treats direct navigation 401/403 as unauthorized", () => {
    assert.equal(isItemIssueAccessDenied(401), true);
    assert.equal(isItemIssueAccessDenied(403), true);
    assert.equal(isItemIssueAccessDenied(404), false);
    assert.equal(isItemIssueAccessDenied(409), false);
  });

  it("limits opening stock access to admins", () => {
    assert.equal(canAccessOpeningStock({ roles: ["ADMIN"] } as never), true);
    assert.equal(canAccessOpeningStock({ roles: ["CHECKER"] } as never), false);
    assert.equal(canAccessOpeningStock(null), false);
  });
});
