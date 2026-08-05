CREATE TYPE "public"."group_type" AS ENUM('INVENTORY', 'FIXED_ASSET', 'SERVICES', 'MAINTENANCE');--> statement-breakpoint
ALTER TABLE "item_groups" ADD COLUMN "group_code" varchar(20);--> statement-breakpoint
ALTER TABLE "item_groups" ADD COLUMN "group_type" "group_type" DEFAULT 'INVENTORY' NOT NULL;--> statement-breakpoint
UPDATE "item_groups"
SET "group_code" = 'IG-' || substring(replace(id::text, '-', ''), 1, 8)
WHERE "group_code" IS NULL;--> statement-breakpoint
ALTER TABLE "item_groups" ALTER COLUMN "group_code" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "item_groups_group_code_lower_uidx" ON "item_groups" USING btree (lower("group_code"));
