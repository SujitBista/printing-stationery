CREATE TYPE "public"."branch_type" AS ENUM('HEAD_OFFICE', 'BRANCH');--> statement-breakpoint
CREATE TABLE "branches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"branch_code" varchar(20) NOT NULL,
	"branch_name" varchar(150) NOT NULL,
	"branch_type" "branch_type" NOT NULL,
	"address" varchar(255),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "branches_branch_code_lower_uidx" ON "branches" USING btree (lower("branch_code"));