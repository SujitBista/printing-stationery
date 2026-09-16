import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ItemRequestActionType } from "@printing-stationery/shared";
import {
  getItemRequestListEmptyState,
  getItemRequestListRowActions,
  getItemRequestQueue,
  getItemRequestTabQueues,
  getItemRequestWorkflowTabQueues,
} from "./queues.js";

const ALL_WORKFLOW_ACTIONS: ItemRequestActionType[] = [
  "SUBMIT",
  "RESUBMIT",
  "RECOMMEND",
  "FORWARD",
  "APPROVE",
  "RETURN",
  "REJECT",
  "CANCEL",
];

const REQUEST_ID = "11111111-1111-4111-8111-111111111111";
const ISSUE_ID = "22222222-2222-4222-8222-222222222222";

function requestForActions(
  overrides: Partial<{
    canCreateIssue: boolean;
    status: "APPROVED" | "PARTIALLY_ISSUED" | "ISSUED";
    activeIssue: {
      id: string;
      issueNumber: string;
      status: "DRAFT" | "PENDING_VERIFICATION" | "RETURNED";
    } | null;
    allowedActions: ItemRequestActionType[];
  }> = {},
) {
  return {
    id: REQUEST_ID,
    status: overrides.status ?? "APPROVED",
    canCreateIssue: overrides.canCreateIssue ?? false,
    activeIssue: overrides.activeIssue ?? null,
    allowedActions: overrides.allowedActions ?? ALL_WORKFLOW_ACTIONS,
  };
}

describe("item request list row actions", () => {
  it("keeps Request List as overview-only View", () => {
    const actions = getItemRequestListRowActions(
      "request-list",
      requestForActions({ canCreateIssue: true }),
    );

    assert.deepEqual(actions.workflowActions, []);
    assert.equal(actions.issueAction, null);
  });

  it("shows Recommend and Return only when the backend allows them", () => {
    const assigned = getItemRequestListRowActions(
      "recommend",
      requestForActions({
        canCreateIssue: false,
        allowedActions: ["RECOMMEND", "RETURN"],
      }),
    );
    const unauthorized = getItemRequestListRowActions(
      "recommend",
      requestForActions({ canCreateIssue: false, allowedActions: [] }),
    );

    assert.deepEqual(assigned.workflowActions, ["RECOMMEND", "RETURN"]);
    assert.deepEqual(unauthorized.workflowActions, []);
  });

  it("keeps Review actions on the Review tab", () => {
    const actions = getItemRequestListRowActions(
      "review",
      requestForActions({ canCreateIssue: false }),
    );

    assert.deepEqual(actions.workflowActions, ["FORWARD", "RETURN"]);
  });

  it("keeps Approve, Reject, and Return on the Approve tab", () => {
    const actions = getItemRequestListRowActions(
      "approve",
      requestForActions({ canCreateIssue: false }),
    );

    assert.deepEqual(actions.workflowActions, ["APPROVE", "REJECT", "RETURN"]);
  });

  it("does not surface workflow decisions on approved or rejected lists", () => {
    for (const queue of ["approved", "issued", "rejected"] as const) {
      const actions = getItemRequestListRowActions(
        queue,
        requestForActions({ canCreateIssue: queue !== "rejected" }),
      );

      assert.deepEqual(actions.workflowActions, []);
      assert.equal(actions.issueAction, null);
    }
  });

  it("shows Create Issue only on Ready to Issue when no issue exists", () => {
    const ready = getItemRequestListRowActions(
      "ready-to-issue",
      requestForActions({ canCreateIssue: true }),
    );
    assert.equal(ready.issueAction, "CREATE");
    assert.equal(ready.issueActionLabel, "Create Issue");
    assert.equal(ready.issueHref, `/requests/item-requests/${REQUEST_ID}/issue`);
    assert.deepEqual(ready.workflowActions, []);
  });

  it("replaces Create Issue with Continue Draft when a draft exists", () => {
    const ready = getItemRequestListRowActions(
      "ready-to-issue",
      requestForActions({
        canCreateIssue: false,
        activeIssue: {
          id: ISSUE_ID,
          issueNumber: "II-1",
          status: "DRAFT",
        },
      }),
    );
    assert.equal(ready.issueAction, "CONTINUE_DRAFT");
    assert.equal(ready.issueActionLabel, "Continue Draft");
    assert.equal(ready.issueHref, `/requests/item-issues/${ISSUE_ID}`);
  });

  it("links a submitted issue instead of creating another one", () => {
    const ready = getItemRequestListRowActions(
      "ready-to-issue",
      requestForActions({
        canCreateIssue: false,
        activeIssue: {
          id: ISSUE_ID,
          issueNumber: "II-1",
          status: "PENDING_VERIFICATION",
        },
      }),
    );
    assert.equal(ready.issueAction, "VIEW_SUBMITTED");
    assert.equal(ready.issueActionLabel, "View Submitted Issue");
    assert.equal(ready.issueHref, `/requests/item-issues/${ISSUE_ID}`);
  });

  it("offers Correct and Resubmit for a returned issue", () => {
    const ready = getItemRequestListRowActions(
      "ready-to-issue",
      requestForActions({
        canCreateIssue: false,
        activeIssue: {
          id: ISSUE_ID,
          issueNumber: "II-1",
          status: "RETURNED",
        },
      }),
    );
    assert.equal(ready.issueAction, "CORRECT_AND_RESUBMIT");
    assert.equal(ready.issueActionLabel, "Correct and Resubmit");
  });

  it("shows Create Issue for Remaining Quantity on Partial Pending", () => {
    const partial = getItemRequestListRowActions(
      "partial-pending",
      requestForActions({
        canCreateIssue: true,
        status: "PARTIALLY_ISSUED",
      }),
    );
    assert.equal(partial.issueAction, "CREATE_REMAINING");
    assert.equal(
      partial.issueActionLabel,
      "Create Issue for Remaining Quantity",
    );
    assert.equal(
      partial.issueHref,
      `/requests/item-requests/${REQUEST_ID}/issue`,
    );
  });
});

