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
import { departments } from "./departments.js";
import { employees } from "./employees.js";
import {
  itemIssueDeliveryStatusEnum,
  itemIssueLines,
  itemIssues,
} from "./item-issues.js";
import { itemRequests, itemRequestWorkflowRoleEnum } from "./item-requests.js";
import { items } from "./items.js";
import { stores } from "./stores.js";
import { units } from "./units.js";

export const itemIssueReceiptStatusEnum = pgEnum("item_issue_receipt_status", [
  "DRAFT",
  "PENDING_VERIFICATION",
  "RETURNED",
  "CONFIRMED",
  "REJECTED",
]);

export const itemIssueReceiptActionEnum = pgEnum("item_issue_receipt_action", [
  "CREATE",
  "SUBMIT",
  "RETURN",
  "CONFIRM",
  "COMPLETE_WITH_DISCREPANCY",
]);

export const itemIssueDiscrepancyReasonEnum = pgEnum(
  "item_issue_discrepancy_reason",
  ["MISSING", "DAMAGED", "WRONG_ITEM", "EXCESS", "OTHER"],
);

export const itemIssueDiscrepancyResolutionEnum = pgEnum(
  "item_issue_discrepancy_resolution",
  ["KEEP_IN_TRANSIT", "COMPLETE_WITH_DISCREPANCY"],
);

export const itemIssueDiscrepancyStatusEnum = pgEnum(
  "item_issue_discrepancy_status",
  ["OPEN", "RESOLVED"],
);

