import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ItemRequestActionType } from "@printing-stationery/shared";
import {
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

describe("item request list row actions", () => {
  it("keeps Request List as overview-only View", () => {
    const actions = getItemRequestListRowActions("request-list", {
      canCreateIssue: true,
      allowedActions: ALL_WORKFLOW_ACTIONS,
    });

    assert.deepEqual(actions.workflowActions, []);
    assert.equal(actions.showCreateIssue, false);
  });

  it("shows Recommend and Return only when the backend allows them", () => {
    const assigned = getItemRequestListRowActions("recommend", {
      canCreateIssue: false,
      allowedActions: ["RECOMMEND", "RETURN"],
    });
    const unauthorized = getItemRequestListRowActions("recommend", {
      canCreateIssue: false,
      allowedActions: [],
    });

    assert.deepEqual(assigned.workflowActions, ["RECOMMEND", "RETURN"]);
    assert.deepEqual(unauthorized.workflowActions, []);
  });

  it("keeps Review actions on the Review tab", () => {
    const actions = getItemRequestListRowActions("review", {
      canCreateIssue: false,
      allowedActions: ALL_WORKFLOW_ACTIONS,
    });

    assert.deepEqual(actions.workflowActions, ["FORWARD", "RETURN"]);
  });

  it("keeps Approve, Reject, and Return on the Approve tab", () => {
    const actions = getItemRequestListRowActions("approve", {
      canCreateIssue: false,
      allowedActions: ALL_WORKFLOW_ACTIONS,
    });

    assert.deepEqual(actions.workflowActions, ["APPROVE", "REJECT", "RETURN"]);
  });

  it("does not surface workflow decisions on approved or rejected lists", () => {
    for (const queue of ["approved", "issued", "partial-pending", "rejected"] as const) {
      const actions = getItemRequestListRowActions(queue, {
        canCreateIssue: queue !== "rejected",
        allowedActions: ALL_WORKFLOW_ACTIONS,
      });

      assert.deepEqual(actions.workflowActions, []);
      assert.equal(actions.showCreateIssue, false);
    }
  });

  it("shows Create Issue only on Ready to Issue", () => {
    const ready = getItemRequestListRowActions("ready-to-issue", {
      canCreateIssue: true,
      allowedActions: ALL_WORKFLOW_ACTIONS,
    });
    assert.equal(ready.showCreateIssue, true);
    assert.deepEqual(ready.workflowActions, []);
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
});
