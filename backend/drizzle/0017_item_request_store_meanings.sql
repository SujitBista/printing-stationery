-- Document existing item_requests store columns without renaming or rewriting
-- rows. Current meanings are already:
--   requesting_store_id = Request To / receiving / destination store
--   corporate_store_id  = Request From / supplying / source store
-- Existing records keep those values. New requests set corporate_store_id at
-- create time instead of waiting until RECOMMEND.

COMMENT ON COLUMN "item_requests"."requesting_store_id" IS
  'Request To / receiving / destination store that needs the items. API field: destinationStoreId.';
--> statement-breakpoint
COMMENT ON COLUMN "item_requests"."corporate_store_id" IS
  'Request From / supplying / source store that will provide the items. API field: sourceStoreId. Column name is historical (corporate/HO routing).';
--> statement-breakpoint
ALTER TABLE "item_requests" ADD CONSTRAINT "item_requests_source_ne_destination"
  CHECK ("corporate_store_id" IS NULL OR "corporate_store_id" <> "requesting_store_id");
