-- Corporate Maker creates item issues after final request approval.
-- Corporate Checker verifies and posts; stock is deducted only on post.
-- Existing SUBMITTED issues already have ledger rows, so they map to POSTED.
-- Enum types are recreated instead of ADD VALUE + immediate use, because
-- PostgreSQL and drizzle-kit apply pending migrations in one transaction.

ALTER TABLE "item_issues" ADD COLUMN IF NOT EXISTS "verified_by_application_user_id" uuid;
--> statement-breakpoint
ALTER TABLE "item_issues" ADD COLUMN IF NOT EXISTS "issue_date" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "item_issues" ADD COLUMN IF NOT EXISTS "verified_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "item_issues" ADD COLUMN IF NOT EXISTS "returned_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "item_issues" ADD COLUMN IF NOT EXISTS "rejected_at" timestamp with time zone;
--> statement-breakpoint
UPDATE "item_issues"
SET "issue_date" = "created_at"
WHERE "issue_date" IS NULL;
--> statement-breakpoint
ALTER TABLE "item_issues" ALTER COLUMN "issue_date" SET DEFAULT now();
--> statement-breakpoint
ALTER TABLE "item_issues" ALTER COLUMN "issue_date" SET NOT NULL;
--> statement-breakpoint
CREATE TYPE "public"."item_issue_status_new" AS ENUM(
  'DRAFT',
  'PENDING_VERIFICATION',
  'RETURNED',
  'REJECTED',
  'POSTED'
);
--> statement-breakpoint
ALTER TABLE "item_issues" ALTER COLUMN "status" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "item_issues"
  ALTER COLUMN "status" TYPE "public"."item_issue_status_new"
  USING (
    CASE "status"::text
      WHEN 'SUBMITTED' THEN 'POSTED'
      ELSE "status"::text
    END
  )::"public"."item_issue_status_new";
--> statement-breakpoint
DROP TYPE "public"."item_issue_status";
--> statement-breakpoint
ALTER TYPE "public"."item_issue_status_new" RENAME TO "item_issue_status";
--> statement-breakpoint
ALTER TABLE "item_issues" ALTER COLUMN "status" SET DEFAULT 'DRAFT';
--> statement-breakpoint
UPDATE "item_issues"
SET
  "verified_by_application_user_id" = coalesce(
    "verified_by_application_user_id",
    "submitted_by_application_user_id"
  ),
  "verified_at" = coalesce("verified_at", "submitted_at", "updated_at")
WHERE "status" = 'POSTED'
  AND "verified_at" IS NULL;
--> statement-breakpoint
CREATE TYPE "public"."item_request_status_new" AS ENUM(
  'DRAFT',
  'PENDING_BRANCH_CHECKER',
  'RETURNED_TO_BRANCH_MAKER',
  'PENDING_CORPORATE_MAKER',
  'PENDING_CORPORATE_CHECKER',
  'RETURNED_TO_CORPORATE_MAKER',
  'APPROVED',
  'PARTIALLY_ISSUED',
  'ISSUED',
  'REJECTED',
  'CANCELLED'
);
--> statement-breakpoint
ALTER TABLE "item_requests" ALTER COLUMN "status" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "item_requests"
  ALTER COLUMN "status" TYPE "public"."item_request_status_new"
  USING "status"::text::"public"."item_request_status_new";
--> statement-breakpoint
ALTER TABLE "item_request_actions"
  ALTER COLUMN "from_status" TYPE "public"."item_request_status_new"
  USING "from_status"::text::"public"."item_request_status_new";
--> statement-breakpoint
ALTER TABLE "item_request_actions"
  ALTER COLUMN "to_status" TYPE "public"."item_request_status_new"
  USING "to_status"::text::"public"."item_request_status_new";
