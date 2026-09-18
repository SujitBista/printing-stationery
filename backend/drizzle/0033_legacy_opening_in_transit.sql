-- Imported legacy Opening Stock in-transit quantities post as IN_TRANSIT.
-- COMMIT first so PostgreSQL allows using the new enum values in later
-- statements in this same drizzle-kit migrate run.
COMMIT;
--> statement-breakpoint
ALTER TYPE "public"."stock_ledger_movement_type" ADD VALUE IF NOT EXISTS 'LEGACY_OPENING_IN_TRANSIT';
--> statement-breakpoint
ALTER TYPE "public"."stock_ledger_movement_type" ADD VALUE IF NOT EXISTS 'LEGACY_OPENING_IN_TRANSIT_RECEIPT';
--> statement-breakpoint
ALTER TYPE "public"."stock_ledger_reference_type" ADD VALUE IF NOT EXISTS 'LEGACY_OPENING_IN_TRANSIT';
--> statement-breakpoint
ALTER TYPE "public"."stock_ledger_reference_type" ADD VALUE IF NOT EXISTS 'LEGACY_OPENING_IN_TRANSIT_RECEIPT';
--> statement-breakpoint
BEGIN;
--> statement-breakpoint
ALTER TABLE "opening_stock_lines"
  ADD COLUMN IF NOT EXISTS "remaining_in_transit_quantity" numeric(18, 4) DEFAULT '0' NOT NULL;
--> statement-breakpoint
ALTER TABLE "opening_stock_lines"
  ADD COLUMN IF NOT EXISTS "confirmed_received_quantity" numeric(18, 4) DEFAULT '0' NOT NULL;
--> statement-breakpoint
ALTER TABLE "opening_stock_lines"
  ADD COLUMN IF NOT EXISTS "needs_admin_review" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "opening_stock_lines"
  ADD COLUMN IF NOT EXISTS "in_transit_review_reason" varchar(500);
--> statement-breakpoint
-- Mark incomplete or ambiguous already-posted in-transit rows for Admin review.
-- Never invent a source store. Never recreate AVAILABLE Opening Stock entries.
UPDATE "opening_stock_lines" AS "lines"
SET
  "needs_admin_review" = true,
  "in_transit_review_reason" = CASE
    WHEN "lines"."source_in_transit_quantity"::numeric < 0 THEN
      'Imported in-transit quantity is negative and needs Admin review.'
    WHEN "lines"."store_id" IS NULL
      OR "lines"."item_id" IS NULL
      OR "lines"."unit_id" IS NULL
      OR "lines"."mapping_status" <> 'MAPPED' THEN
      'Imported in-transit quantity is missing a mapped destination store, item, or unit and needs Admin review.'
    WHEN (
      SELECT count(*)
      FROM "stock_ledger"
      WHERE "stock_ledger"."reference_line_id" = "lines"."id"
        AND "stock_ledger"."reference_type" = 'LEGACY_OPENING_IN_TRANSIT'
        AND "stock_ledger"."stock_category" = 'IN_TRANSIT'
        AND "stock_ledger"."quantity_in"::numeric > 0
    ) > 1 THEN
      'Existing in-transit ledger rows for this Opening Stock line are ambiguous and need Admin review.'
    WHEN EXISTS (
      SELECT 1
      FROM "stock_ledger"
      WHERE "stock_ledger"."reference_line_id" = "lines"."id"
        AND "stock_ledger"."stock_category" = 'IN_TRANSIT'
        AND "stock_ledger"."quantity_in"::numeric > 0
        AND (
          "stock_ledger"."reference_type" <> 'LEGACY_OPENING_IN_TRANSIT'
          OR "stock_ledger"."source_key" <> concat_ws(
            ':',
            'LEGACY_OPENING_IN_TRANSIT',
            "lines"."id"::text,
            "lines"."store_id"::text,
            'LEGACY_OPENING_IN_TRANSIT',
            'IN_TRANSIT',
            "lines"."item_rate"::text
          )
        )
    ) THEN
      'An existing in-transit ledger row does not match the deterministic source key and needs Admin review.'
    WHEN EXISTS (
      SELECT 1
      FROM "stock_ledger"
      WHERE "stock_ledger"."reference_line_id" = "lines"."id"
        AND "stock_ledger"."reference_type" = 'LEGACY_OPENING_IN_TRANSIT'
        AND "stock_ledger"."stock_category" = 'IN_TRANSIT'
        AND "stock_ledger"."source_key" = concat_ws(
          ':',
          'LEGACY_OPENING_IN_TRANSIT',
          "lines"."id"::text,
          "lines"."store_id"::text,
          'LEGACY_OPENING_IN_TRANSIT',
          'IN_TRANSIT',
          "lines"."item_rate"::text
        )
        AND "stock_ledger"."quantity_in"::numeric <> "lines"."source_in_transit_quantity"::numeric
    ) THEN
      'Existing in-transit quantity does not match the imported in-transit quantity and needs Admin review.'
    ELSE "lines"."in_transit_review_reason"
  END,
  "updated_at" = now()
