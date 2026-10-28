import type {
  ItemIssueDestinationType,
  ItemIssueQueue,
  ItemIssueStatus,
  ItemRequestQueue,
} from "@printing-stationery/shared";
import {
  ITEM_REQUEST_MAKER_SUBMITTED_HREF,
  ITEM_REQUEST_RECOMMENDED_HREF,
} from "@/lib/item-requests/queues";

/**
 * One child navigation item per request route.
 * Pages pass this id when a shared URL needs workflow context.
 */
export const REQUEST_NAV_ITEM = {
  ALL_REQUESTS: "ALL_REQUESTS",
  DRAFTS: "DRAFTS",
  SUBMITTED: "SUBMITTED",
  RECOMMEND: "RECOMMEND",
  RECOMMENDED: "RECOMMENDED",
  REVIEW: "REVIEW",
  FORWARDED: "FORWARDED",
  READY_TO_ISSUE: "READY_TO_ISSUE",
  REJECTED: "REJECTED",
  APPROVE: "APPROVE",
  APPROVED: "APPROVED",
  RETURNED_REQUESTS: "RETURNED_REQUESTS",
  ISSUED_LIST: "ISSUED_LIST",
  PARTIAL_PENDING: "PARTIAL_PENDING",
  ISSUE_VERIFICATION: "ISSUE_VERIFICATION",
  RETURNED_ISSUES: "RETURNED_ISSUES",
  DISPATCHED_ISSUES: "DISPATCHED_ISSUES",
  INCOMING_ITEMS: "INCOMING_ITEMS",
  DEPARTMENT_CONSUMPTION: "DEPARTMENT_CONSUMPTION",
} as const;

export type RequestNavItemId =
  (typeof REQUEST_NAV_ITEM)[keyof typeof REQUEST_NAV_ITEM];

export const ACTIVE_NAV_ITEM_PARAM = "activeNavItem";

const REQUEST_NAV_HREF: Record<RequestNavItemId, string> = {
  ALL_REQUESTS: "/requests/item-requests",
  DRAFTS: "/requests/item-requests/drafts",
  SUBMITTED: ITEM_REQUEST_MAKER_SUBMITTED_HREF,
  RECOMMEND: "/requests/item-requests/recommend",
  RECOMMENDED: ITEM_REQUEST_RECOMMENDED_HREF,
  REVIEW: "/requests/item-requests/review",
  FORWARDED: "/requests/item-requests/forwarded",
  READY_TO_ISSUE: "/requests/item-requests/ready-to-issue",
  REJECTED: "/requests/item-requests/rejected",
  APPROVE: "/requests/item-requests/approve",
  APPROVED: "/requests/item-requests/approved",
  RETURNED_REQUESTS: "/requests/item-requests/returned",
  ISSUED_LIST: "/requests/item-requests/issued",
  PARTIAL_PENDING: "/requests/item-requests/partial-pending",
  ISSUE_VERIFICATION: "/requests/item-issues/pending",
  RETURNED_ISSUES: "/requests/item-issues/returned",
  DISPATCHED_ISSUES: "/requests/item-issues/posted",
  INCOMING_ITEMS: "/requests/incoming-items",
  DEPARTMENT_CONSUMPTION: "/requests/department-consumption",
};

const REQUEST_NAV_LABEL: Record<RequestNavItemId, string> = {
  ALL_REQUESTS: "All Requests",
  DRAFTS: "Drafts",
  SUBMITTED: "Submitted",
  RECOMMEND: "Recommend",
  RECOMMENDED: "Recommended",
  REVIEW: "Review Request",
  FORWARDED: "Forwarded",
  READY_TO_ISSUE: "Ready to Issue",
  REJECTED: "Rejected",
  APPROVE: "Approve Request",
  APPROVED: "Approved List",
  RETURNED_REQUESTS: "Returned",
  ISSUED_LIST: "Issued List",
  PARTIAL_PENDING: "Partial Pending Request",
  ISSUE_VERIFICATION: "Issue Verification",
  RETURNED_ISSUES: "Returned Issues",
  DISPATCHED_ISSUES: "Dispatched Issues",
  INCOMING_ITEMS: "Incoming Items",
  DEPARTMENT_CONSUMPTION: "Department Consumption",
};

