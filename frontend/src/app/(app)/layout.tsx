import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { AuthSessionGate } from "@/components/layout/auth-session-gate";

export default function AuthenticatedAppLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <AuthSessionGate>
      <AppShell>{children}</AppShell>
    </AuthSessionGate>
  );
}
