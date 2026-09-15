-- Store the workflow persona that performed each item-request action so
-- approval history can display the role without overwriting earlier rows.
-- Existing rows are backfilled from action + previous status.

CREATE TYPE "public"."item_request_workflow_role" AS ENUM(
  'ADMIN',
  'BRANCH_MAKER',
  'BRANCH_CHECKER',
  'CORPORATE_MAKER',
  'CORPORATE_CHECKER'
);
--> statement-breakpoint
ALTER TABLE "item_request_actions" ADD COLUMN "actor_workflow_role" "item_request_workflow_role";
--> statement-breakpoint
UPDATE "item_request_actions"
SET "actor_workflow_role" = CASE
  WHEN "action" IN ('SUBMIT', 'RESUBMIT', 'CANCEL') THEN 'BRANCH_MAKER'::"item_request_workflow_role"
  WHEN "action" = 'RECOMMEND' THEN 'BRANCH_CHECKER'::"item_request_workflow_role"
  WHEN "action" = 'FORWARD' THEN 'CORPORATE_MAKER'::"item_request_workflow_role"
  WHEN "action" IN ('APPROVE', 'REJECT') THEN 'CORPORATE_CHECKER'::"item_request_workflow_role"
  WHEN "action" = 'RETURN' AND "from_status" = 'PENDING_BRANCH_CHECKER' THEN 'BRANCH_CHECKER'::"item_request_workflow_role"
  WHEN "action" = 'RETURN' AND "from_status" IN ('PENDING_CORPORATE_MAKER', 'RETURNED_TO_CORPORATE_MAKER') THEN 'CORPORATE_MAKER'::"item_request_workflow_role"
  WHEN "action" = 'RETURN' THEN 'CORPORATE_CHECKER'::"item_request_workflow_role"
  ELSE 'BRANCH_MAKER'::"item_request_workflow_role"
END
WHERE "actor_workflow_role" IS NULL;
--> statement-breakpoint
ALTER TABLE "item_request_actions" ALTER COLUMN "actor_workflow_role" SET NOT NULL;
--> statement-breakpoint
COMMENT ON COLUMN "item_request_actions"."actor_workflow_role" IS
  'Workflow persona of the actor at the time of the action. Append-only; never overwritten.';