const REQUEST_QUEUE_NAV: Record<ItemRequestQueue, RequestNavItemId> = {
  "request-list": REQUEST_NAV_ITEM.ALL_REQUESTS,
  drafts: REQUEST_NAV_ITEM.DRAFTS,
  submitted: REQUEST_NAV_ITEM.SUBMITTED,
  recommend: REQUEST_NAV_ITEM.RECOMMEND,
  recommended: REQUEST_NAV_ITEM.RECOMMENDED,
  review: REQUEST_NAV_ITEM.REVIEW,
  forwarded: REQUEST_NAV_ITEM.FORWARDED,
  "ready-to-issue": REQUEST_NAV_ITEM.READY_TO_ISSUE,
  rejected: REQUEST_NAV_ITEM.REJECTED,
  approve: REQUEST_NAV_ITEM.APPROVE,
  approved: REQUEST_NAV_ITEM.APPROVED,
  returned: REQUEST_NAV_ITEM.RETURNED_REQUESTS,
  issued: REQUEST_NAV_ITEM.ISSUED_LIST,
  "partial-pending": REQUEST_NAV_ITEM.PARTIAL_PENDING,
};

const ISSUE_QUEUE_NAV: Record<ItemIssueQueue, RequestNavItemId> = {
  "pending-verification": REQUEST_NAV_ITEM.ISSUE_VERIFICATION,
  returned: REQUEST_NAV_ITEM.RETURNED_ISSUES,
  posted: REQUEST_NAV_ITEM.DISPATCHED_ISSUES,
};

/** Exact list routes. Dynamic detail routes are matched separately. */
const STATIC_PATH_NAV: Record<string, RequestNavItemId> = {
  "/requests/item-requests": REQUEST_NAV_ITEM.ALL_REQUESTS,
  "/requests/item-requests/new": REQUEST_NAV_ITEM.ALL_REQUESTS,
  "/requests/item-requests/drafts": REQUEST_NAV_ITEM.DRAFTS,
  "/requests/item-requests/submitted": REQUEST_NAV_ITEM.SUBMITTED,
  "/requests/item-requests/recommend": REQUEST_NAV_ITEM.RECOMMEND,
  "/requests/item-requests/recommended": REQUEST_NAV_ITEM.RECOMMENDED,
  "/requests/item-requests/review": REQUEST_NAV_ITEM.REVIEW,
  "/requests/item-requests/forwarded": REQUEST_NAV_ITEM.FORWARDED,
  "/requests/item-requests/ready-to-issue": REQUEST_NAV_ITEM.READY_TO_ISSUE,
  "/requests/item-requests/rejected": REQUEST_NAV_ITEM.REJECTED,
  "/requests/item-requests/approve": REQUEST_NAV_ITEM.APPROVE,
  "/requests/item-requests/approved": REQUEST_NAV_ITEM.APPROVED,
  "/requests/item-requests/returned": REQUEST_NAV_ITEM.RETURNED_REQUESTS,
  "/requests/item-requests/issued": REQUEST_NAV_ITEM.ISSUED_LIST,
  "/requests/item-requests/partial-pending": REQUEST_NAV_ITEM.PARTIAL_PENDING,
  "/requests/item-issues/pending": REQUEST_NAV_ITEM.ISSUE_VERIFICATION,
  "/requests/item-issues/returned": REQUEST_NAV_ITEM.RETURNED_ISSUES,
  "/requests/item-issues/posted": REQUEST_NAV_ITEM.DISPATCHED_ISSUES,
};

const CREATE_ISSUE_PATH =
  /^\/requests\/item-requests\/[^/]+\/issue$/;
const REQUEST_DETAIL_PATH = /^\/requests\/item-requests\/[^/]+$/;
const REQUEST_EDIT_PATH = /^\/requests\/item-requests\/[^/]+\/edit$/;
const ISSUE_DETAIL_PATH = /^\/requests\/item-issues\/[^/]+$/;

const NAV_ITEM_IDS = new Set<string>(Object.values(REQUEST_NAV_ITEM));

export type RequestNavResolutionInput = {
  pathname: string;
  activeNavItem?: string | null;
  /**
   * Set after a shared detail page loads the record that owns the route.
   * `undefined` means the page has not claimed the route yet, so a URL
   * `activeNavItem` value can be used until then.
   */
  registeredNavItem?: RequestNavItemId | null;
};

