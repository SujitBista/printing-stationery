"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, useTransition, type FormEvent } from "react";
import { login } from "@/lib/api/auth";

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
      className="rounded-xl border border-border bg-paper-elevated/95 p-6 shadow-sm"
      noValidate
    >
      <div className="mb-6">
        <p
          className="text-2xl font-semibold tracking-tight text-ink"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Printing Stationery
        </p>
        <h1 className="mt-2 text-lg font-medium text-ink">Sign in</h1>
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
            className="rounded-md border border-border bg-paper px-3 py-2 outline-none focus:ring-2 focus:ring-accent/30"
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
            className="rounded-md border border-border bg-paper px-3 py-2 outline-none focus:ring-2 focus:ring-accent/30"
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

      <button
        type="submit"
        disabled={submitting}
        className="mt-6 w-full rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-white hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

export function LoginClientPage() {
  return (
    <Suspense
      fallback={
        <div className="rounded-xl border border-border bg-paper-elevated/95 p-6 text-sm text-ink-muted">
          Loading…
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
