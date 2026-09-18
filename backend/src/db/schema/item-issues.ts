import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { applicationUsers } from "./auth.js";
import { departments } from "./departments.js";
import { employees } from "./employees.js";
import {
  itemRequestLines,
  itemRequests,
  itemRequestWorkflowRoleEnum,
} from "./item-requests.js";
import { items } from "./items.js";
import { stores } from "./stores.js";

export const itemIssueStatusEnum = pgEnum("item_issue_status", [
  "DRAFT",
  "PENDING_VERIFICATION",
  "RETURNED",
  "REJECTED",
  "POSTED",
]);

export const itemIssueActionEnum = pgEnum("item_issue_action", [
  "CREATE",
  "UPDATE",
  "SUBMIT",
  "RETURN",
  "REJECT",
  "VERIFY_POST",
  "DISPATCH",
  "ISSUE_TO_DEPARTMENT",
]);

export const itemIssueDestinationTypeEnum = pgEnum(
  "item_issue_destination_type",
  ["BRANCH_STORE", "CORPORATE_DEPARTMENT"],
);

export const itemIssueDeliveryStatusEnum = pgEnum("item_issue_delivery_status", [
  "IN_TRANSIT",
  "PARTIALLY_RECEIVED",
  "RECEIVED",
  "RECEIVED_WITH_DISCREPANCY",
]);

