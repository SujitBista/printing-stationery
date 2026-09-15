"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { AuthenticatedUser } from "@printing-stationery/shared";
import { fetchCurrentUser } from "@/lib/api/auth";
import { AuthProvider } from "@/lib/auth/auth-context";
import { ItemRequestNavProvider } from "@/lib/item-requests/use-item-request-nav-context";

type GateStatus = "loading" | "ready" | "redirecting" | "error";

function loginHref(): string {
  const returnTo = `${window.location.pathname}${window.location.search}`;
  if (
    returnTo.startsWith("/") &&
    !returnTo.startsWith("//") &&
    returnTo !== "/login"
  ) {
    return `/login?returnTo=${encodeURIComponent(returnTo)}`;
  }
  return "/login";
}

function SessionLoadingScreen({ message }: { message: string }) {
  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <div className="h-[var(--header-height)] border-b-4 border-secondary bg-accent" />
      <div className="flex flex-1">
        <div className="hidden w-[var(--shell-width)] border-r border-border-strong bg-paper-elevated lg:block" />
        <div className="flex flex-1 items-center justify-center px-4">
          <p className="text-sm text-ink-muted">{message}</p>
        </div>
      </div>
    </div>
  );
}

export function AuthSessionGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [status, setStatus] = useState<GateStatus>("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void fetchCurrentUser().then((result) => {
      if (cancelled) {
        return;
      }

      if (!result.ok) {
        if (result.status === 401) {
          setStatus("redirecting");
          window.location.replace(loginHref());
          return;
        }
        setError(result.error);
        setStatus("error");
        return;
      }

      if (result.data.mustChangePassword) {
        setStatus("redirecting");
        router.replace("/change-initial-password");
        return;
      }

      setUser(result.data);
      setStatus("ready");
    });

    return () => {
      cancelled = true;
    };
  }, [router]);

  if (status === "error") {
    return (
      <SessionLoadingScreen
        message={
          error ?? "Unable to load your session. Refresh the page to try again."
        }
      />
    );
  }

  if (status !== "ready" || !user) {
    return <SessionLoadingScreen message="Loading…" />;
  }

  return (
    <AuthProvider initialUser={user}>
      <ItemRequestNavProvider>{children}</ItemRequestNavProvider>
    </AuthProvider>
  );
}
