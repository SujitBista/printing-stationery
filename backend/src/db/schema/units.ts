import { sql } from "drizzle-orm";
import {
  boolean,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const units = pgTable(
  "units",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    unitName: varchar("unit_name", { length: 100 }).notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("units_unit_name_lower_uidx").on(sql`lower(${table.unitName})`),
  ],
);

export type UnitRow = typeof units.$inferSelect;
export type NewUnitRow = typeof units.$inferInsert;
