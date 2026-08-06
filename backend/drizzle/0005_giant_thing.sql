CREATE TYPE "public"."return_type" AS ENUM('RETURNABLE', 'NON_RETURNABLE');--> statement-breakpoint
CREATE TABLE "items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_code" varchar(30) NOT NULL,
	"item_name" varchar(150) NOT NULL,
	"unit_id" uuid NOT NULL,
	"item_group_id" uuid NOT NULL,
	"return_type" "return_type" DEFAULT 'NON_RETURNABLE' NOT NULL,
	"purchase_rate" numeric(18, 4) DEFAULT '0' NOT NULL,
	"remarks" varchar(500),
	"is_active" boolean DEFAULT true NOT NULL,
	"is_requestable" boolean DEFAULT true NOT NULL,
	"is_issuable" boolean DEFAULT true NOT NULL,
	"track_serial_number" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_item_group_id_item_groups_id_fk" FOREIGN KEY ("item_group_id") REFERENCES "public"."item_groups"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE UNIQUE INDEX "items_item_code_lower_uidx" ON "items" USING btree (lower("item_code"));--> statement-breakpoint
CREATE UNIQUE INDEX "items_item_name_lower_uidx" ON "items" USING btree (lower("item_name"));--> statement-breakpoint
CREATE INDEX "items_unit_id_idx" ON "items" USING btree ("unit_id");--> statement-breakpoint
CREATE INDEX "items_item_group_id_idx" ON "items" USING btree ("item_group_id");--> statement-breakpoint
CREATE INDEX "items_is_active_idx" ON "items" USING btree ("is_active");