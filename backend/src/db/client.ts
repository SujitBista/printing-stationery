import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import type { Env } from "../config/env.js";
import * as schema from "./schema/index.js";

let pool: Pool | undefined;
let db: ReturnType<typeof drizzle<typeof schema>> | undefined;

export function createDb(env: Env): ReturnType<typeof drizzle<typeof schema>> {
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

export function getDb(): ReturnType<typeof drizzle<typeof schema>> {
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
