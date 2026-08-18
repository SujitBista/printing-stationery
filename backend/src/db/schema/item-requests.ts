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
import { items } from "./items.js";
import { stores } from "./stores.js";

export const itemRequestStatusEnum = pgEnum("item_request_status", [
  "DRAFT",
  "PENDING_BRANCH_CHECKER",
  "RETURNED_TO_BRANCH_MAKER",
  "PENDING_CORPORATE_MAKER",
  "PENDING_CORPORATE_CHECKER",
  "RETURNED_TO_CORPORATE_MAKER",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
]);

export const itemRequestActionEnum = pgEnum("item_request_action", [
  "SUBMIT",
  "RESUBMIT",
  "RECOMMEND",
  "FORWARD",
  "APPROVE",
  "RETURN",
  "REJECT",
  "CANCEL",
]);

export const itemRequests = pgTable(
  "item_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    requestNumber: varchar("request_number", { length: 40 }).notNull(),
    requestingStoreId: uuid("requesting_store_id").notNull(),
    corporateStoreId: uuid("corporate_store_id"),
    createdByApplicationUserId: uuid(
      "created_by_application_user_id",
    ).notNull(),
    branchCheckerApplicationUserId: uuid(
      "branch_checker_application_user_id",
    ),
    corporateMakerApplicationUserId: uuid(
      "corporate_maker_application_user_id",
    ),
    corporateCheckerApplicationUserId: uuid(
      "corporate_checker_application_user_id",
    ),
    status: itemRequestStatusEnum("status").notNull().default("DRAFT"),
    remarks: varchar("remarks", { length: 500 }),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    recommendedAt: timestamp("recommended_at", { withTimezone: true }),
    forwardedAt: timestamp("forwarded_at", { withTimezone: true }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    rejectedAt: timestamp("rejected_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("item_requests_request_number_uidx").on(table.requestNumber),
    index("item_requests_status_idx").on(table.status),
    index("item_requests_requesting_store_id_idx").on(table.requestingStoreId),
    index("item_requests_corporate_store_id_idx").on(table.corporateStoreId),
    index("item_requests_branch_checker_application_user_id_idx").on(
      table.branchCheckerApplicationUserId,
    ),
    index("item_requests_corporate_maker_application_user_id_idx").on(
      table.corporateMakerApplicationUserId,
    ),
    index("item_requests_corporate_checker_application_user_id_idx").on(
      table.corporateCheckerApplicationUserId,
    ),
    index("item_requests_created_at_idx").on(table.createdAt),
    index("item_requests_created_by_application_user_id_idx").on(
      table.createdByApplicationUserId,
    ),
    foreignKey({
      columns: [table.requestingStoreId],
      foreignColumns: [stores.id],
      name: "item_requests_requesting_store_id_fk",
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({
      columns: [table.corporateStoreId],
      foreignColumns: [stores.id],
      name: "item_requests_corporate_store_id_fk",
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({
      columns: [table.createdByApplicationUserId],
      foreignColumns: [applicationUsers.id],
      name: "item_requests_created_by_application_user_id_fk",
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({
      columns: [table.branchCheckerApplicationUserId],
      foreignColumns: [applicationUsers.id],
      name: "item_requests_branch_checker_application_user_id_fk",
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({
      columns: [table.corporateMakerApplicationUserId],
      foreignColumns: [applicationUsers.id],
      name: "item_requests_corporate_maker_application_user_id_fk",
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({
      columns: [table.corporateCheckerApplicationUserId],
      foreignColumns: [applicationUsers.id],
      name: "item_requests_corporate_checker_application_user_id_fk",
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    check("item_requests_version_positive", sql`${table.version} >= 1`),
  ],
);

export const itemRequestLines = pgTable(
  "item_request_lines",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    itemRequestId: uuid("item_request_id").notNull(),
    itemId: uuid("item_id").notNull(),
    requestedQuantity: numeric("requested_quantity", {
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
    uniqueIndex("item_request_lines_request_item_uidx").on(
      table.itemRequestId,
      table.itemId,
    ),
    index("item_request_lines_item_request_id_idx").on(table.itemRequestId),
    index("item_request_lines_item_id_idx").on(table.itemId),
    foreignKey({
      columns: [table.itemRequestId],
      foreignColumns: [itemRequests.id],
      name: "item_request_lines_item_request_id_fk",
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({
      columns: [table.itemId],
      foreignColumns: [items.id],
      name: "item_request_lines_item_id_fk",
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    check(
      "item_request_lines_requested_quantity_positive",
      sql`${table.requestedQuantity} > 0`,
    ),
  ],
);

export const itemRequestActions = pgTable(
  "item_request_actions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    itemRequestId: uuid("item_request_id").notNull(),
    action: itemRequestActionEnum("action").notNull(),
    fromStatus: itemRequestStatusEnum("from_status").notNull(),
    toStatus: itemRequestStatusEnum("to_status").notNull(),
    actorApplicationUserId: uuid("actor_application_user_id").notNull(),
    remarks: varchar("remarks", { length: 500 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("item_request_actions_item_request_id_created_at_idx").on(
      table.itemRequestId,
      table.createdAt,
    ),
    foreignKey({
      columns: [table.itemRequestId],
      foreignColumns: [itemRequests.id],
      name: "item_request_actions_item_request_id_fk",
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({
      columns: [table.actorApplicationUserId],
      foreignColumns: [applicationUsers.id],
      name: "item_request_actions_actor_application_user_id_fk",
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
  ],
);

export type ItemRequestRow = typeof itemRequests.$inferSelect;
export type NewItemRequestRow = typeof itemRequests.$inferInsert;
export type ItemRequestLineRow = typeof itemRequestLines.$inferSelect;
export type NewItemRequestLineRow = typeof itemRequestLines.$inferInsert;
export type ItemRequestActionRow = typeof itemRequestActions.$inferSelect;
export type NewItemRequestActionRow = typeof itemRequestActions.$inferInsert;
