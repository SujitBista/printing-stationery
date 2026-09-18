import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const drizzleDir = join(dirname(fileURLToPath(import.meta.url)), "../../drizzle");

describe("historical item issue delivery migrations", () => {
  it("adds NEEDS_REVIEW without classifying in the same file", () => {
    const sql = readFileSync(
      join(drizzleDir, "0030_item_issue_delivery_review.sql"),
      "utf8",
    );
    assert.match(sql, /ADD VALUE IF NOT EXISTS 'NEEDS_REVIEW'/);
    assert.match(sql, /^COMMIT;/m);
    assert.doesNotMatch(sql, /delivery_status" = 'NEEDS_REVIEW'/);
    assert.doesNotMatch(sql, /INSERT INTO "stock_ledger"/i);
  });

  it("classifies received, in-transit evidence, and unknown without writing ledger rows", () => {
    const sql = readFileSync(
      join(drizzleDir, "0031_item_issue_delivery_classify.sql"),
      "utf8",
    );
    assert.match(sql, /delivery_status" = 'RECEIVED'/);
    assert.match(sql, /delivery_status" = 'NEEDS_REVIEW'/);
    assert.match(sql, /action" = 'DISPATCH'/);
    assert.match(sql, /stock_category" = 'AVAILABLE'/);
    assert.match(sql, /stock_category" = 'IN_TRANSIT'/);
    assert.doesNotMatch(sql, /INSERT INTO "stock_ledger"/i);
    assert.doesNotMatch(sql, /quantity_out"/i);
    assert.match(sql, /never deducts Corporate stock/i);
  });
});
