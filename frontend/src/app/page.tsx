import { HealthDashboard } from "@/components/dashboard/health-dashboard";
import { fetchHealth } from "@/lib/api/health";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const health = await fetchHealth();

  return <HealthDashboard health={health} />;
}
