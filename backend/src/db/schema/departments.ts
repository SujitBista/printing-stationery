import { sql } from "drizzle-orm";
import {
  boolean,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const departments = pgTable(
  "departments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    departmentCode: varchar("department_code", { length: 20 }).notNull(),
    departmentName: varchar("department_name", { length: 150 }).notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("departments_department_code_lower_uidx").on(
      sql`lower(${table.departmentCode})`,
    ),
  ],
);

export type DepartmentRow = typeof departments.$inferSelect;
export type NewDepartmentRow = typeof departments.$inferInsert;
