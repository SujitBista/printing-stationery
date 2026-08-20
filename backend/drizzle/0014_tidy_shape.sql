CREATE TYPE "public"."opening_stock_batch_status" AS ENUM('DRAFT', 'VALIDATED', 'POSTED', 'FAILED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."opening_stock_mapping_entity_type" AS ENUM('STORE', 'ITEM', 'UNIT');--> statement-breakpoint
CREATE TYPE "public"."opening_stock_mapping_status" AS ENUM('MAPPED', 'UNMAPPED_STORE', 'UNMAPPED_ITEM', 'UNMAPPED_UNIT', 'UNIT_MISMATCH', 'AMBIGUOUS_STORE', 'AMBIGUOUS_ITEM', 'AMBIGUOUS_UNIT', 'INVALID');--> statement-breakpoint
CREATE TYPE "public"."opening_stock_source_type" AS ENUM('MANUAL', 'LEGACY_IMPORT');--> statement-breakpoint
CREATE TYPE "public"."stock_ledger_movement_type" AS ENUM('OPENING_STOCK');--> statement-breakpoint
CREATE TYPE "public"."stock_ledger_reference_type" AS ENUM('OPENING_STOCK');--> statement-breakpoint
CREATE TABLE "opening_stock_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_number" varchar(40) NOT NULL,
	"source_type" "opening_stock_source_type" NOT NULL,
	"source_filename" varchar(255),
	"source_file_hash" varchar(64),
	"report_title" varchar(255),
	"source_report_from_date" timestamp with time zone,
	"source_report_to_date" timestamp with time zone,
	"cutover_date" timestamp with time zone NOT NULL,
	"status" "opening_stock_batch_status" DEFAULT 'DRAFT' NOT NULL,
	"remarks" varchar(500),
	"created_by_application_user_id" uuid NOT NULL,
	"validated_by_application_user_id" uuid,
	"validated_at" timestamp with time zone,
	"posted_by_application_user_id" uuid,
	"posted_at" timestamp with time zone,
	"cancelled_by_application_user_id" uuid,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opening_stock_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"opening_stock_batch_id" uuid NOT NULL,
	"store_id" uuid,
	"item_id" uuid,
	"unit_id" uuid,
	"legacy_store_name" varchar(150) NOT NULL,
	"legacy_category_name" varchar(100) NOT NULL,
	"legacy_item_name" varchar(200) NOT NULL,
	"legacy_unit_name" varchar(100) NOT NULL,
	"item_rate" numeric(18, 4) NOT NULL,
	"source_opening_quantity" numeric(18, 4) NOT NULL,
	"source_opening_amount" numeric(18, 2) NOT NULL,
	"source_purchase_quantity" numeric(18, 4) NOT NULL,
	"source_purchase_amount" numeric(18, 2) NOT NULL,
	"source_received_quantity" numeric(18, 4) NOT NULL,
	"source_received_amount" numeric(18, 2) NOT NULL,
	"source_consumption_quantity" numeric(18, 4) NOT NULL,
	"source_consumption_amount" numeric(18, 2) NOT NULL,
	"source_transfer_quantity" numeric(18, 4) NOT NULL,
	"source_transfer_amount" numeric(18, 2) NOT NULL,
	"source_in_transit_quantity" numeric(18, 4) NOT NULL,
	"source_in_transit_amount" numeric(18, 2) NOT NULL,
	"opening_quantity" numeric(18, 4) NOT NULL,
	"opening_amount" numeric(18, 2) NOT NULL,
	"mapping_status" "opening_stock_mapping_status" DEFAULT 'INVALID' NOT NULL,
	"validation_errors" text[] DEFAULT '{}'::text[] NOT NULL,
	"source_row_number" numeric(10, 0) NOT NULL,
	"is_included_for_posting" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "opening_stock_lines_nonnegative_rate" CHECK ("opening_stock_lines"."item_rate" >= 0)
);
--> statement-breakpoint
CREATE TABLE "opening_stock_name_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" "opening_stock_mapping_entity_type" NOT NULL,
	"legacy_name" varchar(200) NOT NULL,
	"normalized_legacy_name" varchar(200) NOT NULL,
	"store_id" uuid,
	"item_id" uuid,
	"unit_id" uuid,
	"created_by_application_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"unit_id" uuid NOT NULL,
	"rate" numeric(18, 4) NOT NULL,
	"movement_type" "stock_ledger_movement_type" NOT NULL,
	"quantity_in" numeric(18, 4) NOT NULL,
	"quantity_out" numeric(18, 4) NOT NULL,
	"amount_in" numeric(18, 2) NOT NULL,
	"amount_out" numeric(18, 2) NOT NULL,
	"transaction_date" timestamp with time zone NOT NULL,
	"reference_type" "stock_ledger_reference_type" NOT NULL,
	"reference_id" uuid NOT NULL,
	"reference_line_id" uuid NOT NULL,
	"posted_by_application_user_id" uuid NOT NULL,
	"posted_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_ledger_nonnegative_values" CHECK ("stock_ledger"."quantity_in" >= 0 and "stock_ledger"."quantity_out" >= 0 and "stock_ledger"."amount_in" >= 0 and "stock_ledger"."amount_out" >= 0)
);
--> statement-breakpoint
ALTER TABLE "opening_stock_batches" ADD CONSTRAINT "opening_stock_batches_created_by_fk" FOREIGN KEY ("created_by_application_user_id") REFERENCES "public"."application_users"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "opening_stock_batches" ADD CONSTRAINT "opening_stock_batches_validated_by_fk" FOREIGN KEY ("validated_by_application_user_id") REFERENCES "public"."application_users"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "opening_stock_batches" ADD CONSTRAINT "opening_stock_batches_posted_by_fk" FOREIGN KEY ("posted_by_application_user_id") REFERENCES "public"."application_users"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "opening_stock_batches" ADD CONSTRAINT "opening_stock_batches_cancelled_by_fk" FOREIGN KEY ("cancelled_by_application_user_id") REFERENCES "public"."application_users"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "opening_stock_lines" ADD CONSTRAINT "opening_stock_lines_batch_fk" FOREIGN KEY ("opening_stock_batch_id") REFERENCES "public"."opening_stock_batches"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "opening_stock_lines" ADD CONSTRAINT "opening_stock_lines_store_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "opening_stock_lines" ADD CONSTRAINT "opening_stock_lines_item_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "opening_stock_lines" ADD CONSTRAINT "opening_stock_lines_unit_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "opening_stock_name_mappings" ADD CONSTRAINT "opening_stock_name_mappings_store_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "opening_stock_name_mappings" ADD CONSTRAINT "opening_stock_name_mappings_item_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "opening_stock_name_mappings" ADD CONSTRAINT "opening_stock_name_mappings_unit_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "opening_stock_name_mappings" ADD CONSTRAINT "opening_stock_name_mappings_created_by_fk" FOREIGN KEY ("created_by_application_user_id") REFERENCES "public"."application_users"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "stock_ledger" ADD CONSTRAINT "stock_ledger_store_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "stock_ledger" ADD CONSTRAINT "stock_ledger_item_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "stock_ledger" ADD CONSTRAINT "stock_ledger_unit_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "stock_ledger" ADD CONSTRAINT "stock_ledger_reference_batch_fk" FOREIGN KEY ("reference_id") REFERENCES "public"."opening_stock_batches"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "stock_ledger" ADD CONSTRAINT "stock_ledger_reference_line_fk" FOREIGN KEY ("reference_line_id") REFERENCES "public"."opening_stock_lines"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "stock_ledger" ADD CONSTRAINT "stock_ledger_posted_by_fk" FOREIGN KEY ("posted_by_application_user_id") REFERENCES "public"."application_users"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE UNIQUE INDEX "opening_stock_batches_batch_number_uidx" ON "opening_stock_batches" USING btree ("batch_number");--> statement-breakpoint
CREATE UNIQUE INDEX "opening_stock_batches_source_file_hash_uidx" ON "opening_stock_batches" USING btree ("source_file_hash") WHERE "opening_stock_batches"."source_file_hash" is not null;--> statement-breakpoint
CREATE INDEX "opening_stock_batches_status_idx" ON "opening_stock_batches" USING btree ("status");--> statement-breakpoint
CREATE INDEX "opening_stock_batches_cutover_date_idx" ON "opening_stock_batches" USING btree ("cutover_date");--> statement-breakpoint
CREATE INDEX "opening_stock_lines_batch_id_idx" ON "opening_stock_lines" USING btree ("opening_stock_batch_id");--> statement-breakpoint
CREATE INDEX "opening_stock_lines_store_id_idx" ON "opening_stock_lines" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "opening_stock_lines_item_id_idx" ON "opening_stock_lines" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "opening_stock_lines_unit_id_idx" ON "opening_stock_lines" USING btree ("unit_id");--> statement-breakpoint
CREATE UNIQUE INDEX "opening_stock_lines_batch_source_row_uidx" ON "opening_stock_lines" USING btree ("opening_stock_batch_id","source_row_number","legacy_store_name","legacy_category_name","legacy_item_name","legacy_unit_name","item_rate");--> statement-breakpoint
CREATE UNIQUE INDEX "opening_stock_name_mappings_entity_name_uidx" ON "opening_stock_name_mappings" USING btree ("entity_type","normalized_legacy_name");--> statement-breakpoint
CREATE UNIQUE INDEX "stock_ledger_reference_line_uidx" ON "stock_ledger" USING btree ("reference_type","reference_line_id");--> statement-breakpoint
CREATE INDEX "stock_ledger_store_item_unit_idx" ON "stock_ledger" USING btree ("store_id","item_id","unit_id");