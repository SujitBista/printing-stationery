import { sql } from "drizzle-orm";
import {
  boolean,
  pgEnum,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const groupTypeEnum = pgEnum("group_type", [
  "INVENTORY",
  "FIXED_ASSET",
  "SERVICES",
  "MAINTENANCE",
]);

export const itemGroups = pgTable(
  "item_groups",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    groupCode: varchar("group_code", { length: 20 }).notNull(),
    groupName: varchar("group_name", { length: 100 }).notNull(),
    groupType: groupTypeEnum("group_type").notNull().default("INVENTORY"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("item_groups_group_code_lower_uidx").on(
      sql`lower(${table.groupCode})`,
    ),
    uniqueIndex("item_groups_group_name_lower_uidx").on(
      sql`lower(${table.groupName})`,
    ),
  ],
);

export type ItemGroupRow = typeof itemGroups.$inferSelect;
export type NewItemGroupRow = typeof itemGroups.$inferInsert;
