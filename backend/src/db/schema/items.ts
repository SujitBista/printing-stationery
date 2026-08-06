import { sql } from "drizzle-orm";
import {
  boolean,
  foreignKey,
  index,
  numeric,
  pgEnum,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { itemGroups } from "./item-groups.js";
import { units } from "./units.js";

export const returnTypeEnum = pgEnum("return_type", [
  "RETURNABLE",
  "NON_RETURNABLE",
]);

export const items = pgTable(
  "items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    itemCode: varchar("item_code", { length: 30 }).notNull(),
    itemName: varchar("item_name", { length: 150 }).notNull(),
    unitId: uuid("unit_id").notNull(),
    itemGroupId: uuid("item_group_id").notNull(),
    returnType: returnTypeEnum("return_type").notNull().default("NON_RETURNABLE"),
    purchaseRate: numeric("purchase_rate", { precision: 18, scale: 4 })
      .notNull()
      .default("0"),
    remarks: varchar("remarks", { length: 500 }),
    isActive: boolean("is_active").notNull().default(true),
    isRequestable: boolean("is_requestable").notNull().default(true),
    isIssuable: boolean("is_issuable").notNull().default(true),
    trackSerialNumber: boolean("track_serial_number").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("items_item_code_lower_uidx").on(sql`lower(${table.itemCode})`),
    uniqueIndex("items_item_name_lower_uidx").on(sql`lower(${table.itemName})`),
    index("items_unit_id_idx").on(table.unitId),
    index("items_item_group_id_idx").on(table.itemGroupId),
    index("items_is_active_idx").on(table.isActive),
    foreignKey({
      columns: [table.unitId],
      foreignColumns: [units.id],
      name: "items_unit_id_units_id_fk",
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({
      columns: [table.itemGroupId],
      foreignColumns: [itemGroups.id],
      name: "items_item_group_id_item_groups_id_fk",
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
  ],
);

export type ItemRow = typeof items.$inferSelect;
export type NewItemRow = typeof items.$inferInsert;
