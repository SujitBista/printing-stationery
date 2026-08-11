import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { fetchCurrentUserServer } from "@/lib/auth/server";
import { LoginClientPage } from "@/components/auth/login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage(): Promise<ReactNode> {
  const user = await fetchCurrentUserServer();
  if (user) {
    redirect(user.mustChangePassword ? "/change-initial-password" : "/");
  }

  return <LoginClientPage />;
}
