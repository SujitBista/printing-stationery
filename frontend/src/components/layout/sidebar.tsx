"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { ITEM_REQUEST_SIDEBAR_QUEUES } from "@/lib/item-requests/queues";

type NavItem = {
  label: string;
  href: string;
  soon?: boolean;
  /** When true, only users who can mutate master data (ADMIN) see this link. */
  adminSetup?: boolean;
  children?: NavItem[];
};

type NavSection = {
  title: string;
  items: NavItem[];
};

const REQUEST_CHILDREN: NavItem[] = ITEM_REQUEST_SIDEBAR_QUEUES.map((queue) => ({
  label: queue.sidebarLabel,
  href: queue.href,
}));

const NAV_SECTIONS: NavSection[] = [
  {
    title: "Modules",
    items: [
      { label: "Dashboard", href: "/" },
      { label: "Items", href: "#", soon: true },
      { label: "Purchases", href: "#", soon: true },
      { label: "Opening Stock", href: "/stock/opening-stock", adminSetup: true },
      {
        label: "Requests",
        href: "/requests/item-requests",
        children: REQUEST_CHILDREN,
      },
    ],
  },
  {
    title: "Organization",
    items: [
      { label: "Branch Setup", href: "/organization/branches" },
      { label: "Department Setup", href: "/organization/departments" },
      { label: "Unit Setup", href: "/organization/units" },
      { label: "Item Group Setup", href: "/organization/item-groups" },
      { label: "Item Setup", href: "/organization/items" },
      { label: "Store Setup", href: "/organization/stores" },
      { label: "Employee Setup", href: "/organization/employees" },
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
  return pathname === href || pathname.startsWith(`${href}/`);
}

const REQUEST_QUEUE_HREFS = new Set(
  ITEM_REQUEST_SIDEBAR_QUEUES.filter((queue) => queue.key !== "request-list").map(
    (queue) => queue.href,
  ),
);

function isUnderRequests(pathname: string): boolean {
  return (
    pathname === "/requests/item-requests" ||
    pathname.startsWith("/requests/item-requests/") ||
    pathname.startsWith("/requests/item-issues/") ||
    [...REQUEST_QUEUE_HREFS].some(
      (href) => pathname === href || pathname.startsWith(`${href}/`),
    )
  );
}

function isRequestQueueActive(pathname: string, href: string): boolean {
  if (href === "/requests/item-requests") {
    if (pathname === "/requests/item-requests") {
      return true;
    }
    if (
      REQUEST_QUEUE_HREFS.has(pathname) ||
      [...REQUEST_QUEUE_HREFS].some((queueHref) =>
        pathname.startsWith(`${queueHref}/`),
      )
    ) {
      return false;
    }
    return pathname.startsWith("/requests/item-requests/");
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({
  item,
  pathname,
  onClose,
  nested = false,
}: {
  item: NavItem;
  pathname: string;
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
    ? isRequestQueueActive(pathname, item.href)
    : isPathActive(pathname, item.href);

  return (
    <Link
      href={item.href}
      onClick={onClose}
      aria-current={isActive ? "page" : undefined}
      className={`rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
        isActive
          ? "bg-accent-soft text-accent"
          : "text-ink-muted hover:bg-paper hover:text-accent"
      }`}
    >
      {item.label}
    </Link>
  );
}

function CollapsibleNavGroup({
  item,
  pathname,
  onClose,
}: {
  item: NavItem;
  pathname: string;
  onClose: () => void;
}) {
  const children = item.children ?? [];
  const sectionActive = isUnderRequests(pathname);
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
          className={`inline-block text-[0.65rem] leading-none transition-transform duration-200 ${
            expanded ? "rotate-90" : ""
          }`}
        >
          ▸
        </span>
      </button>

      <div
        id={panelId}
        hidden={!expanded}
        className="ml-2 flex flex-col gap-0.5 border-l border-border pl-2"
      >
        {children.map((child) => (
          <NavLink
            key={child.href}
            item={child}
            pathname={pathname}
            onClose={onClose}
            nested
          />
        ))}
      </div>
    </div>
  );
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { canReadMasterData, isAdmin, canAccessItemRequests, canAccessOpeningStock } =
    useAuth();

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
              section.title === "Organization" && !canReadMasterData
                ? []
                : section.items
            )
              .filter((item) => !item.adminSetup || isAdmin)
              .filter(
                (item) =>
                  item.href !== "/requests/item-requests" ||
                  canAccessItemRequests,
              );
            const filteredItems = items.filter(
              (item) => item.href !== "/stock/opening-stock" || canAccessOpeningStock,
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
                    if (item.children && item.children.length > 0) {
                      return (
                        <CollapsibleNavGroup
                          key={item.label}
                          item={item}
                          pathname={pathname}
                          onClose={onClose}
                        />
                      );
                    }

                    return (
                      <NavLink
                        key={item.label}
                        item={item}
                        pathname={pathname}
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
