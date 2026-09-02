import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ItemRequestActionType } from "@printing-stationery/shared";
import { getItemRequestListRowActions } from "./queues.js";

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
      assert.equal(actions.showCreateIssue, queue !== "rejected");
    }
  });
});
