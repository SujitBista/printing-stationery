-- Imported Opening Stock in-transit quantity is ignored.
-- Remove ledger rows created by 0033 only when no receipt, FIFO,
-- damaged, discrepancy, or notification activity exists for them.
-- Do not change OPENING_STOCK / AVAILABLE rows or source in-transit columns.
DO $$
DECLARE
  receipt_count integer := 0;
  downstream_count integer := 0;
  notification_count integer := 0;
  available_count bigint;
  available_qty numeric;
  available_count_after bigint;
  available_qty_after numeric;
BEGIN
  SELECT count(*), coalesce(sum("quantity_in"), 0)
  INTO available_count, available_qty
  FROM "stock_ledger"
  WHERE "movement_type" = 'OPENING_STOCK'
    AND "stock_category" = 'AVAILABLE'
    AND "reference_type" = 'OPENING_STOCK';

  IF to_regclass('public.legacy_opening_in_transit_receipts') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM "legacy_opening_in_transit_receipts"'
      INTO receipt_count;
  END IF;

  SELECT count(*)
  INTO downstream_count
  FROM "stock_ledger" AS "child"
  WHERE "child"."reference_line_id" IN (
      SELECT "legacy"."reference_line_id"
      FROM "stock_ledger" AS "legacy"
      WHERE "legacy"."movement_type" = 'LEGACY_OPENING_IN_TRANSIT'
         OR "legacy"."reference_type" IN (
           'LEGACY_OPENING_IN_TRANSIT',
           'LEGACY_OPENING_IN_TRANSIT_RECEIPT'
         )
    )
    AND NOT (
      "child"."movement_type" = 'LEGACY_OPENING_IN_TRANSIT'
      AND "child"."reference_type" = 'LEGACY_OPENING_IN_TRANSIT'
      AND "child"."stock_category" = 'IN_TRANSIT'
      AND "child"."quantity_out" = 0
    )
    AND NOT (
      "child"."movement_type" = 'OPENING_STOCK'
      AND "child"."stock_category" = 'AVAILABLE'
      AND "child"."reference_type" = 'OPENING_STOCK'
    );

  SELECT count(*)
  INTO notification_count
  FROM "notifications"
  WHERE "related_entity_id" IN (
    SELECT "stock_ledger"."id"
    FROM "stock_ledger"
    WHERE "stock_ledger"."movement_type" IN (
        'LEGACY_OPENING_IN_TRANSIT',
        'LEGACY_OPENING_IN_TRANSIT_RECEIPT'
      )
      OR "stock_ledger"."reference_type" IN (
        'LEGACY_OPENING_IN_TRANSIT',
        'LEGACY_OPENING_IN_TRANSIT_RECEIPT'
      )
  );

  IF receipt_count > 0 OR downstream_count > 0 OR notification_count > 0 THEN
    RAISE EXCEPTION
      'Refusing to remove imported opening in-transit rows because downstream activity exists (receipts=%, other ledger rows=%, notifications=%).',
      receipt_count,
      downstream_count,
      notification_count;
  END IF;

  DELETE FROM "stock_ledger"
  WHERE "movement_type" = 'LEGACY_OPENING_IN_TRANSIT'
    AND "reference_type" = 'LEGACY_OPENING_IN_TRANSIT'
    AND "stock_category" = 'IN_TRANSIT'
    AND "quantity_out" = 0;

  SELECT count(*), coalesce(sum("quantity_in"), 0)
  INTO available_count_after, available_qty_after
  FROM "stock_ledger"
  WHERE "movement_type" = 'OPENING_STOCK'
    AND "stock_category" = 'AVAILABLE'
    AND "reference_type" = 'OPENING_STOCK';

  IF available_count_after IS DISTINCT FROM available_count
     OR available_qty_after IS DISTINCT FROM available_qty THEN
    RAISE EXCEPTION
      'Cleanup changed AVAILABLE opening stock from % rows / % to % rows / %.',
      available_count,
      available_qty,
      available_count_after,
      available_qty_after;
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "opening_stock_lines"
  DROP COLUMN IF EXISTS "remaining_in_transit_quantity",
  DROP COLUMN IF EXISTS "confirmed_received_quantity",
  DROP COLUMN IF EXISTS "needs_admin_review",
  DROP COLUMN IF EXISTS "in_transit_review_reason";
--> statement-breakpoint
DROP TABLE IF EXISTS "legacy_opening_in_transit_receipts";
