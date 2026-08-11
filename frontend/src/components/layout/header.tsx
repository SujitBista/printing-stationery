"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/lib/auth/auth-context";

type HeaderProps = {
  onMenuClick: () => void;
  sidebarOpen: boolean;
};

export function Header({ onMenuClick, sidebarOpen }: HeaderProps) {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    if (loggingOut) {
      return;
    }
    setLoggingOut(true);
    await logout();
    router.replace("/login");
    router.refresh();
  }

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
        <div className="min-w-0 flex-1">
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
        <div className="flex items-center gap-3">
          <div className="hidden text-right text-xs sm:block">
            <p className="font-medium text-ink">
              {user.employee?.employeeName ?? user.username}
            </p>
            <p className="text-ink-muted">{user.roles.join(", ")}</p>
          </div>
          <button
            type="button"
            onClick={() => void handleLogout()}
            disabled={loggingOut}
            className="rounded-md border border-border px-3 py-1.5 text-sm text-ink hover:bg-paper disabled:opacity-60"
          >
            {loggingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </div>
    </header>
  );
}
