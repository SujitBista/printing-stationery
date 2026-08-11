import { loadEnv } from "../config/env.js";
import { closePool, createDb } from "../db/client.js";
import { cleanupExpiredSessions } from "../services/auth.service.js";

async function main(): Promise<void> {
  const env = loadEnv();
  createDb(env);

  try {
    const removed = await cleanupExpiredSessions();
    console.log(`Removed ${removed} expired or long-revoked session(s).`);
  } finally {
    await closePool();
  }
}

main().catch((error) => {
  console.error("Session cleanup failed:", error);
  process.exit(1);
});