describe("item request role queues", () => {
  it("hides Recommend and Review tabs from a Corporate Checker", () => {
    const tabs = getItemRequestWorkflowTabQueues(["CORPORATE_CHECKER"]);
    const keys = tabs.map((queue) => queue.key);
    const labels = tabs.map((queue) => queue.tabLabel);

    assert.deepEqual(keys, [
      "approve",
      "approved",
      "returned",
      "rejected",
      "request-list",
    ]);
    assert.deepEqual(labels, [
      "Pending Approval",
      "Approved",
      "Returned",
      "Rejected",
      "All Requests",
    ]);
    assert.equal(keys.includes("recommend"), false);
    assert.equal(keys.includes("review"), false);
    assert.equal(keys.includes("issued"), false);
    assert.equal(keys.includes("partial-pending"), false);
  });

  it("renames the Corporate Checker approval page heading", () => {
    const queue = getItemRequestQueue("approve", ["CORPORATE_CHECKER"]);
    assert.equal(queue.title, "Item Request Approval");
    assert.equal(
      queue.description,
      "Review requests forwarded by the Corporate Maker.",
    );
  });

  it("keeps Issued and Partial Pending out of approval tabs", () => {
    const approvalTabs = getItemRequestTabQueues({
      activeQueue: "approve",
      workflowRoles: ["CORPORATE_CHECKER"],
      canViewFulfilment: true,
    });
    const fulfilmentTabs = getItemRequestTabQueues({
      activeQueue: "issued",
      workflowRoles: ["CORPORATE_CHECKER"],
      canViewFulfilment: true,
    });

    assert.equal(
      approvalTabs.some((queue) => queue.key === "issued"),
      false,
    );
    assert.deepEqual(
      fulfilmentTabs.map((queue) => queue.key),
      ["issued", "partial-pending"],
    );
  });

  it("keeps Recommend for Branch Checker and Review for Corporate Maker", () => {
    const branchChecker = getItemRequestWorkflowTabQueues(["BRANCH_CHECKER"]).map(
      (queue) => queue.key,
    );
    const corporateMaker = getItemRequestWorkflowTabQueues([
      "CORPORATE_MAKER",
    ]).map((queue) => queue.key);
    const branchMaker = getItemRequestWorkflowTabQueues(["BRANCH_MAKER"]).map(
      (queue) => queue.key,
    );

    assert.ok(branchChecker.includes("recommend"));
    assert.equal(branchChecker.includes("review"), false);
    assert.equal(branchChecker.includes("approve"), false);

    assert.ok(corporateMaker.includes("review"));
    assert.ok(corporateMaker.includes("ready-to-issue"));
    assert.equal(corporateMaker.includes("recommend"), false);
    assert.equal(corporateMaker.includes("approve"), false);

    assert.deepEqual(branchMaker, [
      "drafts",
      "submitted",
      "returned",
      "rejected",
      "request-list",
    ]);
  });

  it("renames the Corporate Maker review page heading", () => {
    const queue = getItemRequestQueue("review", ["CORPORATE_MAKER"]);
    assert.equal(queue.title, "Branch Requests for Review");
    assert.equal(queue.showCreate, false);
  });

  it("hides New Request on Corporate Maker request lists", () => {
    const requestList = getItemRequestQueue("request-list", ["CORPORATE_MAKER"]);
    assert.equal(requestList.showCreate, false);
  });

  it("shows a waiting empty state on the Corporate Maker review queue", () => {
    const empty = getItemRequestListEmptyState({
      queue: "review",
      workflowRoles: ["CORPORATE_MAKER"],
      hasFilters: false,
      canCreate: false,
    });
    assert.equal(empty.title, "No branch requests yet");
    assert.equal(
      empty.message,
      "Once a Branch Maker submits a request and the Branch Checker recommends it, the request will appear here for your review.",
    );

    const filtered = getItemRequestListEmptyState({
      queue: "review",
      workflowRoles: ["CORPORATE_MAKER"],
      hasFilters: true,
      canCreate: false,
    });
    assert.equal(filtered.title, "No item requests found");
    assert.equal(filtered.message, "Try adjusting search or filters.");
  });
});
