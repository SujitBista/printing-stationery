import type { ItemRequestStatus, ItemRequestWorkflowRole } from "./types/item-request.js";
import type {
  ItemIssueDeliveryStatus,
  ItemIssueDestinationType,
  ItemIssueQueue,
  ItemIssueStatus,
} from "./types/item-issue.js";

export const ITEM_ISSUE_POSTED_STATUS = "POSTED" satisfies ItemIssueStatus;

export const ITEM_ISSUE_OPEN_STATUSES = [
  "DRAFT",
  "PENDING_VERIFICATION",
  "RETURNED",
] as const satisfies readonly ItemIssueStatus[];

/** Open issues that should leave Ready to Issue / Partial Pending. */
export const ITEM_ISSUE_QUEUE_BLOCKING_STATUSES = [
  "PENDING_VERIFICATION",
  "RETURNED",
] as const satisfies readonly ItemIssueStatus[];

export const ITEM_ISSUE_EDITABLE_STATUSES = [
  "DRAFT",
  "RETURNED",
] as const satisfies readonly ItemIssueStatus[];

export const ITEM_ISSUE_ACTIVE_CONFLICT_CODE = "ITEM_ISSUE_ACTIVE_EXISTS";

export const ITEM_REQUEST_ISSUE_ACTION_KINDS = [
  "CREATE",
  "CONTINUE_DRAFT",
  "VIEW_SUBMITTED",
  "CORRECT_AND_RESUBMIT",
  "CREATE_REMAINING",
] as const;

export type ItemRequestIssueActionKind =
  (typeof ITEM_REQUEST_ISSUE_ACTION_KINDS)[number];

export const ITEM_REQUEST_ISSUE_ACTION_LABELS = {
  CREATE: "Create Issue",
  CONTINUE_DRAFT: "Continue Draft",
  VIEW_SUBMITTED: "View Submitted Issue",
  CORRECT_AND_RESUBMIT: "Correct and Resubmit",
  CREATE_REMAINING: "Create Issue for Remaining Quantity",
} as const satisfies Record<ItemRequestIssueActionKind, string>;

export const ITEM_REQUEST_ISSUE_ELIGIBLE_STATUSES = [
  "APPROVED",
  "PARTIALLY_ISSUED",
] as const satisfies readonly ItemRequestStatus[];

export const ITEM_ISSUE_ROLE_QUEUES = {
  ADMIN: ["pending-verification", "returned", "posted"],
  BRANCH_MAKER: ["posted"],
  BRANCH_CHECKER: ["posted"],
  CORPORATE_MAKER: ["returned", "posted"],
  CORPORATE_CHECKER: ["pending-verification", "posted"],
} as const satisfies Record<ItemRequestWorkflowRole, readonly ItemIssueQueue[]>;

export const ITEM_ISSUE_INCOMING_ROLES = [
  "ADMIN",
  "BRANCH_MAKER",
  "BRANCH_CHECKER",
] as const satisfies readonly ItemRequestWorkflowRole[];

export const ITEM_ISSUE_DEPARTMENT_CONSUMPTION_ROLES = [
  "ADMIN",
  "CORPORATE_MAKER",
  "CORPORATE_CHECKER",
] as const satisfies readonly ItemRequestWorkflowRole[];

export function actorCanAccessIncomingItems(
  workflowRoles: readonly ItemRequestWorkflowRole[],
): boolean {
  return workflowRoles.some((role) =>
    (ITEM_ISSUE_INCOMING_ROLES as readonly string[]).includes(role),
  );
}

export function actorCanAccessDepartmentConsumption(
  workflowRoles: readonly ItemRequestWorkflowRole[],
): boolean {
  return workflowRoles.some((role) =>
    (ITEM_ISSUE_DEPARTMENT_CONSUMPTION_ROLES as readonly string[]).includes(
      role,
    ),
  );
}

const ISSUE_QUEUE_ORDER: readonly ItemIssueQueue[] = [
  "pending-verification",
  "returned",
  "posted",
];

export function getItemIssueNavQueues(
  workflowRoles: readonly ItemRequestWorkflowRole[],
): ItemIssueQueue[] {
  if (workflowRoles.length === 0) {
    return [];
  }

  const wanted = new Set<ItemIssueQueue>();
  for (const role of workflowRoles) {
    for (const queue of ITEM_ISSUE_ROLE_QUEUES[role]) {
      wanted.add(queue);
    }
  }

  return ISSUE_QUEUE_ORDER.filter((queue) => wanted.has(queue));
}

