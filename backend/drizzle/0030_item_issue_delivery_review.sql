-- Historical posted branch issues with unknown receipt state are not receivable.
-- COMMIT first so PostgreSQL allows using the new enum value in later migrations
-- in this same drizzle-kit migrate run.
COMMIT;
--> statement-breakpoint
ALTER TYPE "public"."item_issue_delivery_status" ADD VALUE IF NOT EXISTS 'NEEDS_REVIEW';
--> statement-breakpoint
BEGIN;
