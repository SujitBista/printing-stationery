-- In-app notifications for item-request workflow events.
-- Recipients see only their own rows; unread lookups use a partial index.

CREATE TYPE "public"."notification_type" AS ENUM(
  'ITEM_REQUEST_SUBMITTED',
  'ITEM_REQUEST_RECOMMENDED',
  'ITEM_REQUEST_FORWARDED',
  'ITEM_REQUEST_APPROVED',
  'ITEM_REQUEST_RETURNED',
  'ITEM_REQUEST_REJECTED'
);
--> statement-breakpoint
CREATE TYPE "public"."notification_entity_type" AS ENUM(
  'ITEM_REQUEST'
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipient_user_id" uuid NOT NULL,
	"type" "notification_type" NOT NULL,
	"title" varchar(200) NOT NULL,
	"message" varchar(500) NOT NULL,
	"related_entity_type" "notification_entity_type" NOT NULL,
	"related_entity_id" uuid NOT NULL,
	"request_number" varchar(40),
	"actor_user_id" uuid,
	"is_read" boolean DEFAULT false NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notifications_read_state" CHECK (("is_read" = false AND "read_at" IS NULL) OR ("is_read" = true AND "read_at" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_user_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."application_users"("id") ON DELETE restrict ON UPDATE restrict;
--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_actor_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."application_users"("id") ON DELETE restrict ON UPDATE restrict;
--> statement-breakpoint
CREATE INDEX "notifications_recipient_user_id_created_at_idx" ON "notifications" USING btree ("recipient_user_id","created_at");
--> statement-breakpoint
CREATE INDEX "notifications_recipient_unread_idx" ON "notifications" USING btree ("recipient_user_id") WHERE "is_read" = false;
--> statement-breakpoint
CREATE INDEX "notifications_related_entity_idx" ON "notifications" USING btree ("related_entity_type","related_entity_id");
--> statement-breakpoint
COMMENT ON TABLE "notifications" IS
  'In-app notifications for workflow events. Recipients see only their own rows.';
