"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { BrandLogo } from "./brand-logo";

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
    <header className="sticky top-0 z-40 border-b-4 border-secondary bg-accent text-white shadow-md">
      <div className="flex h-[var(--header-height)] items-center gap-3 px-4 lg:gap-4 lg:px-6">
        <button
          type="button"
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/30 bg-white/10 text-white lg:hidden"
          onClick={onMenuClick}
          aria-expanded={sidebarOpen}
          aria-controls="app-sidebar"
          aria-label={sidebarOpen ? "Close navigation" : "Open navigation"}
        >
          <span aria-hidden="true" className="text-lg leading-none">
            {sidebarOpen ? "×" : "☰"}
          </span>
        </button>

        <Link href="/" className="flex min-w-0 flex-1 items-center gap-3">
          <span className="flex h-10 shrink-0 items-center rounded-md bg-white px-2 py-1 shadow-sm">
            <BrandLogo height={28} priority />
          </span>
          <span className="min-w-0">
            <p className="truncate text-base font-bold tracking-tight sm:text-lg">
              <span className="text-secondary">Printing</span> Stationery
            </p>
            <p className="hidden text-[11px] font-medium text-accent-mid sm:block">
              Inventory operations
            </p>
          </span>
        </Link>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <div className="hidden text-right sm:block">
            <p className="text-xs font-medium text-white">
              {user.employee?.employeeName ?? user.username}
            </p>
            <p className="text-[11px] capitalize text-accent-mid">
              {user.roles.join(", ")}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleLogout()}
            disabled={loggingOut}
            className="rounded-lg border border-white/30 bg-white/10 px-3 py-1.5 text-sm font-semibold text-white hover:bg-white/20 disabled:opacity-60"
          >
            {loggingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </div>
    </header>
  );
}
