DROP INDEX "stores_branch_id_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "stores_branch_id_uidx" ON "stores" USING btree ("branch_id");