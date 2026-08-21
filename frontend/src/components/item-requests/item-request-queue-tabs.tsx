"use client";

import Link from "next/link";
import type { ItemRequestQueue } from "@printing-stationery/shared";
import { ITEM_REQUEST_TAB_QUEUES } from "@/lib/item-requests/queues";

type ItemRequestQueueTabsProps = {
  activeQueue: ItemRequestQueue;
};

export function ItemRequestQueueTabs({
  activeQueue,
}: ItemRequestQueueTabsProps) {
  return (
    <nav
      className="-mx-1 overflow-x-auto border-b border-border"
      aria-label="Item request queues"
    >
      <ul className="flex min-w-max gap-1 px-1">
        {ITEM_REQUEST_TAB_QUEUES.map((queue) => {
          const isActive = queue.key === activeQueue;
          return (
            <li key={queue.key}>
              <Link
                href={queue.href}
                aria-current={isActive ? "page" : undefined}
                className={`inline-block whitespace-nowrap border-b-2 px-3 py-2.5 text-sm transition-colors ${
                  isActive
                    ? "border-accent font-medium text-accent"
                    : "border-transparent text-ink-muted hover:border-border hover:text-ink"
                }`}
              >
                {queue.tabLabel}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
