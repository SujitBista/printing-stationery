COMMIT;--> statement-breakpoint
COMMENT ON COLUMN "item_requests"."requesting_store_id" IS
  'Request From Store: the store making the request. API field: sourceStoreId.';--> statement-breakpoint
COMMENT ON COLUMN "item_requests"."corporate_store_id" IS
  'Request To Store: the store that processes and supplies. API field: destinationStoreId. Column name is historical (corporate/HO routing).';--> statement-breakpoint
ALTER TYPE "public"."stock_ledger_movement_type" ADD VALUE 'ITEM_ISSUE';--> statement-breakpoint
ALTER TYPE "public"."stock_ledger_reference_type" ADD VALUE 'ITEM_ISSUE';--> statement-breakpoint
BEGIN;
