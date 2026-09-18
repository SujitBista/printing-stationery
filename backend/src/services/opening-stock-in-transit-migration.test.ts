import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const drizzleDir = join(dirname(fileURLToPath(import.meta.url)), "../../drizzle");

describe("legacy opening in-transit migration", () => {
  it("backfills IN_TRANSIT ledger rows without recreating AVAILABLE opening stock", () => {
    const sql = readFileSync(
      join(drizzleDir, "0033_legacy_opening_in_transit.sql"),
      "utf8",
    );
    assert.match(sql, /ADD VALUE IF NOT EXISTS 'LEGACY_OPENING_IN_TRANSIT'/);
    assert.match(
      sql,
      /ADD VALUE IF NOT EXISTS 'LEGACY_OPENING_IN_TRANSIT_RECEIPT'/,
    );
    assert.match(sql, /INSERT INTO "stock_ledger"/);
    assert.match(sql, /'IN_TRANSIT'/);
    assert.match(sql, /ON CONFLICT \("source_key"\) DO NOTHING/);
    assert.match(sql, /needs_admin_review/);
    assert.match(sql, /source_in_transit_quantity"::numeric > 0/);
    assert.doesNotMatch(
      sql,
      /INSERT INTO "stock_ledger"[\s\S]*'OPENING_STOCK'[\s\S]*'AVAILABLE'/,
    );
    assert.doesNotMatch(sql, /from_store_id/);
    assert.doesNotMatch(sql, /source_store/);
  });
});
