"use client";

import { useEffect, useState } from "react";
import { fetchHealth, type HealthFetchResult } from "@/lib/api/health";
import { HealthDashboard } from "./health-dashboard";

export function HealthDashboardPage() {
  const [health, setHealth] = useState<HealthFetchResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchHealth().then((result) => {
      if (!cancelled) {
        setHealth(result);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!health) {
    return (
      <section className="w-full max-w-4xl">
        <p className="text-sm text-ink-muted">Loading…</p>
      </section>
    );
  }

  return <HealthDashboard health={health} />;
}
