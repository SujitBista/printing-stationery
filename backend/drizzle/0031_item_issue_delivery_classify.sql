-- Classify historical posted branch issues only when receipt evidence exists.
-- Unknown records become NEEDS_REVIEW and are not receivable.
-- This never deducts Corporate stock, never credits Branch stock, and never
-- inserts stock-ledger rows.
-- NEEDS_REVIEW is added in 0030 so this file can use the enum value.

WITH candidates AS (
  SELECT "item_issues"."id"
  FROM "item_issues"
  WHERE "item_issues"."status" = 'POSTED'
    AND "item_issues"."destination_type" = 'BRANCH_STORE'
    AND "item_issues"."to_store_id" IS NOT NULL
    AND "item_issues"."from_store_id" <> "item_issues"."to_store_id"
    AND NOT EXISTS (
      SELECT 1
      FROM "item_issue_actions"
      WHERE "item_issue_actions"."item_issue_id" = "item_issues"."id"
        AND "item_issue_actions"."action" = 'DISPATCH'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM "item_issue_shipments"
      INNER JOIN "item_issue_receipts"
        ON "item_issue_receipts"."shipment_id" = "item_issue_shipments"."id"
      WHERE "item_issue_shipments"."item_issue_id" = "item_issues"."id"
    )
    AND NOT EXISTS (
      SELECT 1
      FROM "item_issue_shipments"
      INNER JOIN "item_issue_shipment_lines"
        ON "item_issue_shipment_lines"."shipment_id" = "item_issue_shipments"."id"
      INNER JOIN "stock_ledger"
        ON "stock_ledger"."reference_line_id" = "item_issue_shipment_lines"."id"
      WHERE "item_issue_shipments"."item_issue_id" = "item_issues"."id"
        AND "stock_ledger"."store_id" = "item_issues"."to_store_id"
        AND "stock_ledger"."stock_category" = 'IN_TRANSIT'
        AND "stock_ledger"."quantity_in"::numeric > 0
    )
),
received AS (
  SELECT "candidates"."id"
  FROM "candidates"
  INNER JOIN "item_issues" ON "item_issues"."id" = "candidates"."id"
  WHERE EXISTS (
    SELECT 1
    FROM "item_issue_lines"
    INNER JOIN "stock_ledger"
      ON "stock_ledger"."reference_line_id" = "item_issue_lines"."id"
     AND "stock_ledger"."store_id" = "item_issues"."to_store_id"
    WHERE "item_issue_lines"."item_issue_id" = "item_issues"."id"
      AND "stock_ledger"."stock_category" = 'AVAILABLE'
      AND "stock_ledger"."quantity_in"::numeric > 0
      AND "stock_ledger"."movement_type" IN ('ITEM_ISSUE', 'ITEM_ISSUE_RECEIPT')
  )
  OR EXISTS (
    SELECT 1
    FROM "stock_ledger"
    WHERE "stock_ledger"."store_id" = "item_issues"."to_store_id"
      AND "stock_ledger"."reference_id" = "item_issues"."id"
      AND "stock_ledger"."stock_category" = 'AVAILABLE'
      AND "stock_ledger"."quantity_in"::numeric > 0
      AND "stock_ledger"."movement_type" IN ('ITEM_ISSUE', 'ITEM_ISSUE_RECEIPT')
  )
)
UPDATE "item_issues"
SET
  "delivery_status" = 'RECEIVED',
  "needs_admin_review" = false,
  "updated_at" = now()
FROM "received"
WHERE "item_issues"."id" = "received"."id";
--> statement-breakpoint
UPDATE "item_issue_shipments"
SET
  "delivery_status" = 'RECEIVED',
  "received_at" = coalesce("item_issue_shipments"."received_at", now()),
  "updated_at" = now()
