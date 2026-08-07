CREATE TABLE "stores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_code" varchar(30) NOT NULL,
	"store_name" varchar(150) NOT NULL,
	"branch_id" uuid NOT NULL,
	"under_store_id" uuid,
	"allow_transfer" boolean DEFAULT false NOT NULL,
	"allow_department_issue" boolean DEFAULT false NOT NULL,
	"remarks" varchar(500),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "stores" ADD CONSTRAINT "stores_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "stores" ADD CONSTRAINT "stores_under_store_id_stores_id_fk" FOREIGN KEY ("under_store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE UNIQUE INDEX "stores_store_code_lower_uidx" ON "stores" USING btree (lower("store_code"));--> statement-breakpoint
CREATE UNIQUE INDEX "stores_branch_store_name_lower_uidx" ON "stores" USING btree ("branch_id",lower("store_name"));--> statement-breakpoint
CREATE INDEX "stores_branch_id_idx" ON "stores" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "stores_under_store_id_idx" ON "stores" USING btree ("under_store_id");--> statement-breakpoint
CREATE INDEX "stores_is_active_idx" ON "stores" USING btree ("is_active");