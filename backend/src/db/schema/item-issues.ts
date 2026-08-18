import { sql } from "drizzle-orm";
import {
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
import { itemRequestLines, itemRequests } from "./item-requests.js";
import { items } from "./items.js";
import { stores } from "./stores.js";

export const itemIssueStatusEnum = pgEnum("item_issue_status", [
  "DRAFT",
  "SUBMITTED",
]);

export const itemIssues = pgTable(
  "item_issues",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    issueNumber: varchar("issue_number", { length: 40 }).notNull(),
    requestId: uuid("request_id").notNull(),
    fromStoreId: uuid("from_store_id").notNull(),
    toStoreId: uuid("to_store_id").notNull(),
    status: itemIssueStatusEnum("status").notNull().default("DRAFT"),
    remarks: varchar("remarks", { length: 500 }),
    createdByApplicationUserId: uuid(
      "created_by_application_user_id",
    ).notNull(),
    submittedByApplicationUserId: uuid("submitted_by_application_user_id"),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("item_issues_issue_number_uidx").on(table.issueNumber),
    index("item_issues_request_id_idx").on(table.requestId),
    index("item_issues_status_idx").on(table.status),
    index("item_issues_from_store_id_idx").on(table.fromStoreId),
    index("item_issues_to_store_id_idx").on(table.toStoreId),
    index("item_issues_created_by_application_user_id_idx").on(
      table.createdByApplicationUserId,
    ),
    index("item_issues_submitted_by_application_user_id_idx").on(
      table.submittedByApplicationUserId,
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
    check("item_issues_version_positive", sql`${table.version} >= 1`),
  ],
);

export const itemIssueLines = pgTable(
  "item_issue_lines",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    itemIssueId: uuid("item_issue_id").notNull(),
    requestLineId: uuid("request_line_id").notNull(),
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
    uniqueIndex("item_issue_lines_issue_request_line_uidx").on(
      table.itemIssueId,
      table.requestLineId,
    ),
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

export type ItemIssueRow = typeof itemIssues.$inferSelect;
export type NewItemIssueRow = typeof itemIssues.$inferInsert;
export type ItemIssueLineRow = typeof itemIssueLines.$inferSelect;
export type NewItemIssueLineRow = typeof itemIssueLines.$inferInsert;