export const itemIssueShipments = pgTable(
  "item_issue_shipments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    itemIssueId: uuid("item_issue_id").notNull(),
    requestId: uuid("request_id"),
    fromStoreId: uuid("from_store_id").notNull(),
    toStoreId: uuid("to_store_id").notNull(),
    deliveryStatus: itemIssueDeliveryStatusEnum("delivery_status")
      .notNull()
      .default("IN_TRANSIT"),
    dispatchedAt: timestamp("dispatched_at", { withTimezone: true }).notNull(),
    dispatchedByApplicationUserId: uuid(
      "dispatched_by_application_user_id",
    ).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("item_issue_shipments_item_issue_id_uidx").on(table.itemIssueId),
    index("item_issue_shipments_to_store_id_idx").on(table.toStoreId),
    index("item_issue_shipments_delivery_status_idx").on(table.deliveryStatus),
    index("item_issue_shipments_request_id_idx").on(table.requestId),
    foreignKey({
      columns: [table.itemIssueId],
      foreignColumns: [itemIssues.id],
      name: "item_issue_shipments_item_issue_id_fk",
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({
      columns: [table.requestId],
      foreignColumns: [itemRequests.id],
      name: "item_issue_shipments_request_id_fk",
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({
      columns: [table.fromStoreId],
      foreignColumns: [stores.id],
      name: "item_issue_shipments_from_store_id_fk",
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({
      columns: [table.toStoreId],
      foreignColumns: [stores.id],
      name: "item_issue_shipments_to_store_id_fk",
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({
      columns: [table.dispatchedByApplicationUserId],
      foreignColumns: [applicationUsers.id],
      name: "item_issue_shipments_dispatched_by_fk",
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    check(
      "item_issue_shipments_stores_differ",
      sql`${table.fromStoreId} <> ${table.toStoreId}`,
    ),
  ],
);

export const itemIssueShipmentLines = pgTable(
  "item_issue_shipment_lines",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    shipmentId: uuid("shipment_id").notNull(),
    itemIssueLineId: uuid("item_issue_line_id").notNull(),
    itemId: uuid("item_id").notNull(),
    unitId: uuid("unit_id").notNull(),
    dispatchedQuantity: numeric("dispatched_quantity", {
      precision: 18,
      scale: 4,
    }).notNull(),
    confirmedReceivedQuantity: numeric("confirmed_received_quantity", {
      precision: 18,
      scale: 4,
    })
      .notNull()
      .default("0"),
    remainingInTransitQuantity: numeric("remaining_in_transit_quantity", {
      precision: 18,
      scale: 4,
    }).notNull(),
    discrepancyQuantity: numeric("discrepancy_quantity", {
      precision: 18,
      scale: 4,
    })
      .notNull()
      .default("0"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("item_issue_shipment_lines_issue_line_uidx").on(
      table.itemIssueLineId,
    ),
    uniqueIndex("item_issue_shipment_lines_shipment_item_uidx").on(
      table.shipmentId,
      table.itemId,
    ),
    index("item_issue_shipment_lines_shipment_id_idx").on(table.shipmentId),
    foreignKey({
      columns: [table.shipmentId],
      foreignColumns: [itemIssueShipments.id],
      name: "item_issue_shipment_lines_shipment_id_fk",
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({
      columns: [table.itemIssueLineId],
      foreignColumns: [itemIssueLines.id],
      name: "item_issue_shipment_lines_issue_line_id_fk",
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({
      columns: [table.itemId],
      foreignColumns: [items.id],
      name: "item_issue_shipment_lines_item_id_fk",
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({
      columns: [table.unitId],
      foreignColumns: [units.id],
      name: "item_issue_shipment_lines_unit_id_fk",
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    check(
      "item_issue_shipment_lines_quantities",
      sql`${table.dispatchedQuantity} > 0
        and ${table.confirmedReceivedQuantity} >= 0
        and ${table.remainingInTransitQuantity} >= 0
        and ${table.discrepancyQuantity} >= 0
        and ${table.confirmedReceivedQuantity} + ${table.remainingInTransitQuantity} + ${table.discrepancyQuantity} = ${table.dispatchedQuantity}`,
    ),
  ],
);

export const itemIssueReceipts = pgTable(
  "item_issue_receipts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    shipmentId: uuid("shipment_id").notNull(),
    status: itemIssueReceiptStatusEnum("status").notNull().default("DRAFT"),
    version: integer("version").notNull().default(1),
    receiptDate: timestamp("receipt_date", { withTimezone: true }).notNull(),
    remarks: varchar("remarks", { length: 500 }),
    discrepancyResolution: itemIssueDiscrepancyResolutionEnum(
      "discrepancy_resolution",
    ),
    createdByApplicationUserId: uuid(
      "created_by_application_user_id",
    ).notNull(),
    submittedByApplicationUserId: uuid("submitted_by_application_user_id"),
    verifiedByApplicationUserId: uuid("verified_by_application_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    confirmedWorkflowRole: itemRequestWorkflowRoleEnum(
      "confirmed_workflow_role",
    ),
  },
  (table) => [
    index("item_issue_receipts_shipment_id_idx").on(table.shipmentId),
    index("item_issue_receipts_status_idx").on(table.status),
    uniqueIndex("item_issue_receipts_one_open_per_shipment_uidx")
      .on(table.shipmentId)
      .where(
        sql`${table.status} in ('DRAFT', 'PENDING_VERIFICATION', 'RETURNED')`,
      ),
    foreignKey({
      columns: [table.shipmentId],
      foreignColumns: [itemIssueShipments.id],
      name: "item_issue_receipts_shipment_id_fk",
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({
      columns: [table.createdByApplicationUserId],
      foreignColumns: [applicationUsers.id],
      name: "item_issue_receipts_created_by_fk",
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({
      columns: [table.submittedByApplicationUserId],
      foreignColumns: [applicationUsers.id],
      name: "item_issue_receipts_submitted_by_fk",
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({
      columns: [table.verifiedByApplicationUserId],
      foreignColumns: [applicationUsers.id],
      name: "item_issue_receipts_verified_by_fk",
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    check("item_issue_receipts_version_positive", sql`${table.version} >= 1`),
  ],
);

export const itemIssueReceiptLines = pgTable(
  "item_issue_receipt_lines",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    receiptId: uuid("receipt_id").notNull(),
    shipmentLineId: uuid("shipment_line_id").notNull(),
    receivedQuantityNow: numeric("received_quantity_now", {
      precision: 18,
      scale: 4,
    }).notNull(),
    missingQuantity: numeric("missing_quantity", {
      precision: 18,
      scale: 4,
    })
      .notNull()
      .default("0"),
    damagedQuantity: numeric("damaged_quantity", {
      precision: 18,
      scale: 4,
    })
      .notNull()
      .default("0"),
    excessQuantity: numeric("excess_quantity", {
      precision: 18,
      scale: 4,
    })
      .notNull()
      .default("0"),
    discrepancyReason: itemIssueDiscrepancyReasonEnum("discrepancy_reason"),
    remarks: varchar("remarks", { length: 500 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("item_issue_receipt_lines_receipt_shipment_line_uidx").on(
      table.receiptId,
      table.shipmentLineId,
    ),
    index("item_issue_receipt_lines_receipt_id_idx").on(table.receiptId),
    foreignKey({
      columns: [table.receiptId],
      foreignColumns: [itemIssueReceipts.id],
      name: "item_issue_receipt_lines_receipt_id_fk",
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({
      columns: [table.shipmentLineId],
      foreignColumns: [itemIssueShipmentLines.id],
      name: "item_issue_receipt_lines_shipment_line_id_fk",
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    check(
      "item_issue_receipt_lines_quantities",
      sql`${table.receivedQuantityNow} > 0
        and ${table.missingQuantity} >= 0
        and ${table.damagedQuantity} >= 0
        and ${table.excessQuantity} >= 0`,
    ),
  ],
);

export const itemIssueReceiptActions = pgTable(
  "item_issue_receipt_actions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    receiptId: uuid("receipt_id").notNull(),
    action: itemIssueReceiptActionEnum("action").notNull(),
    fromStatus: itemIssueReceiptStatusEnum("from_status"),
    toStatus: itemIssueReceiptStatusEnum("to_status").notNull(),
    actorApplicationUserId: uuid("actor_application_user_id").notNull(),
    actorWorkflowRole: itemRequestWorkflowRoleEnum(
      "actor_workflow_role",
    ).notNull(),
    remarks: varchar("remarks", { length: 500 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("item_issue_receipt_actions_receipt_id_created_at_idx").on(
      table.receiptId,
      table.createdAt,
    ),
    foreignKey({
      columns: [table.receiptId],
      foreignColumns: [itemIssueReceipts.id],
      name: "item_issue_receipt_actions_receipt_id_fk",
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({
      columns: [table.actorApplicationUserId],
      foreignColumns: [applicationUsers.id],
      name: "item_issue_receipt_actions_actor_fk",
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
  ],
);

export const itemIssueDiscrepancies = pgTable(
  "item_issue_discrepancies",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    shipmentLineId: uuid("shipment_line_id").notNull(),
    receiptId: uuid("receipt_id").notNull(),
    itemIssueId: uuid("item_issue_id").notNull(),
    quantity: numeric("quantity", { precision: 18, scale: 4 }).notNull(),
    reason: itemIssueDiscrepancyReasonEnum("reason").notNull(),
    status: itemIssueDiscrepancyStatusEnum("status").notNull().default("OPEN"),
    remarks: varchar("remarks", { length: 500 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("item_issue_discrepancies_shipment_line_id_idx").on(
      table.shipmentLineId,
    ),
    index("item_issue_discrepancies_item_issue_id_idx").on(table.itemIssueId),
    uniqueIndex("item_issue_discrepancies_receipt_line_reason_uidx").on(
      table.receiptId,
      table.shipmentLineId,
      table.reason,
    ),
    foreignKey({
      columns: [table.shipmentLineId],
      foreignColumns: [itemIssueShipmentLines.id],
      name: "item_issue_discrepancies_shipment_line_id_fk",
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({
      columns: [table.receiptId],
      foreignColumns: [itemIssueReceipts.id],
      name: "item_issue_discrepancies_receipt_id_fk",
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({
      columns: [table.itemIssueId],
      foreignColumns: [itemIssues.id],
      name: "item_issue_discrepancies_item_issue_id_fk",
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    check("item_issue_discrepancies_quantity_positive", sql`${table.quantity} > 0`),
  ],
);

export const departmentConsumptions = pgTable(
  "department_consumptions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    itemIssueId: uuid("item_issue_id").notNull(),
    departmentId: uuid("department_id").notNull(),
    consumptionDescription: varchar("consumption_description", {
      length: 500,
    }).notNull(),
    consumedByEmployeeId: uuid("consumed_by_employee_id"),
    issueDate: timestamp("issue_date", { withTimezone: true }).notNull(),
    createdByApplicationUserId: uuid(
      "created_by_application_user_id",
    ).notNull(),
    verifiedByApplicationUserId: uuid(
      "verified_by_application_user_id",
    ).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("department_consumptions_item_issue_id_uidx").on(
      table.itemIssueId,
    ),
    index("department_consumptions_department_id_idx").on(table.departmentId),
    index("department_consumptions_issue_date_idx").on(table.issueDate),
    foreignKey({
      columns: [table.itemIssueId],
      foreignColumns: [itemIssues.id],
      name: "department_consumptions_item_issue_id_fk",
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({
      columns: [table.departmentId],
      foreignColumns: [departments.id],
      name: "department_consumptions_department_id_fk",
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({
      columns: [table.consumedByEmployeeId],
      foreignColumns: [employees.id],
      name: "department_consumptions_consumed_by_fk",
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({
      columns: [table.createdByApplicationUserId],
      foreignColumns: [applicationUsers.id],
      name: "department_consumptions_created_by_fk",
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({
      columns: [table.verifiedByApplicationUserId],
      foreignColumns: [applicationUsers.id],
      name: "department_consumptions_verified_by_fk",
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
  ],
);

export const departmentConsumptionLines = pgTable(
  "department_consumption_lines",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    departmentConsumptionId: uuid("department_consumption_id").notNull(),
    itemIssueLineId: uuid("item_issue_line_id").notNull(),
    itemId: uuid("item_id").notNull(),
    unitId: uuid("unit_id").notNull(),
    quantity: numeric("quantity", { precision: 18, scale: 4 }).notNull(),
    unitCost: numeric("unit_cost", { precision: 18, scale: 4 }).notNull(),
    totalCost: numeric("total_cost", { precision: 18, scale: 2 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("department_consumption_lines_issue_line_uidx").on(
      table.itemIssueLineId,
    ),
    index("department_consumption_lines_consumption_id_idx").on(
      table.departmentConsumptionId,
    ),
    foreignKey({
      columns: [table.departmentConsumptionId],
      foreignColumns: [departmentConsumptions.id],
      name: "department_consumption_lines_consumption_id_fk",
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({
      columns: [table.itemIssueLineId],
      foreignColumns: [itemIssueLines.id],
      name: "department_consumption_lines_issue_line_id_fk",
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({
      columns: [table.itemId],
      foreignColumns: [items.id],
      name: "department_consumption_lines_item_id_fk",
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({
      columns: [table.unitId],
      foreignColumns: [units.id],
      name: "department_consumption_lines_unit_id_fk",
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    check(
      "department_consumption_lines_quantity_positive",
      sql`${table.quantity} > 0`,
    ),
  ],
);

export type ItemIssueShipmentRow = typeof itemIssueShipments.$inferSelect;
export type ItemIssueShipmentLineRow = typeof itemIssueShipmentLines.$inferSelect;
export type ItemIssueReceiptRow = typeof itemIssueReceipts.$inferSelect;
export type ItemIssueReceiptLineRow = typeof itemIssueReceiptLines.$inferSelect;
export type DepartmentConsumptionRow = typeof departmentConsumptions.$inferSelect;
export type DepartmentConsumptionLineRow =
  typeof departmentConsumptionLines.$inferSelect;
