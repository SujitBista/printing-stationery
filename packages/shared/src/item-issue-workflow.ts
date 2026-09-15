import type { ItemRequestStatus, ItemRequestWorkflowRole } from "./types/item-request.js";
import type { ItemIssueQueue, ItemIssueStatus } from "./types/item-issue.js";

export const ITEM_ISSUE_POSTED_STATUS = "POSTED" satisfies ItemIssueStatus;

export const ITEM_ISSUE_OPEN_STATUSES = [
  "DRAFT",
  "PENDING_VERIFICATION",
  "RETURNED",
] as const satisfies readonly ItemIssueStatus[];

export const ITEM_ISSUE_EDITABLE_STATUSES = [
  "DRAFT",
  "RETURNED",
] as const satisfies readonly ItemIssueStatus[];

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
