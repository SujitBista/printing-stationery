import type { ItemIssueQueue, ItemRequestWorkflowRole } from "@printing-stationery/shared";
import { getItemIssueNavQueues } from "@printing-stationery/shared";

export type ItemIssueQueueDefinition = {
  key: ItemIssueQueue;
  sidebarLabel: string;
  tabLabel: string;
  title: string;
  description: string;
  href: string;
  navGroup: "fulfilment";
};

const ITEM_ISSUE_QUEUE_DEFINITIONS: ItemIssueQueueDefinition[] = [
  {
    key: "pending-verification",
    sidebarLabel: "Issue Verification",
    tabLabel: "Pending Issues",
    title: "Issue Verification",
    description:
      "Item Issues submitted by the Corporate Maker and waiting for verification.",
    href: "/requests/item-issues/pending",
    navGroup: "fulfilment",
  },
  {
    key: "returned",
    sidebarLabel: "Returned Issues",
    tabLabel: "Returned Issues",
    title: "Returned Item Issues",
    description: "Item Issues returned by the Corporate Checker for correction.",
    href: "/requests/item-issues/returned",
    navGroup: "fulfilment",
  },
  {
    key: "posted",
    sidebarLabel: "Ready for Handover",
    tabLabel: "Posted Issues",
    title: "Posted Item Issues",
    description:
      "Verified Item Issues ready for printing and physical handover to the branch.",
    href: "/requests/item-issues/posted",
    navGroup: "fulfilment",
  },
];

const QUEUE_BY_KEY = new Map(
  ITEM_ISSUE_QUEUE_DEFINITIONS.map((queue) => [queue.key, queue]),
);

export function getItemIssueQueue(key: ItemIssueQueue): ItemIssueQueueDefinition {
  const found = QUEUE_BY_KEY.get(key);
  if (!found) {
    throw new Error(`Unknown item issue queue: ${key}`);
  }
  return found;
}

export function getItemIssueSidebarQueues(
  workflowRoles: readonly ItemRequestWorkflowRole[],
): ItemIssueQueueDefinition[] {
  return getItemIssueNavQueues(workflowRoles).map((key) => getItemIssueQueue(key));
}
