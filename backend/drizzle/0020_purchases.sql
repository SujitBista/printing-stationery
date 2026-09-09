CREATE SEQUENCE "purchase_number_seq" AS bigint START WITH 1 INCREMENT BY 1;
--> statement-breakpoint
CREATE TABLE "purchases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purchase_number" varchar(40) DEFAULT nextval('purchase_number_seq')::text NOT NULL,
	"fiscal_year" varchar(9) NOT NULL,
	"purchase_date" date NOT NULL,
	"purchase_bill_date" date NOT NULL,
	"store_id" uuid NOT NULL,
	"party_id" uuid NOT NULL,
	"total_amount" numeric(18, 4) NOT NULL,
	"po_number" varchar(80),
	"grn_number" varchar(80),
	"delivery_note_number" varchar(80),
	"purchase_bill_number" varchar(80),
	"item_request_id" uuid,
	"remarks" varchar(500),
	"created_by_application_user_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "purchases_version_positive" CHECK ("purchases"."version" >= 1),
	CONSTRAINT "purchases_total_amount_nonnegative" CHECK ("purchases"."total_amount" >= 0),
	CONSTRAINT "purchases_fiscal_year_format" CHECK ("purchases"."fiscal_year" ~ '^[0-9]{4}-[0-9]{4}$')
);
--> statement-breakpoint
CREATE TABLE "purchase_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purchase_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"quantity" numeric(18, 4) NOT NULL,
	"rate" numeric(18, 4) NOT NULL,
	"amount" numeric(18, 4) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "purchase_lines_quantity_positive" CHECK ("purchase_lines"."quantity" > 0),
	CONSTRAINT "purchase_lines_rate_nonnegative" CHECK ("purchase_lines"."rate" >= 0),
	CONSTRAINT "purchase_lines_amount_nonnegative" CHECK ("purchase_lines"."amount" >= 0)
);
--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_store_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_party_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_item_request_id_fk" FOREIGN KEY ("item_request_id") REFERENCES "public"."item_requests"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_created_by_application_user_id_fk" FOREIGN KEY ("created_by_application_user_id") REFERENCES "public"."application_users"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "purchase_lines" ADD CONSTRAINT "purchase_lines_purchase_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."purchases"("id") ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "purchase_lines" ADD CONSTRAINT "purchase_lines_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE UNIQUE INDEX "purchases_purchase_number_uidx" ON "purchases" USING btree ("purchase_number");--> statement-breakpoint
CREATE INDEX "purchases_store_id_idx" ON "purchases" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "purchases_party_id_idx" ON "purchases" USING btree ("party_id");--> statement-breakpoint
CREATE INDEX "purchases_fiscal_year_idx" ON "purchases" USING btree ("fiscal_year");--> statement-breakpoint
CREATE INDEX "purchases_purchase_date_idx" ON "purchases" USING btree ("purchase_date");--> statement-breakpoint
CREATE INDEX "purchases_item_request_id_idx" ON "purchases" USING btree ("item_request_id");--> statement-breakpoint
CREATE INDEX "purchases_created_by_application_user_id_idx" ON "purchases" USING btree ("created_by_application_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_lines_purchase_item_uidx" ON "purchase_lines" USING btree ("purchase_id","item_id");--> statement-breakpoint
CREATE INDEX "purchase_lines_purchase_id_idx" ON "purchase_lines" USING btree ("purchase_id");--> statement-breakpoint
CREATE INDEX "purchase_lines_item_id_idx" ON "purchase_lines" USING btree ("item_id");
