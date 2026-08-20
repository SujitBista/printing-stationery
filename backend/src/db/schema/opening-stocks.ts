import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { applicationUsers } from "./auth.js";
import { items } from "./items.js";
import { stores } from "./stores.js";
import { units } from "./units.js";

export const openingStockSourceTypeEnum = pgEnum("opening_stock_source_type", [
  "MANUAL",
  "LEGACY_IMPORT",
]);

export const openingStockBatchStatusEnum = pgEnum("opening_stock_batch_status", [
  "DRAFT",
  "VALIDATED",
  "POSTED",
  "FAILED",
  "CANCELLED",
]);

export const openingStockMappingStatusEnum = pgEnum(
  "opening_stock_mapping_status",
  [
    "MAPPED",
    "UNMAPPED_STORE",
    "UNMAPPED_ITEM",
    "UNMAPPED_UNIT",
    "UNIT_MISMATCH",
    "AMBIGUOUS_STORE",
    "AMBIGUOUS_ITEM",
    "AMBIGUOUS_UNIT",
    "INVALID",
  ],
);

export const openingStockMappingEntityTypeEnum = pgEnum(
  "opening_stock_mapping_entity_type",
  ["STORE", "ITEM", "UNIT"],
);

export const stockLedgerMovementTypeEnum = pgEnum("stock_ledger_movement_type", [
  "OPENING_STOCK",
]);

export const stockLedgerReferenceTypeEnum = pgEnum("stock_ledger_reference_type", [
  "OPENING_STOCK",
]);

export const openingStockBatches = pgTable(
  "opening_stock_batches",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    batchNumber: varchar("batch_number", { length: 40 }).notNull(),
    sourceType: openingStockSourceTypeEnum("source_type").notNull(),
    sourceFilename: varchar("source_filename", { length: 255 }),
    sourceFileHash: varchar("source_file_hash", { length: 64 }),
    reportTitle: varchar("report_title", { length: 255 }),
    sourceReportFromDate: timestamp("source_report_from_date", {
      withTimezone: true,
    }),
    sourceReportToDate: timestamp("source_report_to_date", {
      withTimezone: true,
    }),
    cutoverDate: timestamp("cutover_date", { withTimezone: true }).notNull(),
    status: openingStockBatchStatusEnum("status").notNull().default("DRAFT"),
    remarks: varchar("remarks", { length: 500 }),
    createdByApplicationUserId: uuid("created_by_application_user_id").notNull(),
    validatedByApplicationUserId: uuid("validated_by_application_user_id"),
    validatedAt: timestamp("validated_at", { withTimezone: true }),
    postedByApplicationUserId: uuid("posted_by_application_user_id"),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    cancelledByApplicationUserId: uuid("cancelled_by_application_user_id"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("opening_stock_batches_batch_number_uidx").on(table.batchNumber),
    uniqueIndex("opening_stock_batches_source_file_hash_uidx")
      .on(table.sourceFileHash)
      .where(sql`${table.sourceFileHash} is not null`),
    index("opening_stock_batches_status_idx").on(table.status),
    index("opening_stock_batches_cutover_date_idx").on(table.cutoverDate),
    foreignKey({
      columns: [table.createdByApplicationUserId],
      foreignColumns: [applicationUsers.id],
      name: "opening_stock_batches_created_by_fk",
    }).onDelete("restrict").onUpdate("restrict"),
    foreignKey({
      columns: [table.validatedByApplicationUserId],
      foreignColumns: [applicationUsers.id],
      name: "opening_stock_batches_validated_by_fk",
    }).onDelete("restrict").onUpdate("restrict"),
    foreignKey({
      columns: [table.postedByApplicationUserId],
      foreignColumns: [applicationUsers.id],
      name: "opening_stock_batches_posted_by_fk",
    }).onDelete("restrict").onUpdate("restrict"),
    foreignKey({
      columns: [table.cancelledByApplicationUserId],
      foreignColumns: [applicationUsers.id],
      name: "opening_stock_batches_cancelled_by_fk",
    }).onDelete("restrict").onUpdate("restrict"),
  ],
);

