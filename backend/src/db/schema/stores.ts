import { sql } from "drizzle-orm";
import {
  boolean,
  foreignKey,
  index,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { branches } from "./branches.js";

export const stores = pgTable(
  "stores",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    storeCode: varchar("store_code", { length: 30 }).notNull(),
    storeName: varchar("store_name", { length: 150 }).notNull(),
    branchId: uuid("branch_id").notNull(),
    underStoreId: uuid("under_store_id"),
    allowTransfer: boolean("allow_transfer").notNull().default(false),
    allowDepartmentIssue: boolean("allow_department_issue")
      .notNull()
      .default(false),
    remarks: varchar("remarks", { length: 500 }),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("stores_store_code_lower_uidx").on(
      sql`lower(${table.storeCode})`,
    ),
    uniqueIndex("stores_branch_store_name_lower_uidx").on(
      table.branchId,
      sql`lower(${table.storeName})`,
    ),
    index("stores_branch_id_idx").on(table.branchId),
    index("stores_under_store_id_idx").on(table.underStoreId),
    index("stores_is_active_idx").on(table.isActive),
    foreignKey({
      columns: [table.branchId],
      foreignColumns: [branches.id],
      name: "stores_branch_id_branches_id_fk",
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({
      columns: [table.underStoreId],
      foreignColumns: [table.id],
      name: "stores_under_store_id_stores_id_fk",
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
  ],
);

export type StoreRow = typeof stores.$inferSelect;
export type NewStoreRow = typeof stores.$inferInsert;
