"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, useTransition, type FormEvent } from "react";
import { login } from "@/lib/api/auth";
import { BrandLogo } from "@/components/layout/brand-logo";
import { Button } from "@/components/ui/button";

function safeReturnTo(value: string | null): string {
  if (!value) {
    return "/";
  }
  if (
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.startsWith("/login") ||
    value.startsWith("/change-initial-password")
  ) {
    return "/";
  }
  return value;
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [, startTransition] = useTransition();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) {
      return;
    }

    setSubmitting(true);
    setError(null);

    const result = await login({ username, password });
    if (!result.ok) {
      setError(
        result.status === 401 || result.status === 400
          ? "Invalid username or password."
          : result.error,
      );
      setSubmitting(false);
      return;
    }

    const destination = result.data.user.mustChangePassword
      ? "/change-initial-password"
      : safeReturnTo(searchParams.get("returnTo"));

    startTransition(() => {
      router.replace(destination);
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="ps-card p-6 sm:p-8"
      noValidate
    >
      <div className="mb-6">
        <BrandLogo height={44} priority className="mb-4" />
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-secondary">
          Printing Stationery
        </p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-accent">
          Sign in
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          Use your application username and password.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-ink">Username</span>
          <input
            name="username"
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            required
            className="ps-input"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-ink">Password</span>
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            className="ps-input"
          />
        </label>
      </div>

      {error ? (
        <p
          className="mt-4 border-l-2 border-danger pl-3 text-sm text-danger"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <Button type="submit" disabled={submitting} className="mt-6 w-full py-2.5">
        {submitting ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}

export function LoginClientPage() {
  return (
    <Suspense
      fallback={
        <div className="ps-card p-6 text-sm text-ink-muted">Loading…</div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
