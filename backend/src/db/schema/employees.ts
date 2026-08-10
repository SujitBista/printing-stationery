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

export const employees = pgTable(
  "employees",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    employeeCode: varchar("employee_code", { length: 30 }).notNull(),
    employeeName: varchar("employee_name", { length: 150 }).notNull(),
    branchId: uuid("branch_id").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("employees_employee_code_lower_uidx").on(
      sql`lower(${table.employeeCode})`,
    ),
    index("employees_branch_id_idx").on(table.branchId),
    index("employees_is_active_idx").on(table.isActive),
    foreignKey({
      columns: [table.branchId],
      foreignColumns: [branches.id],
      name: "employees_branch_id_branches_id_fk",
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
  ],
);

export type EmployeeRow = typeof employees.$inferSelect;
export type NewEmployeeRow = typeof employees.$inferInsert;
