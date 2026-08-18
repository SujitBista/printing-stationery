CREATE TYPE "public"."item_issue_status" AS ENUM('DRAFT', 'SUBMITTED');--> statement-breakpoint
CREATE TABLE "item_issue_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_issue_id" uuid NOT NULL,
	"request_line_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"issue_quantity" numeric(18, 4) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "item_issue_lines_issue_quantity_positive" CHECK ("item_issue_lines"."issue_quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "item_issues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"issue_number" varchar(40) NOT NULL,
	"request_id" uuid NOT NULL,
	"from_store_id" uuid NOT NULL,
	"to_store_id" uuid NOT NULL,
	"status" "item_issue_status" DEFAULT 'DRAFT' NOT NULL,
	"remarks" varchar(500),
	"created_by_application_user_id" uuid NOT NULL,
	"submitted_by_application_user_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submitted_at" timestamp with time zone,
	CONSTRAINT "item_issues_version_positive" CHECK ("item_issues"."version" >= 1)
);
--> statement-breakpoint
ALTER TABLE "item_issue_lines" ADD CONSTRAINT "item_issue_lines_item_issue_id_fk" FOREIGN KEY ("item_issue_id") REFERENCES "public"."item_issues"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "item_issue_lines" ADD CONSTRAINT "item_issue_lines_request_line_id_fk" FOREIGN KEY ("request_line_id") REFERENCES "public"."item_request_lines"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "item_issue_lines" ADD CONSTRAINT "item_issue_lines_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "item_issues" ADD CONSTRAINT "item_issues_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."item_requests"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "item_issues" ADD CONSTRAINT "item_issues_from_store_id_fk" FOREIGN KEY ("from_store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "item_issues" ADD CONSTRAINT "item_issues_to_store_id_fk" FOREIGN KEY ("to_store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "item_issues" ADD CONSTRAINT "item_issues_created_by_application_user_id_fk" FOREIGN KEY ("created_by_application_user_id") REFERENCES "public"."application_users"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "item_issues" ADD CONSTRAINT "item_issues_submitted_by_application_user_id_fk" FOREIGN KEY ("submitted_by_application_user_id") REFERENCES "public"."application_users"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE UNIQUE INDEX "item_issue_lines_issue_request_line_uidx" ON "item_issue_lines" USING btree ("item_issue_id","request_line_id");--> statement-breakpoint
CREATE INDEX "item_issue_lines_item_issue_id_idx" ON "item_issue_lines" USING btree ("item_issue_id");--> statement-breakpoint
CREATE INDEX "item_issue_lines_request_line_id_idx" ON "item_issue_lines" USING btree ("request_line_id");--> statement-breakpoint
CREATE INDEX "item_issue_lines_item_id_idx" ON "item_issue_lines" USING btree ("item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "item_issues_issue_number_uidx" ON "item_issues" USING btree ("issue_number");--> statement-breakpoint
CREATE INDEX "item_issues_request_id_idx" ON "item_issues" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "item_issues_status_idx" ON "item_issues" USING btree ("status");--> statement-breakpoint
CREATE INDEX "item_issues_from_store_id_idx" ON "item_issues" USING btree ("from_store_id");--> statement-breakpoint
CREATE INDEX "item_issues_to_store_id_idx" ON "item_issues" USING btree ("to_store_id");--> statement-breakpoint
CREATE INDEX "item_issues_created_by_application_user_id_idx" ON "item_issues" USING btree ("created_by_application_user_id");--> statement-breakpoint
CREATE INDEX "item_issues_submitted_by_application_user_id_idx" ON "item_issues" USING btree ("submitted_by_application_user_id");--> statement-breakpoint
CREATE INDEX "item_issues_created_at_idx" ON "item_issues" USING btree ("created_at");