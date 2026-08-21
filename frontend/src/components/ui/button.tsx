import type { ButtonHTMLAttributes, ReactNode } from "react";
import Link from "next/link";

type ButtonVariant = "primary" | "secondary" | "outline" | "ghost";

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-white hover:bg-accent-dark focus-visible:ring-accent disabled:bg-accent-mid",
  secondary:
    "bg-secondary text-white hover:bg-secondary-dark focus-visible:ring-secondary disabled:opacity-60",
  outline:
    "border border-accent-tint bg-paper-elevated text-accent hover:bg-accent-soft focus-visible:ring-accent",
  ghost:
    "border border-border-strong bg-transparent text-ink hover:bg-paper focus-visible:ring-accent",
};

const baseClasses =
  "inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60";

type SharedProps = {
  variant?: ButtonVariant;
  className?: string;
  children?: ReactNode;
};

type ButtonAsButtonProps = SharedProps &
  ButtonHTMLAttributes<HTMLButtonElement> & {
    href?: undefined;
  };

type ButtonAsLinkProps = SharedProps & {
  href: string;
};

type ButtonProps = ButtonAsButtonProps | ButtonAsLinkProps;

export function Button({
  variant = "primary",
  className = "",
  children,
  ...props
}: ButtonProps) {
  const classes = `${baseClasses} ${variantClasses[variant]} ${className}`;

  if ("href" in props && props.href) {
    return (
      <Link href={props.href} className={classes}>
        {children}
      </Link>
    );
  }

  const buttonProps = props as ButtonAsButtonProps;
  return (
    <button className={classes} {...buttonProps}>
      {children}
    </button>
  );
}
