import { redirect } from "next/navigation";
import { ChangeInitialPasswordForm } from "@/components/auth/change-initial-password-form";
import { fetchCurrentUserServer } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

export default async function ChangeInitialPasswordPage() {
  const user = await fetchCurrentUserServer();

  if (!user) {
    redirect("/login");
  }

  if (!user.mustChangePassword) {
    redirect("/");
  }

  return (
    <div className="rounded-xl border border-border bg-paper-elevated/95 p-6 shadow-sm">
      <div className="mb-6">
        <p
          className="text-2xl font-semibold tracking-tight text-ink"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Printing Stationery
        </p>
        <h1 className="mt-2 text-lg font-medium text-ink">
          Change initial password
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          You must set a new password before using the application.
        </p>
      </div>
      <ChangeInitialPasswordForm />
    </div>
  );
}