export const openingStockLines = pgTable(
  "opening_stock_lines",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    openingStockBatchId: uuid("opening_stock_batch_id").notNull(),
    storeId: uuid("store_id"),
    itemId: uuid("item_id"),
    unitId: uuid("unit_id"),
    legacyStoreName: varchar("legacy_store_name", { length: 150 }).notNull(),
    legacyCategoryName: varchar("legacy_category_name", { length: 100 }).notNull(),
    legacyItemName: varchar("legacy_item_name", { length: 200 }).notNull(),
    legacyUnitName: varchar("legacy_unit_name", { length: 100 }).notNull(),
    itemRate: numeric("item_rate", { precision: 18, scale: 4 }).notNull(),
    sourceOpeningQuantity: numeric("source_opening_quantity", {
      precision: 18,
      scale: 4,
    }).notNull(),
    sourceOpeningAmount: numeric("source_opening_amount", {
      precision: 18,
      scale: 2,
    }).notNull(),
    sourcePurchaseQuantity: numeric("source_purchase_quantity", {
      precision: 18,
      scale: 4,
    }).notNull(),
    sourcePurchaseAmount: numeric("source_purchase_amount", {
      precision: 18,
      scale: 2,
    }).notNull(),
    sourceReceivedQuantity: numeric("source_received_quantity", {
      precision: 18,
      scale: 4,
    }).notNull(),
    sourceReceivedAmount: numeric("source_received_amount", {
      precision: 18,
      scale: 2,
    }).notNull(),
    sourceConsumptionQuantity: numeric("source_consumption_quantity", {
      precision: 18,
      scale: 4,
    }).notNull(),
    sourceConsumptionAmount: numeric("source_consumption_amount", {
      precision: 18,
      scale: 2,
    }).notNull(),
    sourceTransferQuantity: numeric("source_transfer_quantity", {
      precision: 18,
      scale: 4,
    }).notNull(),
    sourceTransferAmount: numeric("source_transfer_amount", {
      precision: 18,
      scale: 2,
    }).notNull(),
    sourceInTransitQuantity: numeric("source_in_transit_quantity", {
      precision: 18,
      scale: 4,
    }).notNull(),
    sourceInTransitAmount: numeric("source_in_transit_amount", {
      precision: 18,
      scale: 2,
    }).notNull(),
    openingQuantity: numeric("opening_quantity", {
      precision: 18,
      scale: 4,
    }).notNull(),
    openingAmount: numeric("opening_amount", {
      precision: 18,
      scale: 2,
    }).notNull(),
    mappingStatus: openingStockMappingStatusEnum("mapping_status")
      .notNull()
      .default("INVALID"),
    validationErrors: text("validation_errors")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    sourceRowNumber: numeric("source_row_number", { precision: 10, scale: 0 }).notNull(),
    isIncludedForPosting: boolean("is_included_for_posting").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("opening_stock_lines_batch_id_idx").on(table.openingStockBatchId),
    index("opening_stock_lines_store_id_idx").on(table.storeId),
    index("opening_stock_lines_item_id_idx").on(table.itemId),
    index("opening_stock_lines_unit_id_idx").on(table.unitId),
    uniqueIndex("opening_stock_lines_batch_source_row_uidx").on(
      table.openingStockBatchId,
      table.sourceRowNumber,
      table.legacyStoreName,
      table.legacyCategoryName,
      table.legacyItemName,
      table.legacyUnitName,
      table.itemRate,
    ),
    foreignKey({
      columns: [table.openingStockBatchId],
      foreignColumns: [openingStockBatches.id],
      name: "opening_stock_lines_batch_fk",
    }).onDelete("restrict").onUpdate("restrict"),
    foreignKey({
      columns: [table.storeId],
      foreignColumns: [stores.id],
      name: "opening_stock_lines_store_fk",
    }).onDelete("restrict").onUpdate("restrict"),
    foreignKey({
      columns: [table.itemId],
      foreignColumns: [items.id],
      name: "opening_stock_lines_item_fk",
    }).onDelete("restrict").onUpdate("restrict"),
    foreignKey({
      columns: [table.unitId],
      foreignColumns: [units.id],
      name: "opening_stock_lines_unit_fk",
    }).onDelete("restrict").onUpdate("restrict"),
    check(
      "opening_stock_lines_nonnegative_rate",
      sql`${table.itemRate} >= 0`,
    ),
  ],
);

