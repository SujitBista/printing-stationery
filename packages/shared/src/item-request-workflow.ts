import type {
  ItemRequestActionType,
  ItemRequestQueue,
  ItemRequestStatus,
  ItemRequestWorkflowRole,
} from "./types/item-request.js";

export const ITEM_REQUEST_MISSING_MAKER_OR_CHECKER_MESSAGE =
  "You are not assigned as a maker for this store, or the store has no checker. Please contact the administrator.";

export const ITEM_REQUEST_CORPORATE_MAKER_CREATE_MESSAGE =
  "Branch requests are created by Branch Makers.";

export const ITEM_REQUEST_REVIEW_EMPTY_TITLE = "No branch requests yet";

export const ITEM_REQUEST_REVIEW_EMPTY_MESSAGE =
  "Once a Branch Maker submits a request and the Branch Checker recommends it, the request will appear here for your review.";

/** Approval-stage queues shown to each workflow persona. */
export const ITEM_REQUEST_ROLE_WORKFLOW_QUEUES = {
  ADMIN: [
    "request-list",
    "recommend",
    "review",
    "approve",
    "approved",
    "returned",
    "rejected",
  ],
  BRANCH_MAKER: ["drafts", "submitted", "returned", "rejected", "request-list"],
  BRANCH_CHECKER: [
    "recommend",
    "recommended",
    "returned",
    "rejected",
    "request-list",
  ],
  CORPORATE_MAKER: [
    "review",
    "forwarded",
    "ready-to-issue",
    "returned",
    "rejected",
    "request-list",
  ],
  CORPORATE_CHECKER: [
    "approve",
    "approved",
    "returned",
    "rejected",
    "request-list",
  ],
} as const satisfies Record<ItemRequestWorkflowRole, readonly ItemRequestQueue[]>;

export const ITEM_REQUEST_FULFILMENT_QUEUES = [
  "issued",
  "partial-pending",
] as const satisfies readonly ItemRequestQueue[];

const WORKFLOW_QUEUE_ORDER: readonly ItemRequestQueue[] = [
  "approve",
  "recommend",
  "review",
  "forwarded",
  "recommended",
  "drafts",
  "submitted",
  "ready-to-issue",
  "approved",
  "returned",
  "rejected",
  "request-list",
];

export type ItemRequestNavQueues = {
  workflowQueues: ItemRequestQueue[];
  fulfilmentQueues: ItemRequestQueue[];
};

function uniqueInOrder(
  queues: readonly ItemRequestQueue[],
  order: readonly ItemRequestQueue[],
): ItemRequestQueue[] {
  const wanted = new Set(queues);
  return order.filter((queue) => wanted.has(queue));
}

/**
 * Navigation for the logged-in workflow personas. Fulfilment lists stay out of
 * approval-stage tabs and are returned separately.
 */
export function getItemRequestNavQueues(
  workflowRoles: readonly ItemRequestWorkflowRole[],
  canViewFulfilment: boolean,
): ItemRequestNavQueues {
  if (workflowRoles.length === 0) {
    return {
      workflowQueues: ["request-list"],
      fulfilmentQueues: canViewFulfilment
        ? [...ITEM_REQUEST_FULFILMENT_QUEUES]
        : [],
    };
  }

  const combined: ItemRequestQueue[] = [];
  for (const role of workflowRoles) {
    combined.push(...ITEM_REQUEST_ROLE_WORKFLOW_QUEUES[role]);
  }

  return {
    workflowQueues: uniqueInOrder(combined, WORKFLOW_QUEUE_ORDER),
    fulfilmentQueues: canViewFulfilment
      ? [...ITEM_REQUEST_FULFILMENT_QUEUES]
      : [],
  };
}

export function itemRequestQueueIsFulfilment(queue: ItemRequestQueue): boolean {
  return (ITEM_REQUEST_FULFILMENT_QUEUES as readonly string[]).includes(queue);
}

/** Branch Makers (and admins) create requests. Corporate Maker only reviews. */
export function itemRequestWorkflowCanCreate(
  workflowRoles: readonly ItemRequestWorkflowRole[],
): boolean {
  return (
    workflowRoles.includes("ADMIN") ||
    workflowRoles.includes("BRANCH_MAKER")
  );
}

export function itemRequestWorkflowIsCorporateMaker(
  workflowRoles: readonly ItemRequestWorkflowRole[],
): boolean {
  return (
    workflowRoles.includes("CORPORATE_MAKER") &&
    !workflowRoles.includes("BRANCH_MAKER") &&
    !workflowRoles.includes("ADMIN")
  );
}

/** Who the request is pending with, matching the stored assignee columns. */
export type ItemRequestPendingAssignee =
  | "createdBy"
  | "branchChecker"
  | "corporateMaker"
  | "corporateChecker";

export function itemRequestPendingAssignee(
  status: ItemRequestStatus,
): ItemRequestPendingAssignee | null {
  switch (status) {
    case "DRAFT":
    case "RETURNED_TO_BRANCH_MAKER":
      return "createdBy";
    case "PENDING_BRANCH_CHECKER":
      return "branchChecker";
    case "PENDING_CORPORATE_MAKER":
    case "RETURNED_TO_CORPORATE_MAKER":
      return "corporateMaker";
    case "PENDING_CORPORATE_CHECKER":
      return "corporateChecker";
    default:
      return null;
  }
}

/**
 * Workflow persona implied by an action and the status it left. Used to store
 * and display approval-history roles, including for rows written before the
 * dedicated column existed.
 */
export function inferItemRequestActorWorkflowRole(params: {
  action: ItemRequestActionType;
  fromStatus: ItemRequestStatus;
}): ItemRequestWorkflowRole {
  switch (params.action) {
    case "SUBMIT":
    case "RESUBMIT":
    case "CANCEL":
      return "BRANCH_MAKER";
    case "RECOMMEND":
      return "BRANCH_CHECKER";
    case "FORWARD":
      return "CORPORATE_MAKER";
    case "APPROVE":
    case "REJECT":
      return "CORPORATE_CHECKER";
    case "RETURN":
      if (params.fromStatus === "PENDING_BRANCH_CHECKER") {
        return "BRANCH_CHECKER";
      }
      if (
        params.fromStatus === "PENDING_CORPORATE_MAKER" ||
        params.fromStatus === "RETURNED_TO_CORPORATE_MAKER"
      ) {
        return "CORPORATE_MAKER";
      }
      return "CORPORATE_CHECKER";
    default:
      return "BRANCH_MAKER";
  }
}
