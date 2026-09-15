import type {
  ItemRequestActionType,
  ItemRequestQueue,
  ItemRequestStatus,
  ItemRequestWorkflowRole,
} from "./types/item-request.js";

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
