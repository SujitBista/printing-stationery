COMMIT;--> statement-breakpoint
ALTER TYPE "public"."stock_ledger_movement_type" ADD VALUE 'PURCHASE';--> statement-breakpoint
ALTER TYPE "public"."stock_ledger_reference_type" ADD VALUE 'PURCHASE';--> statement-breakpoint
BEGIN;--> statement-breakpoint
ALTER TABLE "stock_ledger" DROP CONSTRAINT "stock_ledger_reference_batch_fk";--> statement-breakpoint
ALTER TABLE "stock_ledger" DROP CONSTRAINT "stock_ledger_reference_line_fk";--> statement-breakpoint
CREATE INDEX "stock_ledger_reference_idx" ON "stock_ledger" USING btree ("reference_type","reference_id");--> statement-breakpoint
INSERT INTO "stock_ledger" (
  "store_id",
  "item_id",
  "unit_id",
  "rate",
  "movement_type",
  "quantity_in",
  "quantity_out",
  "amount_in",
  "amount_out",
  "transaction_date",
  "reference_type",
  "reference_id",
  "reference_line_id",
  "posted_by_application_user_id",
  "posted_at"
)
SELECT
  p."store_id",
  pl."item_id",
  i."unit_id",
  pl."rate",
  'PURCHASE',
  pl."quantity",
  '0',
  round(pl."amount", 2),
  '0',
  (p."purchase_date"::timestamp AT TIME ZONE 'UTC'),
  'PURCHASE',
  p."id",
  pl."id",
  p."created_by_application_user_id",
  p."created_at"
FROM "purchase_lines" pl
INNER JOIN "purchases" p ON p."id" = pl."purchase_id"
INNER JOIN "items" i ON i."id" = pl."item_id"
WHERE NOT EXISTS (
  SELECT 1
  FROM "stock_ledger" sl
  WHERE sl."reference_type" = 'PURCHASE'
    AND sl."reference_line_id" = pl."id"
);
