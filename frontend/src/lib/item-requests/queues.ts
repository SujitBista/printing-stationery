import type {
  ItemRequestActionType,
  ItemRequestIssueActionKind,
  ItemRequestQueue,
  ItemRequestStatus,
  ItemRequestWorkflowRole,
} from "@printing-stationery/shared";
import {
  ITEM_REQUEST_ISSUE_ACTION_LABELS,
  ITEM_REQUEST_REVIEW_EMPTY_MESSAGE,
  ITEM_REQUEST_REVIEW_EMPTY_TITLE,
  getItemRequestNavQueues,
  itemRequestIssueActionHref,
  itemRequestListFilterIsSubmitted,
  itemRequestQueueIsFulfilment,
  itemRequestWorkflowIsCorporateMaker,
  resolveItemRequestIssueAction,
  type ItemRequestActiveIssueSummary,
} from "@printing-stationery/shared";

/** Old maker Submitted page. Bookmarks land on All Requests filtered to Submitted. */
export const ITEM_REQUEST_MAKER_SUBMITTED_HREF =
  "/requests/item-requests?status=SUBMITTED";

export const ITEM_REQUEST_SUBMITTED_EMPTY_TITLE = "No submitted requests found.";

export const ITEM_REQUEST_CHECKER_REVIEW_EMPTY_TITLE =
  "No requests are waiting for your review.";

export type ItemRequestQueueDefinition = {
  key: ItemRequestQueue;
  /** Sidebar label (legacy wording). */
  sidebarLabel: string;
  /** Horizontal tab label. */
  tabLabel: string;
  /** Page title. */
  title: string;
  description: string;
  href: string;
  /** Show New Request only on the maker request list. */
  showCreate?: boolean;
  /** Sidebar grouping; fulfilment queues are listed separately. */
  navGroup?: "workflow" | "fulfilment";
};

type QueueLabelOverride = Pick<
  ItemRequestQueueDefinition,
  "sidebarLabel" | "tabLabel" | "title" | "description"
>;

const ITEM_REQUEST_QUEUE_DEFINITIONS: ItemRequestQueueDefinition[] = [
  {
    key: "request-list",
    sidebarLabel: "All Requests",
    tabLabel: "All Requests",
    title: "All Requests",
    description:
      "Complete history of item requests, including current status and who they are pending with.",
    href: "/requests/item-requests",
    showCreate: true,
    navGroup: "workflow",
  },
  {
    key: "drafts",
    sidebarLabel: "Drafts",
    tabLabel: "Drafts",
    title: "Item Request Drafts",
    description: "Requests you have created but not yet submitted.",
    href: "/requests/item-requests/drafts",
    showCreate: true,
    navGroup: "workflow",
  },
  {
    key: "submitted",
    sidebarLabel: "Submitted",
    tabLabel: "Submitted",
    title: "Submitted Item Requests",
    description: "Requests waiting for the Branch Checker to recommend.",
    href: ITEM_REQUEST_MAKER_SUBMITTED_HREF,
    navGroup: "workflow",
  },
  {
    key: "recommend",
    sidebarLabel: "Recommend",
    tabLabel: "Recommend",
    title: "Item Request Recommend",
    description:
      "Branch checker queue — recommend requests to corporate, or return them to the maker.",
    href: "/requests/item-requests/recommend",
    navGroup: "workflow",
  },
  {
    key: "recommended",
    sidebarLabel: "Recommended",
    tabLabel: "Recommended",
    title: "Recommended Item Requests",
    description: "Requests you recommended that are now with corporate.",
    href: "/requests/item-requests/recommended",
    navGroup: "workflow",
  },
  {
    key: "review",
    sidebarLabel: "Review Request",
    tabLabel: "Review",
    title: "Item Request Review",
    description:
      "Corporate maker queue — forward requests for approval or return them to the branch.",
    href: "/requests/item-requests/review",
    navGroup: "workflow",
  },
  {
    key: "forwarded",
    sidebarLabel: "Forwarded",
    tabLabel: "Forwarded",
    title: "Forwarded Item Requests",
    description: "Requests forwarded to the Corporate Checker for approval.",
    href: "/requests/item-requests/forwarded",
    navGroup: "workflow",
  },
  {
    key: "ready-to-issue",
    sidebarLabel: "Ready to Issue",
    tabLabel: "Ready to Issue",
    title: "Ready to Issue",
    description:
      "Approved requests waiting for the Corporate Maker to create an Item Issue.",
    href: "/requests/item-requests/ready-to-issue",
    navGroup: "workflow",
  },
  {
    key: "rejected",
    sidebarLabel: "Rejected",
    tabLabel: "Rejected",
    title: "Item Request Rejected",
    description: "Requests that were rejected during corporate approval.",
    href: "/requests/item-requests/rejected",
    navGroup: "workflow",
  },
  {
    key: "approve",
    sidebarLabel: "Approve Request",
    tabLabel: "Approve",
    title: "Item Request Approve",
    description:
      "Corporate checker queue — approve, reject, or return requests.",
    href: "/requests/item-requests/approve",
    navGroup: "workflow",
  },
  {
    key: "approved",
    sidebarLabel: "Approved List",
    tabLabel: "Approved List",
    title: "Item Request Approved List",
    description:
      "Approved requests. Create Issue is available on Ready to Issue.",
    href: "/requests/item-requests/approved",
    navGroup: "workflow",
  },
  {
    key: "returned",
    sidebarLabel: "Returned",
    tabLabel: "Returned",
    title: "Returned Item Requests",
    description: "Requests returned one workflow level backward.",
    href: "/requests/item-requests/returned",
    navGroup: "workflow",
  },
  {
    key: "issued",
    sidebarLabel: "Issued List",
    tabLabel: "Issued Requests",
    title: "Item Request Issued List",
    description:
      "Requests whose approved quantities have been fully issued and posted.",
    href: "/requests/item-requests/issued",
    navGroup: "fulfilment",
  },
  {
    key: "partial-pending",
    sidebarLabel: "Partial Pending Request",
    tabLabel: "Partial Pending Request",
    title: "Item Request Partial Pending",
    description:
      "Approved requests with remaining quantity still to be issued.",
    href: "/requests/item-requests/partial-pending",
    navGroup: "fulfilment",
  },
];

