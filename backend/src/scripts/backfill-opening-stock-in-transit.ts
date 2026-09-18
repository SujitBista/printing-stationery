import { closePool, createDb } from "../db/client.js";
import { loadEnv } from "../config/env.js";
import { backfillPostedOpeningStockInTransit } from "../services/opening-stock-in-transit.service.js";

async function main(): Promise<void> {
  const env = loadEnv();
  createDb(env);
  try {
    const result = await backfillPostedOpeningStockInTransit();
    console.log(
      JSON.stringify(
        {
          insertedCount: result.insertedCount,
          skippedExistingCount: result.skippedExistingCount,
          reviewCount: result.reviewCount,
          unchangedAvailableCount: result.unchangedAvailableCount,
        },
        null,
        2,
      ),
    );
  } finally {
    await closePool();
  }
}

void main();
