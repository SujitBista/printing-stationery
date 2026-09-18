-- Dispatch creates in-transit stock. Branch stock increases only on confirmed receipt.
-- Existing POSTED store-to-store issues are treated as dispatched / in transit.
-- Corporate Store stock is not deducted again. Branch Store stock is not increased.

CREATE TYPE "public"."item_issue_destination_type" AS ENUM(
  'BRANCH_STORE',
  'CORPORATE_DEPARTMENT'
);
--> statement-breakpoint
CREATE TYPE "public"."item_issue_delivery_status" AS ENUM(
  'IN_TRANSIT',
  'PARTIALLY_RECEIVED',
  'RECEIVED',
  'RECEIVED_WITH_DISCREPANCY'
);
--> statement-breakpoint
CREATE TYPE "public"."item_issue_receipt_status" AS ENUM(
  'DRAFT',
  'PENDING_VERIFICATION',
  'RETURNED',
  'CONFIRMED',
  'REJECTED'
);
--> statement-breakpoint
CREATE TYPE "public"."item_issue_receipt_action" AS ENUM(
  'CREATE',
  'SUBMIT',
  'RETURN',
  'CONFIRM',
  'COMPLETE_WITH_DISCREPANCY'
);
--> statement-breakpoint
CREATE TYPE "public"."item_issue_discrepancy_reason" AS ENUM(
  'MISSING',
  'DAMAGED',
  'WRONG_ITEM',
  'EXCESS',
  'OTHER'
);
--> statement-breakpoint
CREATE TYPE "public"."item_issue_discrepancy_resolution" AS ENUM(
  'KEEP_IN_TRANSIT',
  'COMPLETE_WITH_DISCREPANCY'
);
--> statement-breakpoint
CREATE TYPE "public"."item_issue_discrepancy_status" AS ENUM(
  'OPEN',
  'RESOLVED'
);
--> statement-breakpoint
CREATE TYPE "public"."stock_ledger_category" AS ENUM(
  'AVAILABLE',
  'IN_TRANSIT',
  'DISCREPANCY',
  'DAMAGED'
);
--> statement-breakpoint
CREATE TYPE "public"."item_issue_action_new" AS ENUM(
  'CREATE',
  'UPDATE',
  'SUBMIT',
  'RETURN',
  'REJECT',
  'VERIFY_POST',
  'DISPATCH',
  'ISSUE_TO_DEPARTMENT'
);
--> statement-breakpoint
ALTER TABLE "item_issue_actions"
  ALTER COLUMN "action" TYPE "public"."item_issue_action_new"
  USING "action"::text::"public"."item_issue_action_new";
--> statement-breakpoint
DROP TYPE "public"."item_issue_action";
--> statement-breakpoint
ALTER TYPE "public"."item_issue_action_new" RENAME TO "item_issue_action";
--> statement-breakpoint
CREATE TYPE "public"."stock_ledger_movement_type_new" AS ENUM(
  'OPENING_STOCK',
  'PURCHASE',
  'ITEM_ISSUE',
  'ITEM_ISSUE_IN_TRANSIT',
  'ITEM_ISSUE_RECEIPT',
  'ITEM_ISSUE_DISCREPANCY',
  'DEPARTMENT_CONSUMPTION'
);
--> statement-breakpoint
ALTER TABLE "stock_ledger"
  ALTER COLUMN "movement_type" TYPE "public"."stock_ledger_movement_type_new"
  USING "movement_type"::text::"public"."stock_ledger_movement_type_new";
--> statement-breakpoint
DROP TYPE "public"."stock_ledger_movement_type";
--> statement-breakpoint
ALTER TYPE "public"."stock_ledger_movement_type_new" RENAME TO "stock_ledger_movement_type";
--> statement-breakpoint
CREATE TYPE "public"."stock_ledger_reference_type_new" AS ENUM(
  'OPENING_STOCK',
  'PURCHASE',
  'ITEM_ISSUE',
  'ITEM_ISSUE_IN_TRANSIT',
  'ITEM_ISSUE_RECEIPT',
  'ITEM_ISSUE_DISCREPANCY',
  'DEPARTMENT_CONSUMPTION'
);
--> statement-breakpoint
ALTER TABLE "stock_ledger"
  ALTER COLUMN "reference_type" TYPE "public"."stock_ledger_reference_type_new"
  USING "reference_type"::text::"public"."stock_ledger_reference_type_new";
