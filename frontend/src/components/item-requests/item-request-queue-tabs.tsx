"use client";

import Link from "next/link";
import type { ItemRequestQueue, ItemRequestWorkflowRole } from "@printing-stationery/shared";
import { itemRequestQueueIsFulfilment } from "@printing-stationery/shared";
import { getItemRequestTabQueues } from "@/lib/item-requests/queues";

type ItemRequestQueueTabsProps = {
  activeQueue: ItemRequestQueue;
  workflowRoles: readonly ItemRequestWorkflowRole[];
  canViewFulfilment: boolean;
  readyToIssueCount?: number;
};

export function ItemRequestQueueTabs({
  activeQueue,
  workflowRoles,
  canViewFulfilment,
  readyToIssueCount = 0,
}: ItemRequestQueueTabsProps) {
  const queues = getItemRequestTabQueues({
    activeQueue,
    workflowRoles,
    canViewFulfilment,
  });
  const fulfilment = itemRequestQueueIsFulfilment(activeQueue);

  if (queues.length === 0) {
    return null;
  }

  return (
    <nav
      className="-mx-1 overflow-x-auto rounded-xl border border-border bg-paper-elevated px-1 shadow-sm shadow-accent/5"
      aria-label={
        fulfilment
          ? "Fulfilment and issue tracking"
          : "Item request queues"
      }
    >
      <ul className="flex min-w-max gap-1">
        {queues.map((queue) => {
          const isActive = queue.key === activeQueue;
          return (
            <li key={queue.key}>
              <Link
                href={queue.href}
                aria-current={isActive ? "page" : undefined}
                className={`inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm transition-colors ${
                  isActive
                    ? "border-accent font-semibold text-accent"
                    : "border-transparent text-ink-muted hover:border-accent-tint hover:text-accent"
                }`}
              >
                {queue.tabLabel}
                {queue.key === "ready-to-issue" && readyToIssueCount > 0 ? (
                  <span className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-accent px-1.5 py-0.5 text-[0.65rem] font-semibold text-white">
                    {readyToIssueCount > 99 ? "99+" : readyToIssueCount}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
