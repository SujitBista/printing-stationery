-- Requested By is the employee on whose behalf the item request is made.
-- Created By remains created_by_application_user_id (authenticated user).
-- Existing rows are backfilled from the creator's linked employee when present.

ALTER TABLE "item_requests" ADD COLUMN "requested_by_employee_id" uuid;
--> statement-breakpoint
UPDATE "item_requests" AS ir
SET "requested_by_employee_id" = au."employee_id"
FROM "application_users" AS au
WHERE au."id" = ir."created_by_application_user_id"
  AND au."employee_id" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "item_requests" ADD CONSTRAINT "item_requests_requested_by_employee_id_fk"
  FOREIGN KEY ("requested_by_employee_id") REFERENCES "employees"("id")
  ON DELETE restrict ON UPDATE restrict;
--> statement-breakpoint
CREATE INDEX "item_requests_requested_by_employee_id_idx"
  ON "item_requests" ("requested_by_employee_id");
--> statement-breakpoint
COMMENT ON COLUMN "item_requests"."requested_by_employee_id" IS
  'Employee on whose behalf the request is made (Requested By). Distinct from created_by_application_user_id.';
--> statement-breakpoint
COMMENT ON COLUMN "item_requests"."created_by_application_user_id" IS
  'Authenticated application user who created the request (Created By). Never accepted from the client.';
