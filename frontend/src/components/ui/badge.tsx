import type { ReactNode } from "react";

type BadgeVariant = "success" | "warning" | "danger" | "neutral" | "info";

type BadgeProps = {
  children: ReactNode;
  variant?: BadgeVariant;
  className?: string;
};

const variantClasses: Record<BadgeVariant, string> = {
  success: "border-secondary-tint bg-secondary-soft text-secondary-dark",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
  danger: "border-red-200 bg-red-50 text-red-700",
  neutral: "border-border-strong bg-paper text-ink-muted",
  info: "border-accent-tint bg-accent-soft text-accent",
};

export function Badge({
  children,
  variant = "neutral",
  className = "",
}: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${variantClasses[variant]} ${className}`}
    >
      {children}
    </span>
  );
}

export function StatusBadge({ active }: { active: boolean }) {
  return (
    <Badge variant={active ? "success" : "neutral"}>
      {active ? "Active" : "Inactive"}
    </Badge>
  );
}
