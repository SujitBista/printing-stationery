import { loadEnv } from "../config/env.js";
import { closePool, createDb } from "../db/client.js";
import { backfillMissingStoreAssignments } from "../services/store-users.assignment.js";

async function main(): Promise<void> {
  const env = loadEnv();
  createDb(env);

  try {
    const result = await backfillMissingStoreAssignments();
    console.log(
      `Store assignment backfill finished. Assigned ${result.assigned}, skipped ${result.skipped}.`,
    );
  } finally {
    await closePool();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