const CORPORATE_CHECKER_LABELS: Partial<
  Record<ItemRequestQueue, QueueLabelOverride>
> = {
  approve: {
    sidebarLabel: "Pending Approval",
    tabLabel: "Pending Approval",
    title: "Item Request Approval",
    description: "Review requests forwarded by the Corporate Maker.",
  },
  approved: {
    sidebarLabel: "Approved",
    tabLabel: "Approved",
    title: "Approved Item Requests",
    description: "Requests you have finally approved, ready for fulfilment.",
  },
  returned: {
    sidebarLabel: "Returned",
    tabLabel: "Returned",
    title: "Returned Item Requests",
    description: "Requests you returned to the Corporate Maker.",
  },
  rejected: {
    sidebarLabel: "Rejected",
    tabLabel: "Rejected",
    title: "Rejected Item Requests",
    description: "Requests you rejected. These requests are closed.",
  },
  "request-list": {
    sidebarLabel: "All Requests",
    tabLabel: "All Requests",
    title: "All Requests",
    description:
      "Read-only history of item requests you are authorized to view.",
  },
};

const CORPORATE_MAKER_LABELS: Partial<
  Record<ItemRequestQueue, QueueLabelOverride>
> = {
  review: {
    sidebarLabel: "Review Request",
    tabLabel: "Review",
    title: "Branch Requests for Review",
    description:
      "Corporate maker queue — forward requests for approval or return them to the branch.",
  },
};

const BRANCH_MAKER_REQUEST_LIST_LABELS: QueueLabelOverride = {
  sidebarLabel: "All Requests",
  tabLabel: "All Requests",
  title: "All Requests",
  description:
    "Complete history of item requests for your store, including drafts, submitted requests, returns, and issued requests.",
};

const BRANCH_CHECKER_REVIEW_LABELS: QueueLabelOverride = {
  sidebarLabel: "Pending My Review",
  tabLabel: "Pending My Review",
  title: "Pending My Review",
  description:
    "Requests from your store that are waiting for you to recommend or return.",
};

const BRANCH_CHECKER_REQUEST_LIST_LABELS: QueueLabelOverride = {
  sidebarLabel: "All Requests",
  tabLabel: "All Requests",
  title: "All Requests",
  description: "Complete history of item requests for your store.",
};

const QUEUE_BY_KEY = new Map(
  ITEM_REQUEST_QUEUE_DEFINITIONS.map((queue) => [queue.key, queue]),
);

