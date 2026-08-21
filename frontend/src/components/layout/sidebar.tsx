"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
      <span
        className={`cursor-default rounded-md py-2 text-sm text-ink-muted opacity-70 ${
          nested ? "px-3" : "px-3"
        }`}
      >
        {item.label}
        <span className="ml-2 text-[0.65rem] uppercase tracking-wide text-ink-muted">
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
      className={`rounded-md py-2 text-sm transition-colors ${
        nested ? "px-3" : "px-3"
      } ${
        isActive
          ? "bg-accent-soft font-medium text-accent"
          : "text-ink-muted hover:bg-paper hover:text-ink"
      }`}
    >
      {item.label}
    </Link>
  );
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { canReadMasterData, isAdmin, canAccessItemRequests, canAccessOpeningStock } =
    useAuth();

  return (
    <>
      <div
        className={`fixed inset-0 z-20 bg-ink/30 transition-opacity lg:hidden ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        id="app-sidebar"
        className={`fixed inset-y-0 left-0 z-30 w-[var(--shell-width)] border-r border-border bg-paper-elevated pt-[var(--header-height)] transition-transform lg:static lg:z-0 lg:translate-x-0 lg:pt-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <nav className="flex h-full flex-col gap-6 p-4" aria-label="Primary">
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
                <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-ink-muted">
                  {section.title}
                </p>
                <div className="flex flex-col gap-1">
                  {filteredItems.map((item) => {
                    if (item.children && item.children.length > 0) {
                      return (
                        <div key={item.label} className="flex flex-col gap-0.5">
                          <p className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-ink-muted">
                            {item.label}
                          </p>
                          <div className="ml-2 flex flex-col gap-0.5 border-l border-border pl-2">
                            {item.children.map((child) => (
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
      </aside>
    </>
  );
}