export const itemIssues = pgTable(
  "item_issues",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    issueNumber: varchar("issue_number", { length: 40 }).notNull(),
    requestId: uuid("request_id"),
    fromStoreId: uuid("from_store_id").notNull(),
    toStoreId: uuid("to_store_id"),
    destinationType: itemIssueDestinationTypeEnum("destination_type")
      .notNull()
      .default("BRANCH_STORE"),
    deliveryStatus: itemIssueDeliveryStatusEnum("delivery_status"),
    departmentId: uuid("department_id"),
    consumedByEmployeeId: uuid("consumed_by_employee_id"),
    consumptionDescription: varchar("consumption_description", { length: 500 }),
    status: itemIssueStatusEnum("status").notNull().default("DRAFT"),
    remarks: varchar("remarks", { length: 500 }),
    needsAdminReview: boolean("needs_admin_review").notNull().default(false),
    createdByApplicationUserId: uuid(
      "created_by_application_user_id",
    ).notNull(),
    submittedByApplicationUserId: uuid("submitted_by_application_user_id"),
    verifiedByApplicationUserId: uuid("verified_by_application_user_id"),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    issueDate: timestamp("issue_date", { withTimezone: true })
      .notNull()
      .defaultNow(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    returnedAt: timestamp("returned_at", { withTimezone: true }),
    rejectedAt: timestamp("rejected_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("item_issues_issue_number_uidx").on(table.issueNumber),
    uniqueIndex("item_issues_one_open_per_request_uidx")
      .on(table.requestId)
      .where(
        sql`${table.status} in ('DRAFT', 'PENDING_VERIFICATION', 'RETURNED') and ${table.requestId} is not null`,
      ),
    index("item_issues_request_id_idx").on(table.requestId),
    index("item_issues_status_idx").on(table.status),
    index("item_issues_destination_type_idx").on(table.destinationType),
    index("item_issues_delivery_status_idx").on(table.deliveryStatus),
    index("item_issues_from_store_id_idx").on(table.fromStoreId),
    index("item_issues_to_store_id_idx").on(table.toStoreId),
    index("item_issues_department_id_idx").on(table.departmentId),
    index("item_issues_created_by_application_user_id_idx").on(
      table.createdByApplicationUserId,
    ),
    index("item_issues_submitted_by_application_user_id_idx").on(
      table.submittedByApplicationUserId,
    ),
    index("item_issues_verified_by_application_user_id_idx").on(
      table.verifiedByApplicationUserId,
    ),
    index("item_issues_created_at_idx").on(table.createdAt),
    foreignKey({
      columns: [table.requestId],
      foreignColumns: [itemRequests.id],
      name: "item_issues_request_id_fk",
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({
      columns: [table.fromStoreId],
      foreignColumns: [stores.id],
      name: "item_issues_from_store_id_fk",
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({
      columns: [table.toStoreId],
      foreignColumns: [stores.id],
      name: "item_issues_to_store_id_fk",
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({
      columns: [table.departmentId],
      foreignColumns: [departments.id],
      name: "item_issues_department_id_fk",
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({
      columns: [table.consumedByEmployeeId],
      foreignColumns: [employees.id],
      name: "item_issues_consumed_by_employee_id_fk",
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({
      columns: [table.createdByApplicationUserId],
      foreignColumns: [applicationUsers.id],
      name: "item_issues_created_by_application_user_id_fk",
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({
      columns: [table.submittedByApplicationUserId],
      foreignColumns: [applicationUsers.id],
      name: "item_issues_submitted_by_application_user_id_fk",
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({
      columns: [table.verifiedByApplicationUserId],
      foreignColumns: [applicationUsers.id],
      name: "item_issues_verified_by_application_user_id_fk",
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    check("item_issues_version_positive", sql`${table.version} >= 1`),
    check(
      "item_issues_destination_shape",
      sql`(
        ${table.destinationType} = 'BRANCH_STORE'
        AND ${table.toStoreId} IS NOT NULL
        AND ${table.departmentId} IS NULL
        AND ${table.fromStoreId} <> ${table.toStoreId}
      ) OR (
        ${table.destinationType} = 'CORPORATE_DEPARTMENT'
        AND ${table.departmentId} IS NOT NULL
        AND ${table.toStoreId} IS NULL
      )`,
    ),
  ],
);

export const itemIssueLines = pgTable(
  "item_issue_lines",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    itemIssueId: uuid("item_issue_id").notNull(),
    requestLineId: uuid("request_line_id"),
    itemId: uuid("item_id").notNull(),
    issueQuantity: numeric("issue_quantity", {
      precision: 18,
      scale: 4,
    }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("item_issue_lines_issue_request_line_uidx")
      .on(table.itemIssueId, table.requestLineId)
      .where(sql`${table.requestLineId} is not null`),
    uniqueIndex("item_issue_lines_issue_item_uidx")
      .on(table.itemIssueId, table.itemId)
      .where(sql`${table.requestLineId} is null`),
    index("item_issue_lines_item_issue_id_idx").on(table.itemIssueId),
    index("item_issue_lines_request_line_id_idx").on(table.requestLineId),
    index("item_issue_lines_item_id_idx").on(table.itemId),
    foreignKey({
      columns: [table.itemIssueId],
      foreignColumns: [itemIssues.id],
      name: "item_issue_lines_item_issue_id_fk",
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({
      columns: [table.requestLineId],
      foreignColumns: [itemRequestLines.id],
      name: "item_issue_lines_request_line_id_fk",
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({
      columns: [table.itemId],
      foreignColumns: [items.id],
      name: "item_issue_lines_item_id_fk",
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    check(
      "item_issue_lines_issue_quantity_positive",
      sql`${table.issueQuantity} > 0`,
    ),
  ],
);

export const itemIssueActions = pgTable(
  "item_issue_actions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    itemIssueId: uuid("item_issue_id").notNull(),
    action: itemIssueActionEnum("action").notNull(),
    fromStatus: itemIssueStatusEnum("from_status"),
    toStatus: itemIssueStatusEnum("to_status").notNull(),
    actorApplicationUserId: uuid("actor_application_user_id").notNull(),
    actorWorkflowRole: itemRequestWorkflowRoleEnum(
      "actor_workflow_role",
    ).notNull(),
    remarks: varchar("remarks", { length: 500 }),
    stockLedgerReferenceId: uuid("stock_ledger_reference_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("item_issue_actions_item_issue_id_created_at_idx").on(
      table.itemIssueId,
      table.createdAt,
    ),
    foreignKey({
      columns: [table.itemIssueId],
      foreignColumns: [itemIssues.id],
      name: "item_issue_actions_item_issue_id_fk",
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({
      columns: [table.actorApplicationUserId],
      foreignColumns: [applicationUsers.id],
      name: "item_issue_actions_actor_application_user_id_fk",
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
  ],
);

export type ItemIssueRow = typeof itemIssues.$inferSelect;
export type NewItemIssueRow = typeof itemIssues.$inferInsert;
export type ItemIssueLineRow = typeof itemIssueLines.$inferSelect;
export type NewItemIssueLineRow = typeof itemIssueLines.$inferInsert;
export type ItemIssueActionRow = typeof itemIssueActions.$inferSelect;
export type NewItemIssueActionRow = typeof itemIssueActions.$inferInsert;
