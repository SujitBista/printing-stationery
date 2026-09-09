ALTER TABLE "purchases" DROP CONSTRAINT "purchases_item_request_id_fk";
--> statement-breakpoint
DROP INDEX "purchases_item_request_id_idx";
--> statement-breakpoint
ALTER TABLE "purchases" DROP COLUMN "item_request_id";
