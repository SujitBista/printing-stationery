"use client";

import { useState, type PropsWithChildren } from "react";
import { Header } from "./header";
import { Sidebar } from "./sidebar";

export function AppShell({ children }: PropsWithChildren) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <Header
        onMenuClick={() => setSidebarOpen((open) => !open)}
        sidebarOpen={sidebarOpen}
      />
      <div className="flex flex-1">
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <main className="min-h-[calc(100vh-var(--header-height))] flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
