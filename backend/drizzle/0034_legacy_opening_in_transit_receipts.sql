CREATE TABLE IF NOT EXISTS "legacy_opening_in_transit_receipts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "opening_stock_line_id" uuid NOT NULL,
  "status" "item_issue_receipt_status" DEFAULT 'PENDING_VERIFICATION' NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "receipt_date" timestamptz NOT NULL,
  "received_quantity" numeric(18, 4) NOT NULL,
  "damaged_quantity" numeric(18, 4) DEFAULT '0' NOT NULL,
  "missing_quantity" numeric(18, 4) DEFAULT '0' NOT NULL,
  "discrepancy_reason" "item_issue_discrepancy_reason",
  "discrepancy_resolution" "item_issue_discrepancy_resolution",
  "remarks" varchar(500),
  "created_by_application_user_id" uuid NOT NULL,
  "submitted_by_application_user_id" uuid,
  "verified_by_application_user_id" uuid,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  "submitted_at" timestamptz,
  "verified_at" timestamptz,
  CONSTRAINT "legacy_opening_in_transit_receipts_version_positive" CHECK ("version" >= 1),
  CONSTRAINT "legacy_opening_in_transit_receipts_quantities" CHECK (
    "received_quantity" >= 0
    AND "damaged_quantity" >= 0
    AND "missing_quantity" >= 0
    AND ("received_quantity" + "damaged_quantity") > 0
  )
);
--> statement-breakpoint
ALTER TABLE "legacy_opening_in_transit_receipts"
  ADD CONSTRAINT "legacy_opening_in_transit_receipts_line_fk"
  FOREIGN KEY ("opening_stock_line_id") REFERENCES "opening_stock_lines"("id")
  ON DELETE restrict ON UPDATE restrict;
--> statement-breakpoint
ALTER TABLE "legacy_opening_in_transit_receipts"
  ADD CONSTRAINT "legacy_opening_in_transit_receipts_created_by_fk"
  FOREIGN KEY ("created_by_application_user_id") REFERENCES "application_users"("id")
  ON DELETE restrict ON UPDATE restrict;
--> statement-breakpoint
ALTER TABLE "legacy_opening_in_transit_receipts"
  ADD CONSTRAINT "legacy_opening_in_transit_receipts_submitted_by_fk"
  FOREIGN KEY ("submitted_by_application_user_id") REFERENCES "application_users"("id")
  ON DELETE restrict ON UPDATE restrict;
--> statement-breakpoint
ALTER TABLE "legacy_opening_in_transit_receipts"
  ADD CONSTRAINT "legacy_opening_in_transit_receipts_verified_by_fk"
  FOREIGN KEY ("verified_by_application_user_id") REFERENCES "application_users"("id")
  ON DELETE restrict ON UPDATE restrict;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "legacy_opening_in_transit_receipts_line_id_idx"
  ON "legacy_opening_in_transit_receipts" USING btree ("opening_stock_line_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "legacy_opening_in_transit_receipts_status_idx"
  ON "legacy_opening_in_transit_receipts" USING btree ("status");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "legacy_opening_in_transit_receipts_one_open_uidx"
  ON "legacy_opening_in_transit_receipts" USING btree ("opening_stock_line_id")
  WHERE "status" IN ('DRAFT', 'PENDING_VERIFICATION', 'RETURNED');
