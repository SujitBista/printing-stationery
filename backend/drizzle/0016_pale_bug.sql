CREATE TABLE "employee_transfers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"from_branch_id" uuid NOT NULL,
	"to_branch_id" uuid NOT NULL,
	"effective_date" date NOT NULL,
	"reason" varchar(500) NOT NULL,
	"transferred_by_application_user_id" uuid NOT NULL,
	"from_store_id" uuid,
	"to_store_id" uuid,
	"from_supervisor_application_user_id" uuid,
	"to_supervisor_application_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "employee_transfers_from_ne_to_branch" CHECK ("employee_transfers"."from_branch_id" <> "employee_transfers"."to_branch_id")
);
--> statement-breakpoint
ALTER TABLE "employee_transfers" ADD CONSTRAINT "employee_transfers_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "employee_transfers" ADD CONSTRAINT "employee_transfers_from_branch_id_fk" FOREIGN KEY ("from_branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "employee_transfers" ADD CONSTRAINT "employee_transfers_to_branch_id_fk" FOREIGN KEY ("to_branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "employee_transfers" ADD CONSTRAINT "employee_transfers_transferred_by_fk" FOREIGN KEY ("transferred_by_application_user_id") REFERENCES "public"."application_users"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "employee_transfers" ADD CONSTRAINT "employee_transfers_from_store_id_fk" FOREIGN KEY ("from_store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "employee_transfers" ADD CONSTRAINT "employee_transfers_to_store_id_fk" FOREIGN KEY ("to_store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "employee_transfers" ADD CONSTRAINT "employee_transfers_from_supervisor_fk" FOREIGN KEY ("from_supervisor_application_user_id") REFERENCES "public"."application_users"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "employee_transfers" ADD CONSTRAINT "employee_transfers_to_supervisor_fk" FOREIGN KEY ("to_supervisor_application_user_id") REFERENCES "public"."application_users"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE INDEX "employee_transfers_employee_id_idx" ON "employee_transfers" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "employee_transfers_from_branch_id_idx" ON "employee_transfers" USING btree ("from_branch_id");--> statement-breakpoint
CREATE INDEX "employee_transfers_to_branch_id_idx" ON "employee_transfers" USING btree ("to_branch_id");--> statement-breakpoint
CREATE INDEX "employee_transfers_effective_date_idx" ON "employee_transfers" USING btree ("effective_date");--> statement-breakpoint
CREATE INDEX "employee_transfers_transferred_by_idx" ON "employee_transfers" USING btree ("transferred_by_application_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "employee_transfers_employee_from_to_effective_uidx" ON "employee_transfers" USING btree ("employee_id","from_branch_id","to_branch_id","effective_date");