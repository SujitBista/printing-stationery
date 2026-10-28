"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import {
  getItemRequestSidebarQueues,
  ITEM_REQUEST_SIDEBAR_QUEUES,
} from "@/lib/item-requests/queues";
import { getItemIssueSidebarQueues } from "@/lib/item-issues/queues";
import { useItemRequestNavContext } from "@/lib/item-requests/use-item-request-nav-context";
import { useRegisteredRequestNavItem } from "@/lib/navigation/request-nav-context";
import {
  isRequestsSectionPath,
  requestNavItemForIssueQueue,
  requestNavItemForRequestQueue,
  resolveRequestNavItem,
  type RequestNavItemId,
} from "@/lib/navigation/request-nav";
import {
  actorCanAccessDepartmentConsumption,
  actorCanAccessIncomingItems,
} from "@printing-stationery/shared";

type NavItem = {
  label: string;
  href: string;
  navItemId?: RequestNavItemId;
  soon?: boolean;
  /** When true, only the organization head sees this link. */
  adminSetup?: boolean;
  children?: NavItem[];
  group?: "workflow" | "fulfilment";
  badge?: number;
};

type NavSection = {
  title: string;
  items: NavItem[];
};

const NAV_SECTIONS: NavSection[] = [
  {
    title: "Modules",
    items: [
      { label: "Dashboard", href: "/" },
      { label: "Items", href: "#", soon: true },
      { label: "Purchases", href: "/purchases" },
      { label: "Stock Balance", href: "/inventory/stock-balance" },
      { label: "Opening Stock", href: "/stock/opening-stock", adminSetup: true },
      {
        label: "Requests",
        href: "/requests/item-requests",
        children: ITEM_REQUEST_SIDEBAR_QUEUES.map((queue) => ({
          label: queue.sidebarLabel,
          href: queue.href,
        })),
      },
    ],
  },
  {
    title: "Organization",
    items: [
      { label: "Branch Setup", href: "/organization/branches", adminSetup: true },
      { label: "Department Setup", href: "/organization/departments", adminSetup: true },
      { label: "Unit Setup", href: "/organization/units", adminSetup: true },
      { label: "Item Group Setup", href: "/organization/item-groups", adminSetup: true },
      { label: "Item Setup", href: "/organization/items", adminSetup: true },
      { label: "Store Setup", href: "/organization/stores", adminSetup: true },
      { label: "Employee Setup", href: "/organization/employees", adminSetup: true },
      {
        label: "Application User Setup",
        href: "/organization/application-users",
        adminSetup: true,
      },
      {
        label: "Store User Setup",
        href: "/organization/store-users",
        adminSetup: true,
      },
      {
        label: "Party Setup",
        href: "/organization/parties",
        adminSetup: true,
      },
    ],
  },
];

type SidebarProps = {
  open: boolean;
  onClose: () => void;
};

function isPathActive(pathname: string, href: string): boolean {
  if (href === "/") {
    return pathname === "/";
  }
  const path = href.split("?")[0] ?? href;
  return pathname === path || pathname.startsWith(`${path}/`);
}

