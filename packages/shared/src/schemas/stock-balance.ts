import { z } from "zod";
import { itemRequestPersonSummarySchema } from "./item-request.js";
import { quantityStringSchema } from "./opening-stock.js";
import {
  STOCK_BALANCE_SORT_FIELDS,
  STOCK_LEDGER_CATEGORIES,
  STOCK_LEDGER_CATEGORY_FILTERS,
  STOCK_LEDGER_MOVEMENT_TYPES,
} from "../stock-balance.js";

const optionalUuidFilterSchema = z.preprocess(
  (value) => {
    if (value === "" || value === null || value === undefined) {
      return undefined;
    }
    return value;
  },
  z.string().uuid().optional(),
);

const optionalSearchSchema = z.preprocess(
  (value) => {
    if (value === "" || value === null || value === undefined) {
      return undefined;
    }
    if (typeof value !== "string") {
      return value;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  },
  z.string().max(150).optional(),
);

const booleanQuerySchema = z.preprocess((value) => {
  if (value === undefined || value === null || value === "") {
    return false;
  }
  if (value === true || value === "true" || value === "1") {
    return true;
  }
  if (value === false || value === "false" || value === "0") {
    return false;
  }
  return value;
}, z.boolean());

export const stockLedgerCategorySchema = z.enum(STOCK_LEDGER_CATEGORIES);
export const stockLedgerCategoryFilterSchema = z.enum(
  STOCK_LEDGER_CATEGORY_FILTERS,
);
export const stockLedgerMovementTypeSchema = z.enum(STOCK_LEDGER_MOVEMENT_TYPES);
export const stockBalanceSortBySchema = z.enum(STOCK_BALANCE_SORT_FIELDS);
export const stockBalanceSortOrderSchema = z.enum(["asc", "desc"]);

export const stockBalanceListQuerySchema = z.object({
  storeId: optionalUuidFilterSchema,
  branchId: optionalUuidFilterSchema,
  itemId: optionalUuidFilterSchema,
  itemGroupId: optionalUuidFilterSchema,
  search: optionalSearchSchema,
  includeZeroBalance: booleanQuerySchema.default(false),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  sortBy: stockBalanceSortBySchema.default("itemName"),
  sortOrder: stockBalanceSortOrderSchema.default("asc"),
});

export const stockLedgerListQuerySchema = z.object({
  storeId: z.string().uuid("Invalid store id"),
  itemId: z.string().uuid("Invalid item id"),
  unitId: z.string().uuid("Invalid unit id"),
  stockCategory: z.preprocess((value) => {
    if (value === "" || value === null || value === undefined) {
      return "ALL";
    }
    return value;
  }, stockLedgerCategoryFilterSchema.default("ALL")),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(50),
});

export const stockBalanceStoreOptionSchema = z.object({
  id: z.string().uuid(),
  storeCode: z.string(),
  storeName: z.string(),
  isActive: z.boolean(),
  branchId: z.string().uuid(),
  branchCode: z.string(),
  branchName: z.string(),
});

export const stockBalanceSchema = z.object({
  storeId: z.string().uuid(),
  storeCode: z.string(),
  storeName: z.string(),
  branchId: z.string().uuid(),
  branchCode: z.string(),
  branchName: z.string(),
  itemId: z.string().uuid(),
  itemCode: z.string(),
  itemName: z.string(),
  unitId: z.string().uuid(),
  unitName: z.string(),
  availableQuantity: quantityStringSchema,
  inTransitQuantity: quantityStringSchema,
  damagedQuantity: quantityStringSchema,
  discrepancyQuantity: quantityStringSchema,
  totalTrackedQuantity: quantityStringSchema,
  lastMovementAt: z.string(),
});

export const stockBalanceUnitSummarySchema = z.object({
  unitId: z.string().uuid(),
  unitName: z.string(),
  availableQuantity: quantityStringSchema,
  inTransitQuantity: quantityStringSchema,
  damagedQuantity: quantityStringSchema,
  discrepancyQuantity: quantityStringSchema,
  totalTrackedQuantity: quantityStringSchema,
  rowCount: z.number().int().nonnegative(),
});

export const stockBalanceSummarySchema = z.object({
  storeId: z.string().uuid(),
  itemId: z.string().uuid(),
  unitId: z.string().uuid(),
  availableQuantity: quantityStringSchema,
});

export const stockBalancePaginationSchema = z.object({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

export const stockBalanceEmptyReasonSchema = z.enum([
  "NONE",
  "NO_MOVEMENTS",
  "NO_MATCHES",
]);

export const stockBalanceResponseSchema = z.object({
  data: z.array(stockBalanceSchema),
  pagination: stockBalancePaginationSchema,
  summaryByUnit: z.array(stockBalanceUnitSummarySchema),
  visibleStores: z.array(stockBalanceStoreOptionSchema),
  canSelectStore: z.boolean(),
  lockedStoreId: z.string().uuid().nullable(),
  hasLedgerActivity: z.boolean(),
  emptyReason: stockBalanceEmptyReasonSchema,
});

export const stockLedgerStoreSummarySchema = z.object({
  id: z.string().uuid(),
  storeCode: z.string(),
  storeName: z.string(),
});

export const stockLedgerEntrySchema = z.object({
  id: z.string().uuid(),
  transactionDate: z.string(),
  createdAt: z.string(),
  movementType: stockLedgerMovementTypeSchema,
  stockCategory: stockLedgerCategorySchema,
  quantityIn: quantityStringSchema,
  quantityOut: quantityStringSchema,
  categoryRunningBalance: quantityStringSchema,
  referenceType: stockLedgerMovementTypeSchema,
  referenceId: z.string().uuid(),
  referenceLineId: z.string().uuid(),
  referenceNumber: z.string().nullable(),
  sourceStore: stockLedgerStoreSummarySchema.nullable(),
  sourceStoreLabel: z.string().nullable(),
  destinationStore: stockLedgerStoreSummarySchema.nullable(),
  departmentName: z.string().nullable(),
  remarks: z.string().nullable(),
  performedBy: itemRequestPersonSummarySchema,
  verifiedBy: itemRequestPersonSummarySchema.nullable(),
  sourceHref: z.string().nullable(),
  sourceKind: stockLedgerMovementTypeSchema,
});

export const stockLedgerItemContextSchema = z.object({
  storeId: z.string().uuid(),
  storeCode: z.string(),
  storeName: z.string(),
  branchName: z.string(),
  itemId: z.string().uuid(),
  itemCode: z.string(),
  itemName: z.string(),
  unitId: z.string().uuid(),
  unitName: z.string(),
});

export const stockLedgerResponseSchema = z.object({
  context: stockLedgerItemContextSchema,
  items: z.array(stockLedgerEntrySchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});
