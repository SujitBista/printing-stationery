CREATE TABLE "employees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_code" varchar(30) NOT NULL,
	"employee_name" varchar(150) NOT NULL,
	"branch_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE UNIQUE INDEX "employees_employee_code_lower_uidx" ON "employees" USING btree (lower("employee_code"));--> statement-breakpoint
CREATE INDEX "employees_branch_id_idx" ON "employees" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "employees_is_active_idx" ON "employees" USING btree ("is_active");