function NavLink({
  item,
  pathname,
  activeNavItemId,
  onClose,
  nested = false,
}: {
  item: NavItem;
  pathname: string;
  activeNavItemId: RequestNavItemId | null;
  onClose: () => void;
  nested?: boolean;
}) {
  if (item.soon || item.href === "#") {
    return (
      <span className="cursor-default rounded-lg px-3 py-2.5 text-sm text-ink-subtle opacity-80">
        {item.label}
        <span className="ml-2 text-[0.65rem] font-semibold uppercase tracking-wide text-ink-subtle">
          Soon
        </span>
      </span>
    );
  }

  const isActive = nested
    ? item.navItemId != null && item.navItemId === activeNavItemId
    : isPathActive(pathname, item.href);

  return (
    <Link
      href={item.href}
      prefetch={!nested}
      onClick={onClose}
      aria-current={isActive ? "page" : undefined}
      className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
        isActive
          ? "bg-accent-soft text-accent"
          : "text-ink-muted hover:bg-paper hover:text-accent"
      }`}
    >
      <span>{item.label}</span>
      {item.badge && item.badge > 0 ? (
        <span className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-accent px-1.5 py-0.5 text-[0.65rem] font-semibold text-white">
          {item.badge > 99 ? "99+" : item.badge}
        </span>
      ) : null}
    </Link>
  );
}

function CollapsibleNavGroup({
  item,
  pathname,
  activeNavItemId,
  onClose,
}: {
  item: NavItem;
  pathname: string;
  activeNavItemId: RequestNavItemId | null;
  onClose: () => void;
}) {
  const children = item.children ?? [];
  const sectionActive = isRequestsSectionPath(pathname);
  const [expanded, setExpanded] = useState(sectionActive);

  useEffect(() => {
    if (sectionActive) {
      setExpanded(true);
    }
  }, [sectionActive]);

  const panelId = `nav-group-${item.label.toLowerCase().replace(/\s+/g, "-")}`;

  return (
    <div className="flex flex-col gap-0.5">
      <button
        type="button"
        onClick={() => setExpanded((open) => !open)}
        aria-expanded={expanded}
        aria-controls={panelId}
        className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors ${
          sectionActive
            ? "bg-accent-soft text-accent"
            : "text-ink-muted hover:bg-paper hover:text-accent"
        }`}
      >
        <span>{item.label}</span>
        <span
          aria-hidden="true"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-current/35 bg-paper-elevated p-1.5"
        >
          <svg
            viewBox="0 0 20 12"
            fill="currentColor"
            className={`h-full w-full transition-transform duration-200 ${
              expanded ? "rotate-180" : ""
            }`}
          >
            <path d="M0 0h20L10 12 0 0Z" />
          </svg>
        </span>
      </button>

      <div
        id={panelId}
        hidden={!expanded}
        className="ml-2 flex flex-col gap-0.5 border-l border-border pl-2"
      >
        {children.map((child, index) => {
          const previous = children[index - 1];
          const showFulfilmentHeading =
            child.group === "fulfilment" && previous?.group !== "fulfilment";
          return (
            <div key={child.navItemId ?? child.href}>
              {showFulfilmentHeading ? (
                <p className="mt-2 px-3 pt-2 text-[0.65rem] font-semibold uppercase tracking-wider text-ink-subtle">
                  Fulfilment / Issue Tracking
                </p>
              ) : null}
              <NavLink
                item={child}
                pathname={pathname}
                activeNavItemId={activeNavItemId}
                onClose={onClose}
                nested
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function Sidebar({ open, onClose }: SidebarProps) {
  return (
    <Suspense
      fallback={
        <SidebarFrame open={open} onClose={onClose} activeNavItemParam={null} />
      }
    >
      <SidebarWithSearch open={open} onClose={onClose} />
    </Suspense>
  );
}

function SidebarWithSearch({ open, onClose }: SidebarProps) {
  const searchParams = useSearchParams();
  return (
    <SidebarFrame
      open={open}
      onClose={onClose}
      activeNavItemParam={searchParams.get("activeNavItem")}
    />
  );
}

function SidebarFrame({
  open,
  onClose,
  activeNavItemParam,
}: SidebarProps & { activeNavItemParam: string | null }) {
  const pathname = usePathname();
  const registeredNavItem = useRegisteredRequestNavItem();
  const activeNavItemId = resolveRequestNavItem({
    pathname,
    activeNavItem: activeNavItemParam,
    registeredNavItem,
  });
  const {
    canAccessOrganizationSetup,
    isOrganizationHead,
    canAccessItemRequests,
    canAccessOpeningStock,
    canAccessPurchases,
    canAccessStockBalance,
  } = useAuth();
  const {
    workflowRoles,
    canViewFulfilment,
    readyToIssueCount,
    pendingIssueVerificationCount,
    returnedIssueCount,
  } = useItemRequestNavContext();
  const requestChildren: NavItem[] = [
    ...getItemRequestSidebarQueues({
      workflowRoles,
      canViewFulfilment,
    }).map((queue) => ({
      label: queue.sidebarLabel,
      href: queue.href,
      navItemId: requestNavItemForRequestQueue(queue.key),
      group: queue.navGroup,
      badge: queue.key === "ready-to-issue" ? readyToIssueCount : undefined,
    })),
    ...getItemIssueSidebarQueues(workflowRoles).map((queue) => ({
      label: queue.sidebarLabel,
      href: queue.href,
      navItemId: requestNavItemForIssueQueue(queue.key),
      group: queue.navGroup as "fulfilment",
      badge:
        queue.key === "pending-verification"
          ? pendingIssueVerificationCount
          : queue.key === "returned"
            ? returnedIssueCount
            : undefined,
    })),
    ...(actorCanAccessIncomingItems(workflowRoles)
      ? [
          {
            label: "Incoming Items",
            href: "/requests/incoming-items",
            navItemId: "INCOMING_ITEMS" as const,
            group: "fulfilment" as const,
          },
        ]
      : []),
    ...(actorCanAccessDepartmentConsumption(workflowRoles)
      ? [
          {
            label: "Department Consumption",
            href: "/requests/department-consumption",
            navItemId: "DEPARTMENT_CONSUMPTION" as const,
            group: "fulfilment" as const,
          },
        ]
      : []),
  ];

  return (
    <>
      <div
        className={`fixed inset-0 z-20 bg-ink/40 transition-opacity lg:hidden ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        id="app-sidebar"
        className={`fixed inset-y-0 left-0 z-30 flex w-[var(--shell-width)] flex-col border-r border-border-strong bg-paper-elevated pt-[var(--header-height)] shadow-lg shadow-accent/5 transition-transform lg:static lg:z-0 lg:translate-x-0 lg:pt-0 lg:shadow-none ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <nav className="flex flex-1 flex-col gap-6 overflow-y-auto p-4" aria-label="Primary">
          {NAV_SECTIONS.map((section) => {
            const items = (
              section.title === "Organization" && !canAccessOrganizationSetup
                ? []
                : section.items
            )
              .filter((item) => !item.adminSetup || isOrganizationHead)
              .filter(
                (item) =>
                  item.href !== "/requests/item-requests" ||
                  canAccessItemRequests,
              );
            const filteredItems = items
              .filter(
                (item) =>
                  item.href !== "/stock/opening-stock" || canAccessOpeningStock,
              )
              .filter(
                (item) => item.href !== "/purchases" || canAccessPurchases,
              )
              .filter(
                (item) =>
                  item.href !== "/inventory/stock-balance" ||
                  canAccessStockBalance,
              );

            if (filteredItems.length === 0) {
              return null;
            }

            return (
              <div key={section.title}>
                <p className="mb-3 px-3 text-xs font-semibold uppercase tracking-[0.16em] text-secondary">
                  {section.title}
                </p>
                <div className="flex flex-col gap-1">
                  {filteredItems.map((item) => {
                    const navItem =
                      item.href === "/requests/item-requests"
                        ? { ...item, children: requestChildren }
                        : item;
                    if (navItem.children && navItem.children.length > 0) {
                      return (
                        <CollapsibleNavGroup
                          key={navItem.label}
                          item={navItem}
                          pathname={pathname}
                          activeNavItemId={activeNavItemId}
                          onClose={onClose}
                        />
                      );
                    }

                    return (
                      <NavLink
                        key={item.label}
                        item={item}
                        pathname={pathname}
                        activeNavItemId={activeNavItemId}
                        onClose={onClose}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        <div className="hidden border-t border-border-strong px-4 py-4 text-xs text-ink-subtle lg:block">
          <p className="font-medium text-ink-muted">Printing Stationery</p>
          <p className="mt-1">Inventory &amp; request operations</p>
        </div>
      </aside>
    </>
  );
}