--> statement-breakpoint
DROP TYPE "public"."item_request_status";
--> statement-breakpoint
ALTER TYPE "public"."item_request_status_new" RENAME TO "item_request_status";
--> statement-breakpoint
ALTER TABLE "item_requests" ALTER COLUMN "status" SET DEFAULT 'DRAFT';
--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'ITEM_ISSUE_SUBMITTED';
--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'ITEM_ISSUE_RETURNED';
--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'ITEM_ISSUE_REJECTED';
--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'ITEM_ISSUE_POSTED';
--> statement-breakpoint
ALTER TYPE "public"."notification_entity_type" ADD VALUE IF NOT EXISTS 'ITEM_ISSUE';
--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "issue_number" varchar(40);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'item_issues_verified_by_application_user_id_fk'
  ) THEN
    ALTER TABLE "item_issues"
      ADD CONSTRAINT "item_issues_verified_by_application_user_id_fk"
      FOREIGN KEY ("verified_by_application_user_id")
      REFERENCES "public"."application_users"("id")
      ON DELETE restrict
      ON UPDATE restrict;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "item_issues_verified_by_application_user_id_idx"
  ON "item_issues" USING btree ("verified_by_application_user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "item_issues_one_open_per_request_uidx"
  ON "item_issues" ("request_id")
  WHERE "status" IN ('DRAFT', 'PENDING_VERIFICATION', 'RETURNED');
--> statement-breakpoint
CREATE TYPE "public"."item_issue_action" AS ENUM(
  'CREATE',
  'UPDATE',
  'SUBMIT',
  'RETURN',
  'REJECT',
  'VERIFY_POST'
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "item_issue_actions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "item_issue_id" uuid NOT NULL,
  "action" "item_issue_action" NOT NULL,
  "from_status" "item_issue_status",
  "to_status" "item_issue_status" NOT NULL,
  "actor_application_user_id" uuid NOT NULL,
  "actor_workflow_role" "item_request_workflow_role" NOT NULL,
  "remarks" varchar(500),
  "stock_ledger_reference_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'item_issue_actions_item_issue_id_fk'
  ) THEN
    ALTER TABLE "item_issue_actions"
      ADD CONSTRAINT "item_issue_actions_item_issue_id_fk"
      FOREIGN KEY ("item_issue_id")
      REFERENCES "public"."item_issues"("id")
      ON DELETE restrict
      ON UPDATE restrict;
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'item_issue_actions_actor_application_user_id_fk'
  ) THEN
    ALTER TABLE "item_issue_actions"
      ADD CONSTRAINT "item_issue_actions_actor_application_user_id_fk"
      FOREIGN KEY ("actor_application_user_id")
      REFERENCES "public"."application_users"("id")
      ON DELETE restrict
      ON UPDATE restrict;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "item_issue_actions_item_issue_id_created_at_idx"
  ON "item_issue_actions" USING btree ("item_issue_id", "created_at");
--> statement-breakpoint
INSERT INTO "item_issue_actions" (
  "item_issue_id",
  "action",
  "from_status",
  "to_status",
  "actor_application_user_id",
  "actor_workflow_role",
  "remarks",
  "created_at"
)
SELECT
  "id",
  'CREATE',
  NULL,
  'DRAFT',
  "created_by_application_user_id",
  'CORPORATE_MAKER',
  NULL,
  "created_at"
FROM "item_issues"
WHERE NOT EXISTS (
  SELECT 1
  FROM "item_issue_actions"
  WHERE "item_issue_actions"."item_issue_id" = "item_issues"."id"
    AND "item_issue_actions"."action" = 'CREATE'
);
--> statement-breakpoint
INSERT INTO "item_issue_actions" (
  "item_issue_id",
  "action",
  "from_status",
  "to_status",
  "actor_application_user_id",
  "actor_workflow_role",
  "remarks",
  "created_at"
)
SELECT
  "id",
  'VERIFY_POST',
  'PENDING_VERIFICATION',
  'POSTED',
  coalesce(
    "verified_by_application_user_id",
    "submitted_by_application_user_id",
    "created_by_application_user_id"
  ),
  'CORPORATE_CHECKER',
  NULL,
  coalesce("verified_at", "submitted_at", "updated_at")
FROM "item_issues"
WHERE "status" = 'POSTED'
  AND NOT EXISTS (
    SELECT 1
    FROM "item_issue_actions"
    WHERE "item_issue_actions"."item_issue_id" = "item_issues"."id"
      AND "item_issue_actions"."action" = 'VERIFY_POST'
  );
--> statement-breakpoint
WITH posted AS (
  SELECT
    "item_issues"."request_id",
    "item_issue_lines"."request_line_id",
    sum("item_issue_lines"."issue_quantity") AS issued_quantity
  FROM "item_issue_lines"
  INNER JOIN "item_issues"
    ON "item_issues"."id" = "item_issue_lines"."item_issue_id"
  WHERE "item_issues"."status" = 'POSTED'
  GROUP BY "item_issues"."request_id", "item_issue_lines"."request_line_id"
),
totals AS (
  SELECT
    "item_request_lines"."item_request_id" AS request_id,
    sum("item_request_lines"."requested_quantity") AS requested_quantity,
    coalesce(sum("posted"."issued_quantity"), 0) AS issued_quantity
  FROM "item_request_lines"
  LEFT JOIN posted
    ON posted."request_line_id" = "item_request_lines"."id"
  GROUP BY "item_request_lines"."item_request_id"
)
UPDATE "item_requests"
SET "status" = CASE
  WHEN totals.issued_quantity <= 0 THEN "item_requests"."status"
  WHEN totals.issued_quantity >= totals.requested_quantity THEN 'ISSUED'
  ELSE 'PARTIALLY_ISSUED'
END
FROM totals
WHERE "item_requests"."id" = totals.request_id
  AND "item_requests"."status" = 'APPROVED'
  AND totals.issued_quantity > 0;
--> statement-breakpoint
COMMENT ON TABLE "item_issue_actions" IS
  'Append-only item-issue workflow history. Earlier rows are never overwritten.';
--> statement-breakpoint
COMMENT ON COLUMN "item_issues"."status" IS
  'DRAFT/PENDING_VERIFICATION/RETURNED do not change stock. POSTED deducts Corporate Store stock once.';
