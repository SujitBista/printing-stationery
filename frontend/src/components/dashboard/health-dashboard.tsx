import type { HealthFetchResult } from "@/lib/api/health";

type HealthDashboardProps = {
  health: HealthFetchResult;
};

export function HealthDashboard({ health }: HealthDashboardProps) {
  if (!health.ok) {
    return (
      <section className="max-w-2xl">
        <h1
          className="text-3xl font-semibold tracking-tight text-ink"
          style={{ fontFamily: "var(--font-display)" }}
        >
          System health
        </h1>
        <p className="mt-2 text-ink-muted">
          Backend status could not be loaded.
        </p>
        <p className="mt-6 border-l-2 border-danger pl-4 text-sm text-danger">
          {health.error}
        </p>
      </section>
    );
  }

  const { status, database, timestamp } = health.data;
  const isOk = status === "ok";

  return (
    <section className="max-w-2xl">
      <h1
        className="text-3xl font-semibold tracking-tight text-ink"
        style={{ fontFamily: "var(--font-display)" }}
      >
        System health
      </h1>
      <p className="mt-2 text-ink-muted">
        Live status from the API health endpoint.
      </p>

      <dl className="mt-8 grid gap-6 sm:grid-cols-3">
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
            API status
          </dt>
          <dd
            className={`mt-1 text-2xl font-semibold capitalize ${
              isOk ? "text-success" : "text-warning"
            }`}
          >
            {status}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
            Database
          </dt>
          <dd
            className={`mt-1 text-2xl font-semibold capitalize ${
              database === "up" ? "text-success" : "text-danger"
            }`}
          >
            {database}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
            Checked at
          </dt>
          <dd className="mt-1 text-sm text-ink sm:text-base">
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