--> statement-breakpoint
DROP TYPE "public"."stock_ledger_reference_type";
--> statement-breakpoint
ALTER TYPE "public"."stock_ledger_reference_type_new" RENAME TO "stock_ledger_reference_type";
--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'ITEM_ISSUE_DISPATCHED';
--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'ITEM_ISSUE_RECEIPT_RECORDED';
--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'ITEM_ISSUE_RECEIPT_RETURNED';
--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'ITEM_ISSUE_RECEIPT_CONFIRMED';
--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'ITEM_ISSUE_DISCREPANCY_REPORTED';
--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'ITEM_ISSUE_DEPARTMENT_ISSUED';
--> statement-breakpoint
ALTER TABLE "item_issues" ADD COLUMN IF NOT EXISTS "destination_type" "item_issue_destination_type";
--> statement-breakpoint
ALTER TABLE "item_issues" ADD COLUMN IF NOT EXISTS "delivery_status" "item_issue_delivery_status";
--> statement-breakpoint
ALTER TABLE "item_issues" ADD COLUMN IF NOT EXISTS "department_id" uuid;
--> statement-breakpoint
ALTER TABLE "item_issues" ADD COLUMN IF NOT EXISTS "consumed_by_employee_id" uuid;
--> statement-breakpoint
ALTER TABLE "item_issues" ADD COLUMN IF NOT EXISTS "consumption_description" varchar(500);
--> statement-breakpoint
ALTER TABLE "item_issues" ADD COLUMN IF NOT EXISTS "needs_admin_review" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
UPDATE "item_issues"
SET "destination_type" = 'BRANCH_STORE'
WHERE "destination_type" IS NULL;
--> statement-breakpoint
UPDATE "item_issues"
SET "delivery_status" = 'IN_TRANSIT'
WHERE "status" = 'POSTED'
  AND "destination_type" = 'BRANCH_STORE'
  AND "delivery_status" IS NULL;
--> statement-breakpoint
UPDATE "item_issues"
SET "needs_admin_review" = true
WHERE "from_store_id" = "to_store_id"
   OR "to_store_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "item_issues" ALTER COLUMN "destination_type" SET DEFAULT 'BRANCH_STORE';
--> statement-breakpoint
ALTER TABLE "item_issues" ALTER COLUMN "destination_type" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "item_issues" ALTER COLUMN "request_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "item_issues" ALTER COLUMN "to_store_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "item_issue_lines" ALTER COLUMN "request_line_id" DROP NOT NULL;
--> statement-breakpoint
DROP INDEX IF EXISTS "item_issues_one_open_per_request_uidx";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "item_issues_one_open_per_request_uidx"
  ON "item_issues" ("request_id")
  WHERE "status" IN ('DRAFT', 'PENDING_VERIFICATION', 'RETURNED')
    AND "request_id" IS NOT NULL;