FROM "item_issues"
WHERE "item_issue_shipments"."item_issue_id" = "item_issues"."id"
  AND "item_issues"."delivery_status" = 'RECEIVED'
  AND "item_issue_shipments"."delivery_status" <> 'RECEIVED'
  AND NOT EXISTS (
    SELECT 1
    FROM "item_issue_actions"
    WHERE "item_issue_actions"."item_issue_id" = "item_issues"."id"
      AND "item_issue_actions"."action" = 'DISPATCH'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM "item_issue_receipts"
    WHERE "item_issue_receipts"."shipment_id" = "item_issue_shipments"."id"
  );
--> statement-breakpoint
UPDATE "item_issue_shipment_lines"
SET
  "confirmed_received_quantity" = "item_issue_shipment_lines"."dispatched_quantity",
  "remaining_in_transit_quantity" = 0,
  "discrepancy_quantity" = 0,
  "updated_at" = now()
FROM "item_issue_shipments"
INNER JOIN "item_issues"
  ON "item_issues"."id" = "item_issue_shipments"."item_issue_id"
WHERE "item_issue_shipment_lines"."shipment_id" = "item_issue_shipments"."id"
  AND "item_issues"."delivery_status" = 'RECEIVED'
  AND (
    "item_issue_shipment_lines"."confirmed_received_quantity" <>
      "item_issue_shipment_lines"."dispatched_quantity"
    OR "item_issue_shipment_lines"."remaining_in_transit_quantity" <> 0
  )
  AND NOT EXISTS (
    SELECT 1
    FROM "item_issue_actions"
    WHERE "item_issue_actions"."item_issue_id" = "item_issues"."id"
      AND "item_issue_actions"."action" = 'DISPATCH'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM "item_issue_receipts"
    WHERE "item_issue_receipts"."shipment_id" = "item_issue_shipments"."id"
  );
--> statement-breakpoint
INSERT INTO "item_issue_shipments" (
  "item_issue_id",
  "request_id",
  "from_store_id",
  "to_store_id",
  "delivery_status",
  "dispatched_at",
  "dispatched_by_application_user_id",
  "received_at",
  "created_at",
  "updated_at"
)
SELECT
  "item_issues"."id",
  "item_issues"."request_id",
  "item_issues"."from_store_id",
  "item_issues"."to_store_id",
  'RECEIVED',
  coalesce(
    "item_issues"."verified_at",
    "item_issues"."submitted_at",
    "item_issues"."updated_at"
  ),
  coalesce(
    "item_issues"."verified_by_application_user_id",
    "item_issues"."submitted_by_application_user_id",
    "item_issues"."created_by_application_user_id"
  ),
  coalesce("item_issues"."verified_at", "item_issues"."updated_at"),
  coalesce("item_issues"."verified_at", "item_issues"."created_at"),
  now()
FROM "item_issues"
WHERE "item_issues"."status" = 'POSTED'
  AND "item_issues"."destination_type" = 'BRANCH_STORE'
  AND "item_issues"."delivery_status" = 'RECEIVED'
  AND "item_issues"."to_store_id" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "item_issue_shipments"
    WHERE "item_issue_shipments"."item_issue_id" = "item_issues"."id"
  );
--> statement-breakpoint
INSERT INTO "item_issue_shipment_lines" (
  "shipment_id",
  "item_issue_line_id",
  "item_id",
  "unit_id",
  "dispatched_quantity",
  "confirmed_received_quantity",
  "remaining_in_transit_quantity",
  "discrepancy_quantity",
  "created_at",
  "updated_at"
)
SELECT
  "item_issue_shipments"."id",
  "item_issue_lines"."id",
  "item_issue_lines"."item_id",
  "items"."unit_id",
  "item_issue_lines"."issue_quantity",
  "item_issue_lines"."issue_quantity",
  0,
  0,
  "item_issue_shipments"."created_at",
  now()
FROM "item_issue_lines"
INNER JOIN "item_issue_shipments"
  ON "item_issue_shipments"."item_issue_id" = "item_issue_lines"."item_issue_id"
