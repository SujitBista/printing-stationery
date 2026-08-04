"use client";

import { useState, type PropsWithChildren } from "react";
import { Header } from "./header";
import { Sidebar } from "./sidebar";

export function AppShell({ children }: PropsWithChildren) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen">
      <Header
        onMenuClick={() => setSidebarOpen((open) => !open)}
        sidebarOpen={sidebarOpen}
      />
      <div className="mx-auto flex w-full max-w-7xl">
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <main className="min-h-[calc(100vh-var(--header-height))] flex-1 px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