FROM "opening_stock_batches" AS "batches"
WHERE "lines"."opening_stock_batch_id" = "batches"."id"
  AND "batches"."status" = 'POSTED'
  AND "lines"."source_in_transit_quantity"::numeric <> 0
  AND (
    "lines"."source_in_transit_quantity"::numeric < 0
    OR "lines"."store_id" IS NULL
    OR "lines"."item_id" IS NULL
    OR "lines"."unit_id" IS NULL
    OR "lines"."mapping_status" <> 'MAPPED'
    OR (
      SELECT count(*)
      FROM "stock_ledger"
      WHERE "stock_ledger"."reference_line_id" = "lines"."id"
        AND "stock_ledger"."reference_type" = 'LEGACY_OPENING_IN_TRANSIT'
        AND "stock_ledger"."stock_category" = 'IN_TRANSIT'
        AND "stock_ledger"."quantity_in"::numeric > 0
    ) > 1
    OR EXISTS (
      SELECT 1
      FROM "stock_ledger"
      WHERE "stock_ledger"."reference_line_id" = "lines"."id"
        AND "stock_ledger"."stock_category" = 'IN_TRANSIT'
        AND "stock_ledger"."quantity_in"::numeric > 0
        AND (
          "stock_ledger"."reference_type" <> 'LEGACY_OPENING_IN_TRANSIT'
          OR "stock_ledger"."source_key" <> concat_ws(
            ':',
            'LEGACY_OPENING_IN_TRANSIT',
            "lines"."id"::text,
            "lines"."store_id"::text,
            'LEGACY_OPENING_IN_TRANSIT',
            'IN_TRANSIT',
            "lines"."item_rate"::text
          )
        )
    )
    OR EXISTS (
      SELECT 1
      FROM "stock_ledger"
      WHERE "stock_ledger"."reference_line_id" = "lines"."id"
        AND "stock_ledger"."reference_type" = 'LEGACY_OPENING_IN_TRANSIT'
        AND "stock_ledger"."stock_category" = 'IN_TRANSIT'
        AND "stock_ledger"."source_key" = concat_ws(
          ':',
          'LEGACY_OPENING_IN_TRANSIT',
          "lines"."id"::text,
          "lines"."store_id"::text,
          'LEGACY_OPENING_IN_TRANSIT',
          'IN_TRANSIT',
          "lines"."item_rate"::text
        )
        AND "stock_ledger"."quantity_in"::numeric <> "lines"."source_in_transit_quantity"::numeric
    )
  );
--> statement-breakpoint
INSERT INTO "stock_ledger" (
  "store_id",
  "item_id",
  "unit_id",
  "rate",
  "movement_type",
  "stock_category",
  "quantity_in",
  "quantity_out",
  "amount_in",
  "amount_out",
  "transaction_date",
  "reference_type",
  "reference_id",
  "reference_line_id",
  "source_key",
  "posted_by_application_user_id",
  "posted_at"
)
SELECT
  "lines"."store_id",
  "lines"."item_id",
  "lines"."unit_id",
  "lines"."item_rate",
  'LEGACY_OPENING_IN_TRANSIT',
  'IN_TRANSIT',
  "lines"."source_in_transit_quantity",
  '0',
  "lines"."source_in_transit_amount",
  '0',
  "batches"."cutover_date",
  'LEGACY_OPENING_IN_TRANSIT',
  "batches"."id",
  "lines"."id",
  concat_ws(
    ':',
    'LEGACY_OPENING_IN_TRANSIT',
    "lines"."id"::text,
    "lines"."store_id"::text,
    'LEGACY_OPENING_IN_TRANSIT',
    'IN_TRANSIT',
    "lines"."item_rate"::text
  ),
  coalesce(
    "batches"."posted_by_application_user_id",
    "batches"."created_by_application_user_id"
  ),
  coalesce("batches"."posted_at", "batches"."updated_at")
FROM "opening_stock_lines" AS "lines"
INNER JOIN "opening_stock_batches" AS "batches"
  ON "batches"."id" = "lines"."opening_stock_batch_id"
WHERE "batches"."status" = 'POSTED'
  AND "lines"."source_in_transit_quantity"::numeric > 0
  AND "lines"."needs_admin_review" = false
  AND "lines"."store_id" IS NOT NULL
  AND "lines"."item_id" IS NOT NULL
  AND "lines"."unit_id" IS NOT NULL
  AND "lines"."mapping_status" = 'MAPPED'
  AND NOT EXISTS (
    SELECT 1
    FROM "stock_ledger"
    WHERE "stock_ledger"."reference_line_id" = "lines"."id"
      AND "stock_ledger"."store_id" = "lines"."store_id"
      AND "stock_ledger"."stock_category" = 'IN_TRANSIT'
      AND "stock_ledger"."quantity_in"::numeric > 0
  )
ON CONFLICT ("source_key") DO NOTHING;
--> statement-breakpoint
UPDATE "opening_stock_lines" AS "lines"
SET
  "remaining_in_transit_quantity" = "lines"."source_in_transit_quantity",
  "confirmed_received_quantity" = 0,
  "updated_at" = now()
FROM "opening_stock_batches" AS "batches"
WHERE "lines"."opening_stock_batch_id" = "batches"."id"
  AND "batches"."status" = 'POSTED'
  AND "lines"."source_in_transit_quantity"::numeric > 0
  AND "lines"."needs_admin_review" = false
  AND EXISTS (
    SELECT 1
    FROM "stock_ledger"
    WHERE "stock_ledger"."reference_line_id" = "lines"."id"
      AND "stock_ledger"."reference_type" = 'LEGACY_OPENING_IN_TRANSIT'
      AND "stock_ledger"."stock_category" = 'IN_TRANSIT'
      AND "stock_ledger"."quantity_in"::numeric > 0
      AND "stock_ledger"."source_key" = concat_ws(
        ':',
        'LEGACY_OPENING_IN_TRANSIT',
        "lines"."id"::text,
        "lines"."store_id"::text,
        'LEGACY_OPENING_IN_TRANSIT',
        'IN_TRANSIT',
        "lines"."item_rate"::text
      )
  )
  AND NOT EXISTS (
    SELECT 1
    FROM "stock_ledger"
    WHERE "stock_ledger"."reference_line_id" = "lines"."id"
      AND "stock_ledger"."reference_type" = 'LEGACY_OPENING_IN_TRANSIT_RECEIPT'
  );