--> statement-breakpoint
DROP INDEX IF EXISTS "item_issue_lines_issue_request_line_uidx";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "item_issue_lines_issue_request_line_uidx"
  ON "item_issue_lines" ("item_issue_id", "request_line_id")
  WHERE "request_line_id" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "item_issue_lines_issue_item_uidx"
  ON "item_issue_lines" ("item_issue_id", "item_id")
  WHERE "request_line_id" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "item_issues_destination_type_idx"
  ON "item_issues" USING btree ("destination_type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "item_issues_delivery_status_idx"
  ON "item_issues" USING btree ("delivery_status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "item_issues_department_id_idx"
  ON "item_issues" USING btree ("department_id");
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'item_issues_department_id_fk'
  ) THEN
    ALTER TABLE "item_issues"
      ADD CONSTRAINT "item_issues_department_id_fk"
      FOREIGN KEY ("department_id")
      REFERENCES "public"."departments"("id")
      ON DELETE restrict
      ON UPDATE restrict;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'item_issues_consumed_by_employee_id_fk'
  ) THEN
    ALTER TABLE "item_issues"
      ADD CONSTRAINT "item_issues_consumed_by_employee_id_fk"
      FOREIGN KEY ("consumed_by_employee_id")
      REFERENCES "public"."employees"("id")
      ON DELETE restrict
      ON UPDATE restrict;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'item_issues_destination_shape'
  ) THEN
    ALTER TABLE "item_issues"
      ADD CONSTRAINT "item_issues_destination_shape"
      CHECK (
        (
          "destination_type" = 'BRANCH_STORE'
          AND "to_store_id" IS NOT NULL
          AND "department_id" IS NULL
          AND "from_store_id" <> "to_store_id"
        ) OR (
          "destination_type" = 'CORPORATE_DEPARTMENT'
          AND "department_id" IS NOT NULL
          AND "to_store_id" IS NULL
        )
      ) NOT VALID;
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "stock_ledger" ADD COLUMN IF NOT EXISTS "stock_category" "stock_ledger_category";
--> statement-breakpoint
ALTER TABLE "stock_ledger" ADD COLUMN IF NOT EXISTS "source_key" varchar(180);
--> statement-breakpoint
UPDATE "stock_ledger"
SET "stock_category" = 'AVAILABLE'
WHERE "stock_category" IS NULL;
--> statement-breakpoint
UPDATE "stock_ledger"
SET "source_key" = concat_ws(
  ':',
  "reference_type"::text,
  "reference_line_id"::text,
  "store_id"::text,
  "movement_type"::text,
  coalesce("stock_category"::text, 'AVAILABLE'),
  "rate"::text
)
WHERE "source_key" IS NULL;
--> statement-breakpoint
ALTER TABLE "stock_ledger" ALTER COLUMN "stock_category" SET DEFAULT 'AVAILABLE';
--> statement-breakpoint
ALTER TABLE "stock_ledger" ALTER COLUMN "stock_category" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "stock_ledger" ALTER COLUMN "source_key" SET NOT NULL;
--> statement-breakpoint
DROP INDEX IF EXISTS "stock_ledger_reference_line_uidx";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "stock_ledger_source_key_uidx"
  ON "stock_ledger" USING btree ("source_key");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "item_issue_shipments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "item_issue_id" uuid NOT NULL,
  "request_id" uuid,
  "from_store_id" uuid NOT NULL,
  "to_store_id" uuid NOT NULL,
  "delivery_status" "item_issue_delivery_status" DEFAULT 'IN_TRANSIT' NOT NULL,
  "dispatched_at" timestamp with time zone NOT NULL,
  "dispatched_by_application_user_id" uuid NOT NULL,
  "received_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "item_issue_shipment_lines" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "shipment_id" uuid NOT NULL,
  "item_issue_line_id" uuid NOT NULL,
  "item_id" uuid NOT NULL,
  "unit_id" uuid NOT NULL,
  "dispatched_quantity" numeric(18, 4) NOT NULL,
  "confirmed_received_quantity" numeric(18, 4) DEFAULT '0' NOT NULL,
  "remaining_in_transit_quantity" numeric(18, 4) NOT NULL,
  "discrepancy_quantity" numeric(18, 4) DEFAULT '0' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "item_issue_receipts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "shipment_id" uuid NOT NULL,
  "status" "item_issue_receipt_status" DEFAULT 'DRAFT' NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "receipt_date" timestamp with time zone NOT NULL,
  "remarks" varchar(500),
  "discrepancy_resolution" "item_issue_discrepancy_resolution",
  "created_by_application_user_id" uuid NOT NULL,
  "submitted_by_application_user_id" uuid,
  "verified_by_application_user_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "submitted_at" timestamp with time zone,
  "verified_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "item_issue_receipt_lines" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "receipt_id" uuid NOT NULL,
  "shipment_line_id" uuid NOT NULL,
  "received_quantity_now" numeric(18, 4) NOT NULL,
  "missing_quantity" numeric(18, 4) DEFAULT '0' NOT NULL,
  "damaged_quantity" numeric(18, 4) DEFAULT '0' NOT NULL,
  "excess_quantity" numeric(18, 4) DEFAULT '0' NOT NULL,
  "discrepancy_reason" "item_issue_discrepancy_reason",
  "remarks" varchar(500),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "item_issue_receipt_actions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "receipt_id" uuid NOT NULL,
  "action" "item_issue_receipt_action" NOT NULL,
  "from_status" "item_issue_receipt_status",
  "to_status" "item_issue_receipt_status" NOT NULL,
  "actor_application_user_id" uuid NOT NULL,
  "actor_workflow_role" "item_request_workflow_role" NOT NULL,
  "remarks" varchar(500),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "item_issue_discrepancies" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "shipment_line_id" uuid NOT NULL,
  "receipt_id" uuid NOT NULL,
  "item_issue_id" uuid NOT NULL,
  "quantity" numeric(18, 4) NOT NULL,
  "reason" "item_issue_discrepancy_reason" NOT NULL,
  "status" "item_issue_discrepancy_status" DEFAULT 'OPEN' NOT NULL,
  "remarks" varchar(500),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "department_consumptions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "item_issue_id" uuid NOT NULL,
  "department_id" uuid NOT NULL,
  "consumption_description" varchar(500) NOT NULL,
  "consumed_by_employee_id" uuid,
  "issue_date" timestamp with time zone NOT NULL,
  "created_by_application_user_id" uuid NOT NULL,
  "verified_by_application_user_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "department_consumption_lines" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "department_consumption_id" uuid NOT NULL,
  "item_issue_line_id" uuid NOT NULL,
  "item_id" uuid NOT NULL,
  "unit_id" uuid NOT NULL,
  "quantity" numeric(18, 4) NOT NULL,
  "unit_cost" numeric(18, 4) NOT NULL,
  "total_cost" numeric(18, 2) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'item_issue_shipments_item_issue_id_fk'
  ) THEN
    ALTER TABLE "item_issue_shipments"
      ADD CONSTRAINT "item_issue_shipments_item_issue_id_fk"
      FOREIGN KEY ("item_issue_id") REFERENCES "public"."item_issues"("id")
      ON DELETE restrict ON UPDATE restrict;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'item_issue_shipments_request_id_fk'
  ) THEN
    ALTER TABLE "item_issue_shipments"
      ADD CONSTRAINT "item_issue_shipments_request_id_fk"
      FOREIGN KEY ("request_id") REFERENCES "public"."item_requests"("id")
      ON DELETE restrict ON UPDATE restrict;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'item_issue_shipments_from_store_id_fk'
  ) THEN
    ALTER TABLE "item_issue_shipments"
      ADD CONSTRAINT "item_issue_shipments_from_store_id_fk"
      FOREIGN KEY ("from_store_id") REFERENCES "public"."stores"("id")
      ON DELETE restrict ON UPDATE restrict;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'item_issue_shipments_to_store_id_fk'
  ) THEN
    ALTER TABLE "item_issue_shipments"
      ADD CONSTRAINT "item_issue_shipments_to_store_id_fk"
      FOREIGN KEY ("to_store_id") REFERENCES "public"."stores"("id")
      ON DELETE restrict ON UPDATE restrict;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'item_issue_shipments_dispatched_by_fk'
  ) THEN
    ALTER TABLE "item_issue_shipments"
      ADD CONSTRAINT "item_issue_shipments_dispatched_by_fk"
      FOREIGN KEY ("dispatched_by_application_user_id")
      REFERENCES "public"."application_users"("id")
      ON DELETE restrict ON UPDATE restrict;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'item_issue_shipments_stores_differ'
  ) THEN
    ALTER TABLE "item_issue_shipments"
      ADD CONSTRAINT "item_issue_shipments_stores_differ"
      CHECK ("from_store_id" <> "to_store_id");
  END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "item_issue_shipments_item_issue_id_uidx"
  ON "item_issue_shipments" USING btree ("item_issue_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "item_issue_shipments_to_store_id_idx"
  ON "item_issue_shipments" USING btree ("to_store_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "item_issue_shipments_delivery_status_idx"
  ON "item_issue_shipments" USING btree ("delivery_status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "item_issue_shipments_request_id_idx"
  ON "item_issue_shipments" USING btree ("request_id");
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'item_issue_shipment_lines_shipment_id_fk'
  ) THEN
    ALTER TABLE "item_issue_shipment_lines"
      ADD CONSTRAINT "item_issue_shipment_lines_shipment_id_fk"
      FOREIGN KEY ("shipment_id") REFERENCES "public"."item_issue_shipments"("id")
      ON DELETE restrict ON UPDATE restrict;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'item_issue_shipment_lines_issue_line_id_fk'
  ) THEN
    ALTER TABLE "item_issue_shipment_lines"
      ADD CONSTRAINT "item_issue_shipment_lines_issue_line_id_fk"
      FOREIGN KEY ("item_issue_line_id") REFERENCES "public"."item_issue_lines"("id")
      ON DELETE restrict ON UPDATE restrict;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'item_issue_shipment_lines_item_id_fk'
  ) THEN
    ALTER TABLE "item_issue_shipment_lines"
      ADD CONSTRAINT "item_issue_shipment_lines_item_id_fk"
      FOREIGN KEY ("item_id") REFERENCES "public"."items"("id")
      ON DELETE restrict ON UPDATE restrict;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'item_issue_shipment_lines_unit_id_fk'
  ) THEN
    ALTER TABLE "item_issue_shipment_lines"
      ADD CONSTRAINT "item_issue_shipment_lines_unit_id_fk"
      FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id")
      ON DELETE restrict ON UPDATE restrict;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'item_issue_shipment_lines_quantities'
  ) THEN
    ALTER TABLE "item_issue_shipment_lines"
      ADD CONSTRAINT "item_issue_shipment_lines_quantities"
      CHECK (
        "dispatched_quantity" > 0
        AND "confirmed_received_quantity" >= 0
        AND "remaining_in_transit_quantity" >= 0
        AND "discrepancy_quantity" >= 0
        AND "confirmed_received_quantity" + "remaining_in_transit_quantity" + "discrepancy_quantity" = "dispatched_quantity"
      );
  END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "item_issue_shipment_lines_issue_line_uidx"
  ON "item_issue_shipment_lines" USING btree ("item_issue_line_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "item_issue_shipment_lines_shipment_item_uidx"
  ON "item_issue_shipment_lines" USING btree ("shipment_id", "item_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "item_issue_shipment_lines_shipment_id_idx"
  ON "item_issue_shipment_lines" USING btree ("shipment_id");
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'item_issue_receipts_shipment_id_fk'
  ) THEN
    ALTER TABLE "item_issue_receipts"
      ADD CONSTRAINT "item_issue_receipts_shipment_id_fk"
      FOREIGN KEY ("shipment_id") REFERENCES "public"."item_issue_shipments"("id")
      ON DELETE restrict ON UPDATE restrict;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'item_issue_receipts_created_by_fk'
  ) THEN
    ALTER TABLE "item_issue_receipts"
      ADD CONSTRAINT "item_issue_receipts_created_by_fk"
      FOREIGN KEY ("created_by_application_user_id")
      REFERENCES "public"."application_users"("id")
      ON DELETE restrict ON UPDATE restrict;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'item_issue_receipts_submitted_by_fk'
  ) THEN
    ALTER TABLE "item_issue_receipts"
      ADD CONSTRAINT "item_issue_receipts_submitted_by_fk"
      FOREIGN KEY ("submitted_by_application_user_id")
      REFERENCES "public"."application_users"("id")
      ON DELETE restrict ON UPDATE restrict;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'item_issue_receipts_verified_by_fk'
  ) THEN
    ALTER TABLE "item_issue_receipts"
      ADD CONSTRAINT "item_issue_receipts_verified_by_fk"
      FOREIGN KEY ("verified_by_application_user_id")
      REFERENCES "public"."application_users"("id")
      ON DELETE restrict ON UPDATE restrict;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'item_issue_receipts_version_positive'
  ) THEN
    ALTER TABLE "item_issue_receipts"
      ADD CONSTRAINT "item_issue_receipts_version_positive"
      CHECK ("version" >= 1);
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "item_issue_receipts_shipment_id_idx"
  ON "item_issue_receipts" USING btree ("shipment_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "item_issue_receipts_status_idx"
  ON "item_issue_receipts" USING btree ("status");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "item_issue_receipts_one_open_per_shipment_uidx"
  ON "item_issue_receipts" ("shipment_id")
  WHERE "status" IN ('DRAFT', 'PENDING_VERIFICATION', 'RETURNED');
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'item_issue_receipt_lines_receipt_id_fk'
  ) THEN
    ALTER TABLE "item_issue_receipt_lines"
      ADD CONSTRAINT "item_issue_receipt_lines_receipt_id_fk"
      FOREIGN KEY ("receipt_id") REFERENCES "public"."item_issue_receipts"("id")
      ON DELETE restrict ON UPDATE restrict;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'item_issue_receipt_lines_shipment_line_id_fk'
  ) THEN
    ALTER TABLE "item_issue_receipt_lines"
      ADD CONSTRAINT "item_issue_receipt_lines_shipment_line_id_fk"
      FOREIGN KEY ("shipment_line_id") REFERENCES "public"."item_issue_shipment_lines"("id")
      ON DELETE restrict ON UPDATE restrict;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'item_issue_receipt_lines_quantities'
  ) THEN
    ALTER TABLE "item_issue_receipt_lines"
      ADD CONSTRAINT "item_issue_receipt_lines_quantities"
      CHECK (
        "received_quantity_now" > 0
        AND "missing_quantity" >= 0
        AND "damaged_quantity" >= 0
        AND "excess_quantity" >= 0
      );
  END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "item_issue_receipt_lines_receipt_shipment_line_uidx"
  ON "item_issue_receipt_lines" USING btree ("receipt_id", "shipment_line_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "item_issue_receipt_lines_receipt_id_idx"
  ON "item_issue_receipt_lines" USING btree ("receipt_id");
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'item_issue_receipt_actions_receipt_id_fk'
  ) THEN
    ALTER TABLE "item_issue_receipt_actions"
      ADD CONSTRAINT "item_issue_receipt_actions_receipt_id_fk"
      FOREIGN KEY ("receipt_id") REFERENCES "public"."item_issue_receipts"("id")
      ON DELETE restrict ON UPDATE restrict;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'item_issue_receipt_actions_actor_fk'
  ) THEN
    ALTER TABLE "item_issue_receipt_actions"
      ADD CONSTRAINT "item_issue_receipt_actions_actor_fk"
      FOREIGN KEY ("actor_application_user_id")
      REFERENCES "public"."application_users"("id")
      ON DELETE restrict ON UPDATE restrict;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "item_issue_receipt_actions_receipt_id_created_at_idx"
  ON "item_issue_receipt_actions" USING btree ("receipt_id", "created_at");
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'item_issue_discrepancies_shipment_line_id_fk'
  ) THEN
    ALTER TABLE "item_issue_discrepancies"
      ADD CONSTRAINT "item_issue_discrepancies_shipment_line_id_fk"
      FOREIGN KEY ("shipment_line_id") REFERENCES "public"."item_issue_shipment_lines"("id")
      ON DELETE restrict ON UPDATE restrict;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'item_issue_discrepancies_receipt_id_fk'
  ) THEN
    ALTER TABLE "item_issue_discrepancies"
      ADD CONSTRAINT "item_issue_discrepancies_receipt_id_fk"
      FOREIGN KEY ("receipt_id") REFERENCES "public"."item_issue_receipts"("id")
      ON DELETE restrict ON UPDATE restrict;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'item_issue_discrepancies_item_issue_id_fk'
  ) THEN
    ALTER TABLE "item_issue_discrepancies"
      ADD CONSTRAINT "item_issue_discrepancies_item_issue_id_fk"
      FOREIGN KEY ("item_issue_id") REFERENCES "public"."item_issues"("id")
      ON DELETE restrict ON UPDATE restrict;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'item_issue_discrepancies_quantity_positive'
  ) THEN
    ALTER TABLE "item_issue_discrepancies"
      ADD CONSTRAINT "item_issue_discrepancies_quantity_positive"
      CHECK ("quantity" > 0);
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "item_issue_discrepancies_shipment_line_id_idx"
  ON "item_issue_discrepancies" USING btree ("shipment_line_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "item_issue_discrepancies_item_issue_id_idx"
  ON "item_issue_discrepancies" USING btree ("item_issue_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "item_issue_discrepancies_receipt_line_reason_uidx"
  ON "item_issue_discrepancies" USING btree ("receipt_id", "shipment_line_id", "reason");
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'department_consumptions_item_issue_id_fk'
  ) THEN
    ALTER TABLE "department_consumptions"
      ADD CONSTRAINT "department_consumptions_item_issue_id_fk"
      FOREIGN KEY ("item_issue_id") REFERENCES "public"."item_issues"("id")
      ON DELETE restrict ON UPDATE restrict;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'department_consumptions_department_id_fk'
  ) THEN
    ALTER TABLE "department_consumptions"
      ADD CONSTRAINT "department_consumptions_department_id_fk"
      FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id")
      ON DELETE restrict ON UPDATE restrict;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'department_consumptions_consumed_by_fk'
  ) THEN
    ALTER TABLE "department_consumptions"
      ADD CONSTRAINT "department_consumptions_consumed_by_fk"
      FOREIGN KEY ("consumed_by_employee_id") REFERENCES "public"."employees"("id")
      ON DELETE restrict ON UPDATE restrict;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'department_consumptions_created_by_fk'
  ) THEN
    ALTER TABLE "department_consumptions"
      ADD CONSTRAINT "department_consumptions_created_by_fk"
      FOREIGN KEY ("created_by_application_user_id")
      REFERENCES "public"."application_users"("id")
      ON DELETE restrict ON UPDATE restrict;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'department_consumptions_verified_by_fk'
  ) THEN
    ALTER TABLE "department_consumptions"
      ADD CONSTRAINT "department_consumptions_verified_by_fk"
      FOREIGN KEY ("verified_by_application_user_id")
      REFERENCES "public"."application_users"("id")
      ON DELETE restrict ON UPDATE restrict;
  END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "department_consumptions_item_issue_id_uidx"
  ON "department_consumptions" USING btree ("item_issue_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "department_consumptions_department_id_idx"
  ON "department_consumptions" USING btree ("department_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "department_consumptions_issue_date_idx"
  ON "department_consumptions" USING btree ("issue_date");
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'department_consumption_lines_consumption_id_fk'
  ) THEN
    ALTER TABLE "department_consumption_lines"
      ADD CONSTRAINT "department_consumption_lines_consumption_id_fk"
      FOREIGN KEY ("department_consumption_id")
      REFERENCES "public"."department_consumptions"("id")
      ON DELETE restrict ON UPDATE restrict;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'department_consumption_lines_issue_line_id_fk'
  ) THEN
    ALTER TABLE "department_consumption_lines"
      ADD CONSTRAINT "department_consumption_lines_issue_line_id_fk"
      FOREIGN KEY ("item_issue_line_id") REFERENCES "public"."item_issue_lines"("id")
      ON DELETE restrict ON UPDATE restrict;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'department_consumption_lines_item_id_fk'
  ) THEN
    ALTER TABLE "department_consumption_lines"
      ADD CONSTRAINT "department_consumption_lines_item_id_fk"
      FOREIGN KEY ("item_id") REFERENCES "public"."items"("id")
      ON DELETE restrict ON UPDATE restrict;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'department_consumption_lines_unit_id_fk'
  ) THEN
    ALTER TABLE "department_consumption_lines"
      ADD CONSTRAINT "department_consumption_lines_unit_id_fk"
      FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id")
      ON DELETE restrict ON UPDATE restrict;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'department_consumption_lines_quantity_positive'
  ) THEN
    ALTER TABLE "department_consumption_lines"
      ADD CONSTRAINT "department_consumption_lines_quantity_positive"
      CHECK ("quantity" > 0);
  END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "department_consumption_lines_issue_line_uidx"
  ON "department_consumption_lines" USING btree ("item_issue_line_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "department_consumption_lines_consumption_id_idx"
  ON "department_consumption_lines" USING btree ("department_consumption_id");
--> statement-breakpoint
INSERT INTO "item_issue_shipments" (
  "item_issue_id",
  "request_id",
  "from_store_id",
  "to_store_id",
  "delivery_status",
  "dispatched_at",
  "dispatched_by_application_user_id",
  "created_at",
  "updated_at"
)
SELECT
  "id",
  "request_id",
  "from_store_id",
  "to_store_id",
  'IN_TRANSIT',
  coalesce("verified_at", "submitted_at", "updated_at"),
  coalesce(
    "verified_by_application_user_id",
    "submitted_by_application_user_id",
    "created_by_application_user_id"
  ),
  coalesce("verified_at", "created_at"),
  now()
FROM "item_issues"
WHERE "status" = 'POSTED'
  AND "destination_type" = 'BRANCH_STORE'
  AND "to_store_id" IS NOT NULL
  AND "from_store_id" <> "to_store_id"
  AND NOT EXISTS (
    SELECT 1
    FROM "item_issue_shipments"
    WHERE "item_issue_shipments"."item_issue_id" = "item_issues"."id"
  );
--> statement-breakpoint
INSERT INTO "item_issue_shipment_lines" (
  "shipment_id",
  "item_issue_line_id",
  "item_id",
  "unit_id",
  "dispatched_quantity",
  "confirmed_received_quantity",
  "remaining_in_transit_quantity",
  "discrepancy_quantity",
  "created_at",
  "updated_at"
)
SELECT
  "item_issue_shipments"."id",
  "item_issue_lines"."id",
  "item_issue_lines"."item_id",
  "items"."unit_id",
  "item_issue_lines"."issue_quantity",
  0,
  "item_issue_lines"."issue_quantity",
  0,
  "item_issue_shipments"."created_at",
  now()
FROM "item_issue_lines"
INNER JOIN "item_issue_shipments"
  ON "item_issue_shipments"."item_issue_id" = "item_issue_lines"."item_issue_id"
INNER JOIN "items"
  ON "items"."id" = "item_issue_lines"."item_id"
WHERE NOT EXISTS (
  SELECT 1
  FROM "item_issue_shipment_lines"
  WHERE "item_issue_shipment_lines"."item_issue_line_id" = "item_issue_lines"."id"
);
--> statement-breakpoint
COMMENT ON TABLE "item_issue_shipments" IS
  'In-transit shipments for BRANCH_STORE item issues. Destination store stock increases only after confirmed receipt.';
--> statement-breakpoint
COMMENT ON COLUMN "item_issues"."status" IS
  'Internal workflow status. POSTED means source stock was deducted. Map POSTED branch transfers to Dispatched/In Transit and department issues to Issued.';
--> statement-breakpoint
COMMENT ON COLUMN "item_issues"."delivery_status" IS
  'Branch transfer delivery state. Null for department consumption.';
--> statement-breakpoint
COMMENT ON COLUMN "stock_ledger"."stock_category" IS
  'AVAILABLE is store on-hand. IN_TRANSIT, DISCREPANCY, and DAMAGED are excluded from operational available stock.';
