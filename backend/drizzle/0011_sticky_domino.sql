CREATE TABLE "store_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"maker_application_user_id" uuid NOT NULL,
	"supervisor_application_user_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "store_users_maker_ne_supervisor" CHECK ("store_users"."maker_application_user_id" <> "store_users"."supervisor_application_user_id")
);
--> statement-breakpoint
ALTER TABLE "store_users" ADD CONSTRAINT "store_users_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "store_users" ADD CONSTRAINT "store_users_maker_application_user_id_fk" FOREIGN KEY ("maker_application_user_id") REFERENCES "public"."application_users"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "store_users" ADD CONSTRAINT "store_users_supervisor_application_user_id_fk" FOREIGN KEY ("supervisor_application_user_id") REFERENCES "public"."application_users"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE UNIQUE INDEX "store_users_store_id_uidx" ON "store_users" USING btree ("store_id");--> statement-breakpoint
CREATE UNIQUE INDEX "store_users_active_maker_application_user_id_uidx" ON "store_users" USING btree ("maker_application_user_id") WHERE "store_users"."is_active";--> statement-breakpoint
CREATE INDEX "store_users_maker_application_user_id_idx" ON "store_users" USING btree ("maker_application_user_id");--> statement-breakpoint
CREATE INDEX "store_users_supervisor_application_user_id_idx" ON "store_users" USING btree ("supervisor_application_user_id");--> statement-breakpoint
CREATE INDEX "store_users_is_active_idx" ON "store_users" USING btree ("is_active");