import { redirect } from "next/navigation";
import { ChangeInitialPasswordForm } from "@/components/auth/change-initial-password-form";
import { BrandLogo } from "@/components/layout/brand-logo";
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
    <div className="ps-card p-6 sm:p-8">
      <div className="mb-6">
        <BrandLogo height={44} priority className="mb-4" />
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-secondary">
          Printing Stationery
        </p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-accent">
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
