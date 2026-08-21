import type { ItemRequestQueue } from "@printing-stationery/shared";

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
};

/** Sidebar order matches legacy Request menu. */
export const ITEM_REQUEST_SIDEBAR_QUEUES: ItemRequestQueueDefinition[] = [
  {
    key: "request-list",
    sidebarLabel: "Item Request",
    tabLabel: "Request List",
    title: "Item Request",
    description:
      "Create and manage stationery requests from your branch store.",
    href: "/requests/item-requests",
    showCreate: true,
  },
  {
    key: "recommend",
    sidebarLabel: "Recommend",
    tabLabel: "Recommend",
    title: "Item Request Recommend",
    description:
      "Branch checker queue — recommend requests to corporate, or return them to the maker.",
    href: "/requests/item-requests/recommend",
  },
  {
    key: "review",
    sidebarLabel: "Review Request",
    tabLabel: "Review",
    title: "Item Request Review",
    description:
      "Corporate maker queue — forward requests for approval or return them to the branch.",
    href: "/requests/item-requests/review",
  },
  {
    key: "rejected",
    sidebarLabel: "Rejected",
    tabLabel: "Rejected",
    title: "Item Request Rejected",
    description: "Requests that were rejected during corporate approval.",
    href: "/requests/item-requests/rejected",
  },
  {
    key: "approve",
    sidebarLabel: "Approve Request",
    tabLabel: "Approve",
    title: "Item Request Approve",
    description:
      "Corporate checker queue — approve, reject, or return requests.",
    href: "/requests/item-requests/approve",
  },
  {
    key: "approved",
    sidebarLabel: "Approved List",
    tabLabel: "Approved List",
    title: "Item Request Approved List",
    description: "Approved requests ready for item issue from the corporate store.",
    href: "/requests/item-requests/approved",
  },
  {
    key: "issued",
    sidebarLabel: "Issued List",
    tabLabel: "Issued Requests",
    title: "Item Request Issued List",
    description:
      "Approved requests. Full issued-vs-pending quantity filtering will refine this list further.",
    href: "/requests/item-requests/issued",
  },
  {
    key: "partial-pending",
    sidebarLabel: "Partial Pending Request",
    tabLabel: "Partial Pending Request",
    title: "Item Request Partial Pending",
    description:
      "Approved requests that may still have remaining quantity to issue.",
    href: "/requests/item-requests/partial-pending",
  },
];

/** Tab order matches legacy Item Request tabs. */
export const ITEM_REQUEST_TAB_QUEUES: ItemRequestQueueDefinition[] = [
  ITEM_REQUEST_SIDEBAR_QUEUES[0]!,
  ITEM_REQUEST_SIDEBAR_QUEUES[1]!,
  ITEM_REQUEST_SIDEBAR_QUEUES[2]!,
  ITEM_REQUEST_SIDEBAR_QUEUES[4]!,
  ITEM_REQUEST_SIDEBAR_QUEUES[5]!,
  ITEM_REQUEST_SIDEBAR_QUEUES[7]!,
  ITEM_REQUEST_SIDEBAR_QUEUES[6]!,
  ITEM_REQUEST_SIDEBAR_QUEUES[3]!,
];

export function getItemRequestQueue(
  key: ItemRequestQueue,
): ItemRequestQueueDefinition {
  const found = ITEM_REQUEST_SIDEBAR_QUEUES.find((queue) => queue.key === key);
  if (!found) {
    throw new Error(`Unknown item request queue: ${key}`);
  }
  return found;
}
