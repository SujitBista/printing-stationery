import type { HealthFetchResult } from "@/lib/api/health";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";

type HealthDashboardProps = {
  health: HealthFetchResult;
};

export function HealthDashboard({ health }: HealthDashboardProps) {
  if (!health.ok) {
    return (
      <section className="w-full max-w-4xl">
        <PageHeader
          eyebrow="Dashboard"
          title="System health"
          description="Backend status could not be loaded."
        />
        <div className="ps-card mt-6 border-l-4 border-l-danger p-5">
          <p className="text-sm text-danger">{health.error}</p>
        </div>
      </section>
    );
  }

  const { status, database, timestamp } = health.data;
  const isOk = status === "ok";

  return (
    <section className="w-full max-w-4xl">
      <PageHeader
        eyebrow="Dashboard"
        title="System health"
        description="Live status from the API health endpoint."
      />

      <dl className="mt-8 grid gap-4 sm:grid-cols-3">
        <div className="ps-card p-5">
          <dt className="text-xs font-semibold uppercase tracking-[0.16em] text-secondary">
            API status
          </dt>
          <dd className="mt-3 flex items-center gap-2">
            <Badge variant={isOk ? "success" : "warning"}>
              {status}
            </Badge>
          </dd>
        </div>
        <div className="ps-card p-5">
          <dt className="text-xs font-semibold uppercase tracking-[0.16em] text-secondary">
            Database
          </dt>
          <dd className="mt-3 flex items-center gap-2">
            <Badge variant={database === "up" ? "success" : "danger"}>
              {database}
            </Badge>
          </dd>
        </div>
        <div className="ps-card p-5">
          <dt className="text-xs font-semibold uppercase tracking-[0.16em] text-secondary">
            Checked at
          </dt>
          <dd className="mt-3 text-sm font-medium text-ink sm:text-base">
            <time dateTime={timestamp}>{formatTimestamp(timestamp)}</time>
          </dd>
        </div>
      </dl>
    </section>
  );
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}
