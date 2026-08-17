import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { applicationUsers } from "./auth.js";
import { stores } from "./stores.js";

export const storeUsers = pgTable(
  "store_users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    storeId: uuid("store_id").notNull(),
    makerApplicationUserId: uuid("maker_application_user_id").notNull(),
    supervisorApplicationUserId: uuid(
      "supervisor_application_user_id",
    ).notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("store_users_store_id_uidx").on(table.storeId),
    uniqueIndex("store_users_active_maker_application_user_id_uidx")
      .on(table.makerApplicationUserId)
      .where(sql`${table.isActive}`),
    index("store_users_maker_application_user_id_idx").on(
      table.makerApplicationUserId,
    ),
    index("store_users_supervisor_application_user_id_idx").on(
      table.supervisorApplicationUserId,
    ),
    index("store_users_is_active_idx").on(table.isActive),
    foreignKey({
      columns: [table.storeId],
      foreignColumns: [stores.id],
      name: "store_users_store_id_stores_id_fk",
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({
      columns: [table.makerApplicationUserId],
      foreignColumns: [applicationUsers.id],
      name: "store_users_maker_application_user_id_fk",
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({
      columns: [table.supervisorApplicationUserId],
      foreignColumns: [applicationUsers.id],
      name: "store_users_supervisor_application_user_id_fk",
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    check(
      "store_users_maker_ne_supervisor",
      sql`${table.makerApplicationUserId} <> ${table.supervisorApplicationUserId}`,
    ),
  ],
);

export type StoreUserRow = typeof storeUsers.$inferSelect;
export type NewStoreUserRow = typeof storeUsers.$inferInsert;
