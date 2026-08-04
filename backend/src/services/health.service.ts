import { sql } from "drizzle-orm";
import type { HealthResponse } from "@printing-stationery/shared";
import { getDb } from "../db/client.js";

export async function getHealthStatus(): Promise<HealthResponse> {
  const timestamp = new Date().toISOString();

  try {
    await getDb().execute(sql`SELECT 1`);
    return {
      status: "ok",
      timestamp,
      database: "up",
    };
  } catch {
    // Never expose credentials or raw database errors to clients.
    return {
      status: "degraded",
      timestamp,
      database: "down",
    };
  }
}