function applyRoleLabels(
  queue: ItemRequestQueueDefinition,
  workflowRoles: readonly ItemRequestWorkflowRole[],
): ItemRequestQueueDefinition {
  let next = queue;
  const corporateCheckerOnly =
    workflowRoles.length === 1 && workflowRoles[0] === "CORPORATE_CHECKER";

  if (itemRequestWorkflowIsCorporateMaker(workflowRoles)) {
    next = {
      ...next,
      ...CORPORATE_MAKER_LABELS[queue.key],
      showCreate: false,
    };
  } else if (corporateCheckerOnly) {
    next = {
      ...next,
      ...CORPORATE_CHECKER_LABELS[queue.key],
      showCreate: false,
    };
  }

  const isBranchMaker = workflowRoles.includes("BRANCH_MAKER");
  const isBranchChecker = workflowRoles.includes("BRANCH_CHECKER");

  if (isBranchChecker && queue.key === "recommend") {
    next = { ...next, ...BRANCH_CHECKER_REVIEW_LABELS };
  }

  if (isBranchMaker && queue.key === "request-list") {
    next = { ...next, ...BRANCH_MAKER_REQUEST_LIST_LABELS, showCreate: true };
  } else if (
    isBranchChecker &&
    !isBranchMaker &&
    !corporateCheckerOnly &&
    !itemRequestWorkflowIsCorporateMaker(workflowRoles) &&
    queue.key === "request-list"
  ) {
    next = {
      ...next,
      ...BRANCH_CHECKER_REQUEST_LIST_LABELS,
      showCreate: false,
    };
  }

  return next;
}

export function getItemRequestQueue(
  key: ItemRequestQueue,
  workflowRoles: readonly ItemRequestWorkflowRole[] = [],
): ItemRequestQueueDefinition {
  const found = QUEUE_BY_KEY.get(key);
  if (!found) {
    throw new Error(`Unknown item request queue: ${key}`);
  }
  return applyRoleLabels(found, workflowRoles);
}

export function getItemRequestListEmptyState(params: {
  queue: ItemRequestQueue;
  workflowRoles: readonly ItemRequestWorkflowRole[];
  hasFilters: boolean;
  canCreate: boolean;
  statusFilter?: string | null;
}): { title: string; message: string } {
  if (
    params.queue === "request-list" &&
    itemRequestListFilterIsSubmitted(params.statusFilter)
  ) {
    return {
      title: ITEM_REQUEST_SUBMITTED_EMPTY_TITLE,
      message: "Change the status filter to see your other requests.",
    };
  }

  if (
    params.queue === "recommend" &&
    params.workflowRoles.includes("BRANCH_CHECKER") &&
    !params.hasFilters
  ) {
    return {
      title: ITEM_REQUEST_CHECKER_REVIEW_EMPTY_TITLE,
      message:
        "Requests from your store appear here after a Branch Maker submits them.",
    };
  }

  if (
    params.queue === "review" &&
    itemRequestWorkflowIsCorporateMaker(params.workflowRoles) &&
    !params.hasFilters
  ) {
    return {
      title: ITEM_REQUEST_REVIEW_EMPTY_TITLE,
      message: ITEM_REQUEST_REVIEW_EMPTY_MESSAGE,
    };
  }

  return {
    title: "No item requests found",
    message: params.hasFilters
      ? "Try adjusting search or filters."
      : params.canCreate
        ? "Create a request to get started."
        : "No requests are in this queue for you right now.",
  };
}

export function getItemRequestWorkflowTabQueues(
  workflowRoles: readonly ItemRequestWorkflowRole[],
): ItemRequestQueueDefinition[] {
  const { workflowQueues } = getItemRequestNavQueues(workflowRoles, false);
  return workflowQueues.map((key) => getItemRequestQueue(key, workflowRoles));
}

export function getItemRequestFulfilmentTabQueues(
  workflowRoles: readonly ItemRequestWorkflowRole[],
): ItemRequestQueueDefinition[] {
  const { fulfilmentQueues } = getItemRequestNavQueues(workflowRoles, true);
  return fulfilmentQueues.map((key) => getItemRequestQueue(key, workflowRoles));
}

