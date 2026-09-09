import { sql } from "drizzle-orm";
import {
  check,
  date,
  foreignKey,
  index,
  integer,
  numeric,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { applicationUsers } from "./auth.js";
import { items } from "./items.js";
import { itemRequests } from "./item-requests.js";
import { parties } from "./parties.js";
import { stores } from "./stores.js";

export const purchases = pgTable(
  "purchases",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    purchaseNumber: varchar("purchase_number", { length: 40 })
      .notNull()
      .default(sql`nextval('purchase_number_seq')::text`),
    fiscalYear: varchar("fiscal_year", { length: 9 }).notNull(),
    purchaseDate: date("purchase_date", { mode: "string" }).notNull(),
    purchaseBillDate: date("purchase_bill_date", { mode: "string" }).notNull(),
    storeId: uuid("store_id").notNull(),
    partyId: uuid("party_id").notNull(),
    totalAmount: numeric("total_amount", { precision: 18, scale: 4 }).notNull(),
    poNumber: varchar("po_number", { length: 80 }),
    grnNumber: varchar("grn_number", { length: 80 }),
    deliveryNoteNumber: varchar("delivery_note_number", { length: 80 }),
    purchaseBillNumber: varchar("purchase_bill_number", { length: 80 }),
    itemRequestId: uuid("item_request_id"),
    remarks: varchar("remarks", { length: 500 }),
    createdByApplicationUserId: uuid(
      "created_by_application_user_id",
    ).notNull(),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("purchases_purchase_number_uidx").on(table.purchaseNumber),
    index("purchases_store_id_idx").on(table.storeId),
    index("purchases_party_id_idx").on(table.partyId),
    index("purchases_fiscal_year_idx").on(table.fiscalYear),
    index("purchases_purchase_date_idx").on(table.purchaseDate),
    index("purchases_item_request_id_idx").on(table.itemRequestId),
    index("purchases_created_by_application_user_id_idx").on(
      table.createdByApplicationUserId,
    ),
    foreignKey({
      columns: [table.storeId],
      foreignColumns: [stores.id],
      name: "purchases_store_id_fk",
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({
      columns: [table.partyId],
      foreignColumns: [parties.id],
      name: "purchases_party_id_fk",
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({
      columns: [table.itemRequestId],
      foreignColumns: [itemRequests.id],
      name: "purchases_item_request_id_fk",
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({
      columns: [table.createdByApplicationUserId],
      foreignColumns: [applicationUsers.id],
      name: "purchases_created_by_application_user_id_fk",
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    check("purchases_version_positive", sql`${table.version} >= 1`),
    check("purchases_total_amount_nonnegative", sql`${table.totalAmount} >= 0`),
    check(
      "purchases_fiscal_year_format",
      sql`${table.fiscalYear} ~ '^[0-9]{4}-[0-9]{4}$'`,
    ),
  ],
);

export const purchaseLines = pgTable(
  "purchase_lines",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    purchaseId: uuid("purchase_id").notNull(),
    itemId: uuid("item_id").notNull(),
    quantity: numeric("quantity", { precision: 18, scale: 4 }).notNull(),
    rate: numeric("rate", { precision: 18, scale: 4 }).notNull(),
    amount: numeric("amount", { precision: 18, scale: 4 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("purchase_lines_purchase_item_uidx").on(
      table.purchaseId,
      table.itemId,
    ),
    index("purchase_lines_purchase_id_idx").on(table.purchaseId),
    index("purchase_lines_item_id_idx").on(table.itemId),
    foreignKey({
      columns: [table.purchaseId],
      foreignColumns: [purchases.id],
      name: "purchase_lines_purchase_id_fk",
    })
      .onDelete("cascade")
      .onUpdate("restrict"),
    foreignKey({
      columns: [table.itemId],
      foreignColumns: [items.id],
      name: "purchase_lines_item_id_fk",
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    check("purchase_lines_quantity_positive", sql`${table.quantity} > 0`),
    check("purchase_lines_rate_nonnegative", sql`${table.rate} >= 0`),
    check("purchase_lines_amount_nonnegative", sql`${table.amount} >= 0`),
  ],
);

export type PurchaseRow = typeof purchases.$inferSelect;
export type NewPurchaseRow = typeof purchases.$inferInsert;
export type PurchaseLineRow = typeof purchaseLines.$inferSelect;
export type NewPurchaseLineRow = typeof purchaseLines.$inferInsert;
