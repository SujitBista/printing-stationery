import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const drizzleDir = join(dirname(fileURLToPath(import.meta.url)), "../../drizzle");

describe("imported opening in-transit cleanup migration", () => {
  const sql = readFileSync(
    join(drizzleDir, "0035_ignore_imported_opening_in_transit.sql"),
    "utf8",
  );

  it("deletes only legacy in-transit ledger rows and refuses when downstream activity exists", () => {
    assert.match(sql, /DELETE FROM "stock_ledger"/);
    assert.match(sql, /"movement_type" = 'LEGACY_OPENING_IN_TRANSIT'/);
    assert.match(sql, /"stock_category" = 'IN_TRANSIT'/);
    assert.match(sql, /"quantity_out" = 0/);
    assert.match(sql, /RAISE EXCEPTION/);
    assert.match(sql, /legacy_opening_in_transit_receipts/);
    assert.match(sql, /notifications/);
    const deleteStatement = sql.match(/DELETE FROM "stock_ledger"[\s\S]*?;/)?.[0] ?? "";
    assert.match(deleteStatement, /LEGACY_OPENING_IN_TRANSIT/);
    assert.doesNotMatch(deleteStatement, /OPENING_STOCK/);
    assert.doesNotMatch(sql, /source_in_transit_quantity"\s*=/);
    assert.doesNotMatch(sql, /UPDATE "opening_stock_lines"/);
  });

  it("drops legacy receipt metadata without recreating in-transit ledger rows", () => {
    assert.match(sql, /DROP COLUMN IF EXISTS "remaining_in_transit_quantity"/);
    assert.match(sql, /DROP COLUMN IF EXISTS "confirmed_received_quantity"/);
    assert.match(sql, /DROP COLUMN IF EXISTS "needs_admin_review"/);
    assert.match(sql, /DROP COLUMN IF EXISTS "in_transit_review_reason"/);
    assert.match(sql, /DROP TABLE IF EXISTS "legacy_opening_in_transit_receipts"/);
    assert.doesNotMatch(sql, /INSERT INTO "stock_ledger"/);
    assert.match(sql, /available_count_after IS DISTINCT FROM available_count/);
  });
});

describe("direct destination receipt migration", () => {
  const sql = readFileSync(
    join(drizzleDir, "0036_direct_destination_receipt_confirmation.sql"),
    "utf8",
  );

  it("records the confirming role without posting open receipts", () => {
    assert.match(sql, /confirmed_workflow_role/);
    assert.match(sql, /status" = 'CONFIRMED'/);
    assert.doesNotMatch(sql, /INSERT INTO "stock_ledger"/);
    assert.doesNotMatch(sql, /opening_stock/);
    assert.doesNotMatch(sql, /LEGACY_OPENING_IN_TRANSIT/);
  });
});