export const openingStockNameMappings = pgTable(
  "opening_stock_name_mappings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    entityType: openingStockMappingEntityTypeEnum("entity_type").notNull(),
    legacyName: varchar("legacy_name", { length: 200 }).notNull(),
    normalizedLegacyName: varchar("normalized_legacy_name", { length: 200 }).notNull(),
    storeId: uuid("store_id"),
    itemId: uuid("item_id"),
    unitId: uuid("unit_id"),
    createdByApplicationUserId: uuid("created_by_application_user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("opening_stock_name_mappings_entity_name_uidx").on(
      table.entityType,
      table.normalizedLegacyName,
    ),
    foreignKey({
      columns: [table.storeId],
      foreignColumns: [stores.id],
      name: "opening_stock_name_mappings_store_fk",
    }).onDelete("restrict").onUpdate("restrict"),
    foreignKey({
      columns: [table.itemId],
      foreignColumns: [items.id],
      name: "opening_stock_name_mappings_item_fk",
    }).onDelete("restrict").onUpdate("restrict"),
    foreignKey({
      columns: [table.unitId],
      foreignColumns: [units.id],
      name: "opening_stock_name_mappings_unit_fk",
    }).onDelete("restrict").onUpdate("restrict"),
    foreignKey({
      columns: [table.createdByApplicationUserId],
      foreignColumns: [applicationUsers.id],
      name: "opening_stock_name_mappings_created_by_fk",
    }).onDelete("restrict").onUpdate("restrict"),
  ],
);

export const stockLedger = pgTable(
  "stock_ledger",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    storeId: uuid("store_id").notNull(),
    itemId: uuid("item_id").notNull(),
    unitId: uuid("unit_id").notNull(),
    rate: numeric("rate", { precision: 18, scale: 4 }).notNull(),
    movementType: stockLedgerMovementTypeEnum("movement_type").notNull(),
    quantityIn: numeric("quantity_in", { precision: 18, scale: 4 }).notNull(),
    quantityOut: numeric("quantity_out", { precision: 18, scale: 4 }).notNull(),
    amountIn: numeric("amount_in", { precision: 18, scale: 2 }).notNull(),
    amountOut: numeric("amount_out", { precision: 18, scale: 2 }).notNull(),
    transactionDate: timestamp("transaction_date", { withTimezone: true }).notNull(),
    referenceType: stockLedgerReferenceTypeEnum("reference_type").notNull(),
    referenceId: uuid("reference_id").notNull(),
    referenceLineId: uuid("reference_line_id").notNull(),
    postedByApplicationUserId: uuid("posted_by_application_user_id").notNull(),
    postedAt: timestamp("posted_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("stock_ledger_reference_line_uidx").on(
      table.referenceType,
      table.referenceLineId,
    ),
    index("stock_ledger_store_item_unit_idx").on(
      table.storeId,
      table.itemId,
      table.unitId,
    ),
    foreignKey({
      columns: [table.storeId],
      foreignColumns: [stores.id],
      name: "stock_ledger_store_fk",
    }).onDelete("restrict").onUpdate("restrict"),
    foreignKey({
      columns: [table.itemId],
      foreignColumns: [items.id],
      name: "stock_ledger_item_fk",
    }).onDelete("restrict").onUpdate("restrict"),
    foreignKey({
      columns: [table.unitId],
      foreignColumns: [units.id],
      name: "stock_ledger_unit_fk",
    }).onDelete("restrict").onUpdate("restrict"),
    foreignKey({
      columns: [table.referenceId],
      foreignColumns: [openingStockBatches.id],
      name: "stock_ledger_reference_batch_fk",
    }).onDelete("restrict").onUpdate("restrict"),
    foreignKey({
      columns: [table.referenceLineId],
      foreignColumns: [openingStockLines.id],
      name: "stock_ledger_reference_line_fk",
    }).onDelete("restrict").onUpdate("restrict"),
    foreignKey({
      columns: [table.postedByApplicationUserId],
      foreignColumns: [applicationUsers.id],
      name: "stock_ledger_posted_by_fk",
    }).onDelete("restrict").onUpdate("restrict"),
    check(
      "stock_ledger_nonnegative_values",
      sql`${table.quantityIn} >= 0 and ${table.quantityOut} >= 0 and ${table.amountIn} >= 0 and ${table.amountOut} >= 0`,
    ),
  ],
);

export type OpeningStockBatchRow = typeof openingStockBatches.$inferSelect;
export type NewOpeningStockBatchRow = typeof openingStockBatches.$inferInsert;
export type OpeningStockLineRow = typeof openingStockLines.$inferSelect;
export type NewOpeningStockLineRow = typeof openingStockLines.$inferInsert;
export type OpeningStockNameMappingRow = typeof openingStockNameMappings.$inferSelect;
export type NewOpeningStockNameMappingRow = typeof openingStockNameMappings.$inferInsert;
export type StockLedgerRow = typeof stockLedger.$inferSelect;
export type NewStockLedgerRow = typeof stockLedger.$inferInsert;
