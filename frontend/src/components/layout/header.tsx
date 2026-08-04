type HeaderProps = {
  onMenuClick: () => void;
  sidebarOpen: boolean;
};

export function Header({ onMenuClick, sidebarOpen }: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-paper-elevated/90 backdrop-blur">
      <div className="mx-auto flex h-[var(--header-height)] w-full max-w-7xl items-center gap-3 px-4 sm:px-6 lg:px-8">
        <button
          type="button"
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-ink lg:hidden"
          onClick={onMenuClick}
          aria-expanded={sidebarOpen}
          aria-controls="app-sidebar"
          aria-label={sidebarOpen ? "Close navigation" : "Open navigation"}
        >
          <span aria-hidden="true" className="text-lg leading-none">
            {sidebarOpen ? "×" : "☰"}
          </span>
        </button>
        <div className="min-w-0">
          <p
            className="truncate text-lg font-semibold tracking-tight text-ink"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Printing Stationery
          </p>
          <p className="hidden text-xs text-ink-muted sm:block">
            Inventory operations
          </p>
        </div>
      </div>
    </header>
  );
}