export function normalizeRequestPathname(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

export function parseRequestNavItemId(
  value: string | null | undefined,
): RequestNavItemId | null {
  if (!value || !NAV_ITEM_IDS.has(value)) {
    return null;
  }
  return value as RequestNavItemId;
}

export function requestNavHref(navItemId: RequestNavItemId): string {
  return REQUEST_NAV_HREF[navItemId];
}

export function requestNavLabel(navItemId: RequestNavItemId): string {
  return REQUEST_NAV_LABEL[navItemId];
}

export function requestNavBackLink(navItemId: RequestNavItemId): {
  href: string;
  label: string;
} {
  return {
    href: requestNavHref(navItemId),
    label: `Back to ${requestNavLabel(navItemId)}`,
  };
}

export function requestNavItemForRequestQueue(
  queue: ItemRequestQueue,
): RequestNavItemId {
  return REQUEST_QUEUE_NAV[queue];
}

export function requestNavItemForIssueQueue(
  queue: ItemIssueQueue,
): RequestNavItemId {
  return ISSUE_QUEUE_NAV[queue];
}

/**
 * Issue detail pages share one URL. Ownership follows the loaded issue,
 * which stays correct after refresh without using the browser referrer.
 */
export function requestNavItemForIssueDetail(issue: {
  status: ItemIssueStatus;
  destinationType: ItemIssueDestinationType;
}): RequestNavItemId | null {
  if (issue.destinationType === "CORPORATE_DEPARTMENT") {
    return REQUEST_NAV_ITEM.DEPARTMENT_CONSUMPTION;
  }

  switch (issue.status) {
    case "DRAFT":
      return REQUEST_NAV_ITEM.READY_TO_ISSUE;
    case "RETURNED":
      return REQUEST_NAV_ITEM.RETURNED_ISSUES;
    case "PENDING_VERIFICATION":
      return REQUEST_NAV_ITEM.ISSUE_VERIFICATION;
    case "POSTED":
      return REQUEST_NAV_ITEM.DISPATCHED_ISSUES;
    case "REJECTED":
      return null;
    default:
      return null;
  }
}

export function withActiveNavItem(
  href: string,
  navItemId: RequestNavItemId,
): string {
  const queryIndex = href.indexOf("?");
  const pathname = queryIndex === -1 ? href : href.slice(0, queryIndex);
  const query = queryIndex === -1 ? "" : href.slice(queryIndex + 1);
  const params = new URLSearchParams(query);
  if (navItemId === REQUEST_NAV_ITEM.ALL_REQUESTS) {
    params.delete(ACTIVE_NAV_ITEM_PARAM);
  } else {
    params.set(ACTIVE_NAV_ITEM_PARAM, navItemId);
  }
  const search = params.toString();
  return search ? `${pathname}?${search}` : pathname;
}

export function requestDetailHref(
  requestId: string,
  navItemId: RequestNavItemId,
): string {
  return withActiveNavItem(`/requests/item-requests/${requestId}`, navItemId);
}

export function issueDetailHref(
  issueId: string,
  navItemId: RequestNavItemId | null,
): string {
  const path = `/requests/item-issues/${issueId}`;
  return navItemId ? withActiveNavItem(path, navItemId) : path;
}

/** Keeps Create Issue on its route owner and tags shared issue URLs. */
export function issueWorkflowHref(
  href: string,
  issue: {
    status: ItemIssueStatus;
    destinationType?: ItemIssueDestinationType | null;
  } | null,
): string {
  const path = normalizeRequestPathname(href.split("?")[0] ?? href);
  if (CREATE_ISSUE_PATH.test(path) || !issue || !ISSUE_DETAIL_PATH.test(path)) {
    return href;
  }
  const navItemId = requestNavItemForIssueDetail({
    status: issue.status,
    destinationType: issue.destinationType ?? "BRANCH_STORE",
  });
  return navItemId ? withActiveNavItem(href, navItemId) : href;
}

export function isRequestsSectionPath(pathname: string): boolean {
  const path = normalizeRequestPathname(pathname);
  return path === "/requests" || path.startsWith("/requests/");
}

/**
 * Returns the single child navigation item that owns `pathname`.
 * Owned routes win over `activeNavItem` and page registration so a broad
 * prefix such as All Requests cannot claim a more specific child route.
 */
export function resolveRequestNavItem(
  input: RequestNavResolutionInput,
): RequestNavItemId | null {
  const pathname = normalizeRequestPathname(input.pathname);

  if (
    pathname === "/requests/department-consumption" ||
    pathname.startsWith("/requests/department-consumption/")
  ) {
    return REQUEST_NAV_ITEM.DEPARTMENT_CONSUMPTION;
  }

  if (
    pathname === "/requests/incoming-items" ||
    pathname.startsWith("/requests/incoming-items/")
  ) {
    return REQUEST_NAV_ITEM.INCOMING_ITEMS;
  }

  if (CREATE_ISSUE_PATH.test(pathname)) {
    return REQUEST_NAV_ITEM.READY_TO_ISSUE;
  }

  const staticNav = STATIC_PATH_NAV[pathname];
  if (staticNav) {
    return staticNav;
  }

  if (REQUEST_EDIT_PATH.test(pathname)) {
    return REQUEST_NAV_ITEM.ALL_REQUESTS;
  }

  if (REQUEST_DETAIL_PATH.test(pathname)) {
    return (
      parseRequestNavItemId(input.activeNavItem) ??
      REQUEST_NAV_ITEM.ALL_REQUESTS
    );
  }

  if (ISSUE_DETAIL_PATH.test(pathname)) {
    if (input.registeredNavItem !== undefined) {
      return input.registeredNavItem;
    }
    return parseRequestNavItemId(input.activeNavItem);
  }

  return null;
}
