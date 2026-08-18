CREATE TYPE "public"."item_request_action" AS ENUM('SUBMIT', 'RESUBMIT', 'RECOMMEND', 'FORWARD', 'APPROVE', 'RETURN', 'REJECT', 'CANCEL');--> statement-breakpoint
CREATE TYPE "public"."item_request_status" AS ENUM('DRAFT', 'PENDING_BRANCH_CHECKER', 'RETURNED_TO_BRANCH_MAKER', 'PENDING_CORPORATE_MAKER', 'PENDING_CORPORATE_CHECKER', 'RETURNED_TO_CORPORATE_MAKER', 'APPROVED', 'REJECTED', 'CANCELLED');--> statement-breakpoint
CREATE TABLE "item_request_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_request_id" uuid NOT NULL,
	"action" "item_request_action" NOT NULL,
	"from_status" "item_request_status" NOT NULL,
	"to_status" "item_request_status" NOT NULL,
	"actor_application_user_id" uuid NOT NULL,
	"remarks" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "item_request_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_request_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"requested_quantity" numeric(18, 4) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "item_request_lines_requested_quantity_positive" CHECK ("item_request_lines"."requested_quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "item_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_number" varchar(40) NOT NULL,
	"requesting_store_id" uuid NOT NULL,
	"corporate_store_id" uuid,
	"created_by_application_user_id" uuid NOT NULL,
	"branch_checker_application_user_id" uuid,
	"corporate_maker_application_user_id" uuid,
	"corporate_checker_application_user_id" uuid,
	"status" "item_request_status" DEFAULT 'DRAFT' NOT NULL,
	"remarks" varchar(500),
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submitted_at" timestamp with time zone,
	"recommended_at" timestamp with time zone,
	"forwarded_at" timestamp with time zone,
	"approved_at" timestamp with time zone,
	"rejected_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	CONSTRAINT "item_requests_version_positive" CHECK ("item_requests"."version" >= 1)
);
--> statement-breakpoint
ALTER TABLE "item_request_actions" ADD CONSTRAINT "item_request_actions_item_request_id_fk" FOREIGN KEY ("item_request_id") REFERENCES "public"."item_requests"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "item_request_actions" ADD CONSTRAINT "item_request_actions_actor_application_user_id_fk" FOREIGN KEY ("actor_application_user_id") REFERENCES "public"."application_users"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "item_request_lines" ADD CONSTRAINT "item_request_lines_item_request_id_fk" FOREIGN KEY ("item_request_id") REFERENCES "public"."item_requests"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "item_request_lines" ADD CONSTRAINT "item_request_lines_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "item_requests" ADD CONSTRAINT "item_requests_requesting_store_id_fk" FOREIGN KEY ("requesting_store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "item_requests" ADD CONSTRAINT "item_requests_corporate_store_id_fk" FOREIGN KEY ("corporate_store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "item_requests" ADD CONSTRAINT "item_requests_created_by_application_user_id_fk" FOREIGN KEY ("created_by_application_user_id") REFERENCES "public"."application_users"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "item_requests" ADD CONSTRAINT "item_requests_branch_checker_application_user_id_fk" FOREIGN KEY ("branch_checker_application_user_id") REFERENCES "public"."application_users"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "item_requests" ADD CONSTRAINT "item_requests_corporate_maker_application_user_id_fk" FOREIGN KEY ("corporate_maker_application_user_id") REFERENCES "public"."application_users"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "item_requests" ADD CONSTRAINT "item_requests_corporate_checker_application_user_id_fk" FOREIGN KEY ("corporate_checker_application_user_id") REFERENCES "public"."application_users"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE INDEX "item_request_actions_item_request_id_created_at_idx" ON "item_request_actions" USING btree ("item_request_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "item_request_lines_request_item_uidx" ON "item_request_lines" USING btree ("item_request_id","item_id");--> statement-breakpoint
CREATE INDEX "item_request_lines_item_request_id_idx" ON "item_request_lines" USING btree ("item_request_id");--> statement-breakpoint
CREATE INDEX "item_request_lines_item_id_idx" ON "item_request_lines" USING btree ("item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "item_requests_request_number_uidx" ON "item_requests" USING btree ("request_number");--> statement-breakpoint
CREATE INDEX "item_requests_status_idx" ON "item_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "item_requests_requesting_store_id_idx" ON "item_requests" USING btree ("requesting_store_id");--> statement-breakpoint
CREATE INDEX "item_requests_corporate_store_id_idx" ON "item_requests" USING btree ("corporate_store_id");--> statement-breakpoint
CREATE INDEX "item_requests_branch_checker_application_user_id_idx" ON "item_requests" USING btree ("branch_checker_application_user_id");--> statement-breakpoint
CREATE INDEX "item_requests_corporate_maker_application_user_id_idx" ON "item_requests" USING btree ("corporate_maker_application_user_id");--> statement-breakpoint
CREATE INDEX "item_requests_corporate_checker_application_user_id_idx" ON "item_requests" USING btree ("corporate_checker_application_user_id");--> statement-breakpoint
CREATE INDEX "item_requests_created_at_idx" ON "item_requests" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "item_requests_created_by_application_user_id_idx" ON "item_requests" USING btree ("created_by_application_user_id");