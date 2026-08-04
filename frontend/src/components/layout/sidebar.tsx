const NAV_ITEMS = [
  { label: "Dashboard", href: "/", active: true },
  { label: "Items", href: "#", active: false },
  { label: "Purchases", href: "#", active: false },
  { label: "Stock", href: "#", active: false },
  { label: "Requests", href: "#", active: false },
  { label: "Approvals", href: "#", active: false },
] as const;

type SidebarProps = {
  open: boolean;
  onClose: () => void;
};

export function Sidebar({ open, onClose }: SidebarProps) {
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
        <nav className="flex h-full flex-col gap-1 p-4" aria-label="Primary">
          <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-ink-muted">
            Modules
          </p>
          {NAV_ITEMS.map((item) => (
            <a
              key={item.label}
              href={item.href}
              onClick={onClose}
              aria-current={item.active ? "page" : undefined}
              className={`rounded-md px-3 py-2 text-sm transition-colors ${
                item.active
                  ? "bg-accent-soft font-medium text-accent"
                  : "text-ink-muted hover:bg-paper hover:text-ink"
              } ${item.href === "#" ? "cursor-default opacity-70" : ""}`}
            >
              {item.label}
              {item.href === "#" ? (
                <span className="ml-2 text-[0.65rem] uppercase tracking-wide text-ink-muted">
                  Soon
                </span>
              ) : null}
            </a>
          ))}
        </nav>
      </aside>
    </>
  );
}
