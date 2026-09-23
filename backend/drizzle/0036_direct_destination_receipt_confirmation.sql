-- Direct destination receipt confirmation.
-- Record which destination-store role confirmed historical receipts.
-- Open receipts (DRAFT, PENDING_VERIFICATION, RETURNED) stay unposted:
-- this migration does not insert stock ledger rows, FIFO layers, or notifications.

ALTER TABLE "item_issue_receipts"
  ADD COLUMN IF NOT EXISTS "confirmed_workflow_role" "item_request_workflow_role";

UPDATE "item_issue_receipts" AS "receipt"
SET "confirmed_workflow_role" = "latest_action"."actor_workflow_role"
FROM (
  SELECT DISTINCT ON ("receipt_id")
    "receipt_id",
    "actor_workflow_role"
  FROM "item_issue_receipt_actions"
  WHERE "action" IN ('CONFIRM', 'COMPLETE_WITH_DISCREPANCY')
  ORDER BY "receipt_id", "created_at" DESC
) AS "latest_action"
WHERE "receipt"."id" = "latest_action"."receipt_id"
  AND "receipt"."status" = 'CONFIRMED'
  AND "receipt"."confirmed_workflow_role" IS NULL;