INNER JOIN "item_issues"
  ON "item_issues"."id" = "item_issue_lines"."item_issue_id"
INNER JOIN "items"
  ON "items"."id" = "item_issue_lines"."item_id"
WHERE "item_issues"."delivery_status" = 'RECEIVED'
  AND NOT EXISTS (
    SELECT 1
    FROM "item_issue_shipment_lines"
    WHERE "item_issue_shipment_lines"."item_issue_line_id" = "item_issue_lines"."id"
  );
--> statement-breakpoint
WITH candidates AS (
  SELECT "item_issues"."id"
  FROM "item_issues"
  WHERE "item_issues"."status" = 'POSTED'
    AND "item_issues"."destination_type" = 'BRANCH_STORE'
    AND "item_issues"."to_store_id" IS NOT NULL
    AND "item_issues"."from_store_id" <> "item_issues"."to_store_id"
    AND "item_issues"."delivery_status" IS DISTINCT FROM 'RECEIVED'
    AND "item_issues"."delivery_status" IS DISTINCT FROM 'PARTIALLY_RECEIVED'
    AND "item_issues"."delivery_status" IS DISTINCT FROM 'RECEIVED_WITH_DISCREPANCY'
    AND NOT EXISTS (
      SELECT 1
      FROM "item_issue_actions"
      WHERE "item_issue_actions"."item_issue_id" = "item_issues"."id"
        AND "item_issue_actions"."action" = 'DISPATCH'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM "item_issue_shipments"
      INNER JOIN "item_issue_receipts"
        ON "item_issue_receipts"."shipment_id" = "item_issue_shipments"."id"
      WHERE "item_issue_shipments"."item_issue_id" = "item_issues"."id"
    )
    AND NOT EXISTS (
      SELECT 1
      FROM "item_issue_shipments"
      INNER JOIN "item_issue_shipment_lines"
        ON "item_issue_shipment_lines"."shipment_id" = "item_issue_shipments"."id"
      INNER JOIN "stock_ledger"
        ON "stock_ledger"."reference_line_id" = "item_issue_shipment_lines"."id"
      WHERE "item_issue_shipments"."item_issue_id" = "item_issues"."id"
        AND "stock_ledger"."store_id" = "item_issues"."to_store_id"
        AND "stock_ledger"."stock_category" = 'IN_TRANSIT'
        AND "stock_ledger"."quantity_in"::numeric > 0
    )
    AND NOT EXISTS (
      SELECT 1
      FROM "item_issue_lines"
      INNER JOIN "stock_ledger"
        ON "stock_ledger"."reference_line_id" = "item_issue_lines"."id"
       AND "stock_ledger"."store_id" = "item_issues"."to_store_id"
      WHERE "item_issue_lines"."item_issue_id" = "item_issues"."id"
        AND "stock_ledger"."stock_category" = 'IN_TRANSIT'
        AND "stock_ledger"."quantity_in"::numeric > 0
    )
)
UPDATE "item_issues"
SET
  "delivery_status" = 'NEEDS_REVIEW',
  "needs_admin_review" = true,
  "updated_at" = now()
FROM "candidates"
WHERE "item_issues"."id" = "candidates"."id";
--> statement-breakpoint
UPDATE "item_issue_shipments"
SET
  "delivery_status" = "item_issues"."delivery_status",
  "updated_at" = now()
FROM "item_issues"
WHERE "item_issue_shipments"."item_issue_id" = "item_issues"."id"
  AND "item_issues"."delivery_status" = 'NEEDS_REVIEW'
  AND "item_issue_shipments"."delivery_status" <> 'NEEDS_REVIEW';
--> statement-breakpoint
COMMENT ON COLUMN "item_issues"."delivery_status" IS
  'Branch transfer delivery state. Null for department consumption. NEEDS_REVIEW means historical receipt state is unknown and the issue is not receivable until an Admin classifies it.';
