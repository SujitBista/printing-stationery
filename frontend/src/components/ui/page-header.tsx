import type { ReactNode } from "react";

type PageHeaderProps = {
  title: string;
  description?: string;
  eyebrow?: string;
  actions?: ReactNode;
  children?: ReactNode;
};

export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
  children,
}: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-secondary">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="text-2xl font-bold tracking-tight text-accent sm:text-3xl">
          {title}
        </h1>
        {description ? (
          <p className="mt-2 max-w-2xl text-sm text-ink-muted sm:text-base">
            {description}
          </p>
        ) : null}
        {children}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>
      ) : null}
    </div>
  );
}
