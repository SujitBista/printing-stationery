import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canAccessOpeningStock } from "@/lib/auth/permissions";
import {
  getItemRequestIssueActionLabel,
  isItemIssueAccessDenied,
  resolveVisibleItemRequestIssueAction,
  shouldShowCreateItemIssueButton,
} from "./permissions.js";

describe("item issue frontend visibility", () => {
  it("shows Create Issue when the backend allows the maker to create", () => {
    assert.equal(
      shouldShowCreateItemIssueButton({
        requestCanCreateIssue: true,
        eligibilityOk: true,
        eligibilityCanCreate: true,
      }),
      true,
    );
  });

  it("hides Create Issue from users the backend does not authorize", () => {
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

  it("uses the same issue-action wording as the request queues", () => {
    assert.equal(
      resolveVisibleItemRequestIssueAction({
        canCreateNewIssue: true,
        requestStatus: "APPROVED",
        activeIssue: null,
      }),
      "CREATE",
    );
    assert.equal(getItemRequestIssueActionLabel("CREATE"), "Create Issue");
    assert.equal(
      resolveVisibleItemRequestIssueAction({
        canCreateNewIssue: false,
        requestStatus: "APPROVED",
        activeIssue: {
          id: "22222222-2222-4222-8222-222222222222",
          issueNumber: "II-1",
          status: "DRAFT",
        },
      }),
      "CONTINUE_DRAFT",
    );
    assert.equal(
      getItemRequestIssueActionLabel("CONTINUE_DRAFT"),
      "Continue Draft",
    );
    assert.equal(
      resolveVisibleItemRequestIssueAction({
        canCreateNewIssue: false,
        requestStatus: "APPROVED",
        activeIssue: {
          id: "22222222-2222-4222-8222-222222222222",
          issueNumber: "II-1",
          status: "PENDING_VERIFICATION",
        },
      }),
      "VIEW_SUBMITTED",
    );
    assert.equal(
      getItemRequestIssueActionLabel("VIEW_SUBMITTED"),
      "View Submitted Issue",
    );
    assert.equal(
      resolveVisibleItemRequestIssueAction({
        canCreateNewIssue: false,
        requestStatus: "APPROVED",
        activeIssue: {
          id: "22222222-2222-4222-8222-222222222222",
          issueNumber: "II-1",
          status: "RETURNED",
        },
      }),
      "CORRECT_AND_RESUBMIT",
    );
    assert.equal(
      getItemRequestIssueActionLabel("CORRECT_AND_RESUBMIT"),
      "Correct and Resubmit",
    );
    assert.equal(
      resolveVisibleItemRequestIssueAction({
        canCreateNewIssue: true,
        requestStatus: "PARTIALLY_ISSUED",
        activeIssue: null,
      }),
      "CREATE_REMAINING",
    );
    assert.equal(
      getItemRequestIssueActionLabel("CREATE_REMAINING"),
      "Create Issue for Remaining Quantity",
    );
  });

  it("limits opening stock access to admins", () => {
    assert.equal(canAccessOpeningStock({ roles: ["ADMIN"] } as never), true);
    assert.equal(canAccessOpeningStock({ roles: ["CHECKER"] } as never), false);
    assert.equal(canAccessOpeningStock(null), false);
  });
});