export function itemIssueStatusIsPosted(status: ItemIssueStatus): boolean {
  return status === ITEM_ISSUE_POSTED_STATUS;
}

export function itemIssueStatusIsOpen(status: ItemIssueStatus): boolean {
  return (ITEM_ISSUE_OPEN_STATUSES as readonly string[]).includes(status);
}

export function itemIssueStatusIsEditable(status: ItemIssueStatus): boolean {
  return (ITEM_ISSUE_EDITABLE_STATUSES as readonly string[]).includes(status);
}

export function requestStatusAllowsItemIssue(
  status: ItemRequestStatus,
): boolean {
  return (ITEM_REQUEST_ISSUE_ELIGIBLE_STATUSES as readonly string[]).includes(
    status,
  );
}

export function itemIssueStatusBlocksRequestIssueQueue(
  status: ItemIssueStatus,
): boolean {
  return (ITEM_ISSUE_QUEUE_BLOCKING_STATUSES as readonly string[]).includes(
    status,
  );
}

export type ItemRequestActiveIssueSummary = {
  id: string;
  issueNumber: string;
  status: ItemIssueStatus;
};

/**
 * Shared source of truth for request-list and request-detail issue actions.
 * Active DRAFT / PENDING_VERIFICATION / RETURNED issues take precedence over
 * creating a new issue.
 */
export function resolveItemRequestIssueAction(params: {
  canCreateNewIssue: boolean;
  requestStatus: ItemRequestStatus;
  activeIssue: Pick<ItemRequestActiveIssueSummary, "status"> | null;
}): ItemRequestIssueActionKind | null {
  if (params.activeIssue?.status === "DRAFT") {
    return "CONTINUE_DRAFT";
  }
  if (params.activeIssue?.status === "PENDING_VERIFICATION") {
    return "VIEW_SUBMITTED";
  }
  if (params.activeIssue?.status === "RETURNED") {
    return "CORRECT_AND_RESUBMIT";
  }
  if (!params.canCreateNewIssue) {
    return null;
  }
  if (params.requestStatus === "PARTIALLY_ISSUED") {
    return "CREATE_REMAINING";
  }
  return "CREATE";
}

export function itemRequestIssueActionHref(params: {
  requestId: string;
  action: ItemRequestIssueActionKind;
  activeIssueId?: string | null;
}): string {
  if (
    params.action === "CONTINUE_DRAFT" ||
    params.action === "VIEW_SUBMITTED" ||
    params.action === "CORRECT_AND_RESUBMIT"
  ) {
    if (params.activeIssueId) {
      return `/requests/item-issues/${params.activeIssueId}`;
    }
  }
  return `/requests/item-requests/${params.requestId}/issue`;
}

export const ITEM_ISSUE_STATUS_BUSINESS_LABELS: Record<ItemIssueStatus, string> =
  {
    DRAFT: "Draft",
    PENDING_VERIFICATION: "Submitted",
    RETURNED: "Returned",
    REJECTED: "Rejected",
    POSTED: "Posted",
  };

export function itemIssueBusinessStatusLabel(params: {
  status: ItemIssueStatus;
  destinationType?: ItemIssueDestinationType | null;
  deliveryStatus?: ItemIssueDeliveryStatus | null;
}): string {
  if (params.status !== ITEM_ISSUE_POSTED_STATUS) {
    return ITEM_ISSUE_STATUS_BUSINESS_LABELS[params.status];
  }
  if (params.destinationType === "CORPORATE_DEPARTMENT") {
    return "Issued";
  }
  if (params.deliveryStatus === "IN_TRANSIT") {
    return "In Transit";
  }
  if (params.deliveryStatus === "PARTIALLY_RECEIVED") {
    return "Partially Received";
  }
  if (params.deliveryStatus === "RECEIVED") {
    return "Received";
  }
  if (params.deliveryStatus === "RECEIVED_WITH_DISCREPANCY") {
    return "Received with Discrepancy";
  }
  return "Dispatched";
}

export function itemIssueCheckerActionLabel(params: {
  destinationType?: ItemIssueDestinationType | null;
}): string {
  return params.destinationType === "CORPORATE_DEPARTMENT"
    ? "Issue to Department"
    : "Dispatch";
}
