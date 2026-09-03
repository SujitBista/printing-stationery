import { sql } from "drizzle-orm";
import {
  check,
  date,
  foreignKey,
  index,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { applicationUsers } from "./auth.js";
import { branches } from "./branches.js";
import { employees } from "./employees.js";
import { stores } from "./stores.js";

export const employeeTransfers = pgTable(
  "employee_transfers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    employeeId: uuid("employee_id").notNull(),
    fromBranchId: uuid("from_branch_id").notNull(),
    toBranchId: uuid("to_branch_id").notNull(),
    effectiveDate: date("effective_date", { mode: "string" }).notNull(),
    reason: varchar("reason", { length: 500 }).notNull(),
    transferredByApplicationUserId: uuid(
      "transferred_by_application_user_id",
    ).notNull(),
    fromStoreId: uuid("from_store_id"),
    toStoreId: uuid("to_store_id"),
    fromSupervisorApplicationUserId: uuid(
      "from_supervisor_application_user_id",
    ),
    toSupervisorApplicationUserId: uuid("to_supervisor_application_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("employee_transfers_employee_id_idx").on(table.employeeId),
    index("employee_transfers_from_branch_id_idx").on(table.fromBranchId),
    index("employee_transfers_to_branch_id_idx").on(table.toBranchId),
    index("employee_transfers_effective_date_idx").on(table.effectiveDate),
    index("employee_transfers_transferred_by_idx").on(
      table.transferredByApplicationUserId,
    ),
    uniqueIndex("employee_transfers_employee_from_to_effective_uidx").on(
      table.employeeId,
      table.fromBranchId,
      table.toBranchId,
      table.effectiveDate,
    ),
    foreignKey({
      columns: [table.employeeId],
      foreignColumns: [employees.id],
      name: "employee_transfers_employee_id_fk",
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({
      columns: [table.fromBranchId],
      foreignColumns: [branches.id],
      name: "employee_transfers_from_branch_id_fk",
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({
      columns: [table.toBranchId],
      foreignColumns: [branches.id],
      name: "employee_transfers_to_branch_id_fk",
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({
      columns: [table.transferredByApplicationUserId],
      foreignColumns: [applicationUsers.id],
      name: "employee_transfers_transferred_by_fk",
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({
      columns: [table.fromStoreId],
      foreignColumns: [stores.id],
      name: "employee_transfers_from_store_id_fk",
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({
      columns: [table.toStoreId],
      foreignColumns: [stores.id],
      name: "employee_transfers_to_store_id_fk",
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({
      columns: [table.fromSupervisorApplicationUserId],
      foreignColumns: [applicationUsers.id],
      name: "employee_transfers_from_supervisor_fk",
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({
      columns: [table.toSupervisorApplicationUserId],
      foreignColumns: [applicationUsers.id],
      name: "employee_transfers_to_supervisor_fk",
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    check(
      "employee_transfers_from_ne_to_branch",
      sql`${table.fromBranchId} <> ${table.toBranchId}`,
    ),
  ],
);

export type EmployeeTransferRow = typeof employeeTransfers.$inferSelect;
export type NewEmployeeTransferRow = typeof employeeTransfers.$inferInsert;
