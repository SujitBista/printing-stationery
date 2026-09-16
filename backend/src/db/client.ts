import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import type { Env } from "../config/env.js";
import * as schema from "./schema/index.js";

export type AppDatabase = ReturnType<typeof drizzle<typeof schema>>;
export type AppTransaction = Parameters<
  Parameters<AppDatabase["transaction"]>[0]
>[0];
export type DbExecutor = AppDatabase | AppTransaction;

let pool: Pool | undefined;
let db: AppDatabase | undefined;

export function createDb(env: Env): AppDatabase {
  if (db && pool) {
    return db;
  }

  pool = new Pool({
    connectionString: env.DATABASE_URL,
  });

  db = drizzle(pool, { schema });
  return db;
}

export function getPool(): Pool {
  if (!pool) {
    throw new Error("PostgreSQL pool has not been initialized");
  }
  return pool;
}

export function getDb(): AppDatabase {
  if (!db) {
    throw new Error("Database client has not been initialized");
  }
  return db;
}

export async function closePool(): Promise<void> {
  if (!pool) {
    return;
  }

  await pool.end();
  pool = undefined;
  db = undefined;
}
