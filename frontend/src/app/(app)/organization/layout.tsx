import type { ReactNode } from "react";
import { canAccessOrganizationSetup } from "@/lib/auth/permissions";
import { fetchCurrentUserServer } from "@/lib/auth/server";

export default async function OrganizationLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const user = await fetchCurrentUserServer();

  if (!canAccessOrganizationSetup(user)) {
    return (
      <section className="w-full max-w-7xl">
        <h1 className="text-2xl font-bold tracking-tight text-accent sm:text-3xl">
          Organization Setup
        </h1>
        <p className="mt-4 border-l-2 border-danger pl-3 text-sm text-danger">
          Only an Admin can set up organization data.
        </p>
      </section>
    );
  }

  return children;
}