export function getItemRequestSidebarQueues(params: {
  workflowRoles: readonly ItemRequestWorkflowRole[];
  canViewFulfilment: boolean;
}): ItemRequestQueueDefinition[] {
  const nav = getItemRequestNavQueues(
    params.workflowRoles,
    params.canViewFulfilment,
  );
  return [...nav.workflowQueues, ...nav.fulfilmentQueues].map((key) =>
    getItemRequestQueue(key, params.workflowRoles),
  );
}

export function getItemRequestTabQueues(params: {
  activeQueue: ItemRequestQueue;
  workflowRoles: readonly ItemRequestWorkflowRole[];
  canViewFulfilment: boolean;
}): ItemRequestQueueDefinition[] {
  if (itemRequestQueueIsFulfilment(params.activeQueue)) {
    return params.canViewFulfilment
      ? getItemRequestFulfilmentTabQueues(params.workflowRoles)
      : [];
  }
  return getItemRequestWorkflowTabQueues(params.workflowRoles);
}

/** @deprecated Use getItemRequestSidebarQueues with the actor's workflow roles. */
export const ITEM_REQUEST_SIDEBAR_QUEUES: ItemRequestQueueDefinition[] =
  ITEM_REQUEST_QUEUE_DEFINITIONS.filter((queue) =>
    (
      [
        "request-list",
        "recommend",
        "review",
        "rejected",
        "approve",
        "approved",
        "issued",
        "partial-pending",
      ] as ItemRequestQueue[]
    ).includes(queue.key),
  );

/** @deprecated Use getItemRequestTabQueues with the actor's workflow roles. */
export const ITEM_REQUEST_TAB_QUEUES: ItemRequestQueueDefinition[] = [
  getItemRequestQueue("request-list"),
  getItemRequestQueue("recommend"),
  getItemRequestQueue("review"),
  getItemRequestQueue("approve"),
  getItemRequestQueue("approved"),
  getItemRequestQueue("partial-pending"),
  getItemRequestQueue("issued"),
  getItemRequestQueue("rejected"),
];

/**
 * Workflow decision actions that belong on each queue’s row actions.
 * All Requests is overview-only. Backend `allowedActions` remains the
 * authorization source; this only chooses which of those actions to show.
 */
export const ITEM_REQUEST_QUEUE_WORKFLOW_ACTIONS: Record<
  ItemRequestQueue,
  readonly ItemRequestActionType[]
> = {
  "request-list": [],
  drafts: ["SUBMIT", "CANCEL"],
  submitted: [],
  recommend: ["RECOMMEND", "RETURN"],
  recommended: [],
  review: ["FORWARD", "RETURN"],
  forwarded: [],
  approve: ["APPROVE", "REJECT", "RETURN"],
  approved: [],
  "ready-to-issue": [],
  returned: ["FORWARD", "RETURN", "RESUBMIT", "CANCEL"],
  "partial-pending": [],
  issued: [],
  rejected: [],
};

const QUEUES_WITH_ISSUE_ACTIONS: ReadonlySet<ItemRequestQueue> = new Set([
  "ready-to-issue",
  "partial-pending",
]);

export type ItemRequestListRowActions = {
  issueAction: ItemRequestIssueActionKind | null;
  issueHref: string | null;
  issueActionLabel: string | null;
  workflowActions: ItemRequestActionType[];
};

export function getItemRequestListRowActions(
  queue: ItemRequestQueue,
  request: {
    id: string;
    status: ItemRequestStatus;
    canCreateIssue: boolean;
    activeIssue: ItemRequestActiveIssueSummary | null;
    allowedActions: readonly ItemRequestActionType[];
  },
): ItemRequestListRowActions {
  const allowedOnQueue = ITEM_REQUEST_QUEUE_WORKFLOW_ACTIONS[queue];
  const issueAction = QUEUES_WITH_ISSUE_ACTIONS.has(queue)
    ? resolveItemRequestIssueAction({
        canCreateNewIssue: request.canCreateIssue,
        requestStatus: request.status,
        activeIssue: request.activeIssue,
      })
    : null;

  return {
    issueAction,
    issueHref: issueAction
      ? itemRequestIssueActionHref({
          requestId: request.id,
          action: issueAction,
          activeIssueId: request.activeIssue?.id,
        })
      : null,
    issueActionLabel: issueAction
      ? ITEM_REQUEST_ISSUE_ACTION_LABELS[issueAction]
      : null,
    workflowActions: allowedOnQueue.filter((action) =>
      request.allowedActions.includes(action),
    ),
  };
}
