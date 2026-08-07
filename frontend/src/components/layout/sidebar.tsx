"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = {
  label: string;
  href: string;
  soon?: boolean;
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
      { label: "Purchases", href: "#", soon: true },
      { label: "Stock", href: "#", soon: true },
      { label: "Requests", href: "#", soon: true },
      { label: "Approvals", href: "#", soon: true },
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
    ],
  },
];

type SidebarProps = {
  open: boolean;
  onClose: () => void;
};

export function Sidebar({ open, onClose }: SidebarProps) {
  const pathname = usePathname();

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
          {NAV_SECTIONS.map((section) => (
            <div key={section.title}>
              <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-ink-muted">
                {section.title}
              </p>
              <div className="flex flex-col gap-1">
                {section.items.map((item) => {
                  const isActive =
                    !item.soon &&
                    (item.href === "/"
                      ? pathname === "/"
                      : pathname === item.href ||
                        pathname.startsWith(`${item.href}/`));

                  if (item.soon || item.href === "#") {
                    return (
                      <span
                        key={item.label}
                        className="cursor-default rounded-md px-3 py-2 text-sm text-ink-muted opacity-70"
                      >
                        {item.label}
                        <span className="ml-2 text-[0.65rem] uppercase tracking-wide text-ink-muted">
                          Soon
                        </span>
                      </span>
                    );
                  }

                  return (
                    <Link
                      key={item.label}
                      href={item.href}
                      onClick={onClose}
                      aria-current={isActive ? "page" : undefined}
                      className={`rounded-md px-3 py-2 text-sm transition-colors ${
                        isActive
                          ? "bg-accent-soft font-medium text-accent"
                          : "text-ink-muted hover:bg-paper hover:text-ink"
                      }`}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </aside>
    </>
  );
}
