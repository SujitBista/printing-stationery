-- Allow a store user assignment to be created for a single MAKER or CHECKER
-- during Application User Setup. Manual Store User Setup still requires both
-- people. Historical item requests, issues, and other transactions are not
-- rewritten by this change.

ALTER TABLE "store_users" ALTER COLUMN "maker_application_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "store_users" ALTER COLUMN "supervisor_application_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "store_users" DROP CONSTRAINT IF EXISTS "store_users_maker_ne_supervisor";--> statement-breakpoint
ALTER TABLE "store_users" ADD CONSTRAINT "store_users_maker_ne_supervisor" CHECK ("maker_application_user_id" IS NULL OR "supervisor_application_user_id" IS NULL OR "maker_application_user_id" <> "supervisor_application_user_id");--> statement-breakpoint
ALTER TABLE "store_users" ADD CONSTRAINT "store_users_maker_or_supervisor" CHECK ("maker_application_user_id" IS NOT NULL OR "supervisor_application_user_id" IS NOT NULL);
