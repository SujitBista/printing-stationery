import { z } from "zod";

export const OPENING_STOCK_SOURCE_TYPES = ["MANUAL", "LEGACY_IMPORT"] as const;
export const OPENING_STOCK_BATCH_STATUSES = [
  "DRAFT",
  "VALIDATED",
  "POSTED",
  "FAILED",
  "CANCELLED",
] as const;
export const OPENING_STOCK_MAPPING_STATUSES = [
  "MAPPED",
  "UNMAPPED_STORE",
  "UNMAPPED_ITEM",
  "UNMAPPED_UNIT",
  "UNIT_MISMATCH",
  "AMBIGUOUS_STORE",
  "AMBIGUOUS_ITEM",
  "AMBIGUOUS_UNIT",
  "INVALID",
] as const;

export const openingStockSourceTypeSchema = z.enum(OPENING_STOCK_SOURCE_TYPES);
export const openingStockBatchStatusSchema = z.enum(OPENING_STOCK_BATCH_STATUSES);
export const openingStockMappingStatusSchema = z.enum(
  OPENING_STOCK_MAPPING_STATUSES,
);

const decimalPattern = /^-?(?:0|[1-9]\d{0,17})(?:\.\d{1,4})?$/;
const nonNegativeDecimalPattern = /^(?:0|[1-9]\d{0,17})(?:\.\d{1,4})?$/;
const decimalMoneyPattern = /^-?(?:0|[1-9]\d{0,17})(?:\.\d{1,2})?$/;
const nonNegativeMoneyPattern = /^(?:0|[1-9]\d{0,17})(?:\.\d{1,2})?$/;

export const quantityStringSchema = z.string().refine((value) => decimalPattern.test(value), {
  message: "Quantity must be a valid decimal string with up to 4 decimal places",
});

export const nonNegativeQuantityStringSchema = z
  .string()
  .refine((value) => nonNegativeDecimalPattern.test(value), {
    message: "Quantity must be a valid non-negative decimal string with up to 4 decimal places",
  });

export const moneyStringSchema = z.string().refine((value) => decimalMoneyPattern.test(value), {
  message: "Amount must be a valid decimal string with up to 2 decimal places",
});

export const nonNegativeMoneyStringSchema = z
  .string()
  .refine((value) => nonNegativeMoneyPattern.test(value), {
    message: "Amount must be a valid non-negative decimal string with up to 2 decimal places",
  });

export const rateStringSchema = z
  .string()
  .refine((value) => nonNegativeDecimalPattern.test(value), {
    message: "Rate must be a valid non-negative decimal string with up to 4 decimal places",
  });

const optionalTrimmedStringSchema = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((value) => {
    if (value == null) {
      return null;
    }
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  });

const remarksSchema = optionalTrimmedStringSchema.refine(
  (value) => value === null || value.length <= 500,
  { message: "Remarks must be at most 500 characters" },
);

export const openingStockIdSchema = z.string().uuid("Invalid opening stock batch id");

export const openingStockListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  status: z.union([z.literal("ALL"), openingStockBatchStatusSchema]).default("ALL"),
  sourceType: z
    .union([z.literal("ALL"), openingStockSourceTypeSchema])
    .default("ALL"),
  search: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined)),
});

export const openingStockStoreSummarySchema = z.object({
  id: z.string().uuid(),
  storeCode: z.string(),
  storeName: z.string(),
  isActive: z.boolean(),
});

export const openingStockUnitSummarySchema = z.object({
  id: z.string().uuid(),
  unitName: z.string(),
  isActive: z.boolean(),
});

export const openingStockItemSummarySchema = z.object({
  id: z.string().uuid(),
  itemCode: z.string(),
  itemName: z.string(),
  isActive: z.boolean(),
  unit: openingStockUnitSummarySchema,
});

export const openingStockBatchSummarySchema = z.object({
  id: z.string().uuid(),
  batchNumber: z.string(),
  sourceType: openingStockSourceTypeSchema,
  sourceFilename: z.string().nullable(),
  sourceFileHash: z.string().nullable(),
  cutoverDate: z.string(),
  sourceReportFromDate: z.string().nullable(),
  sourceReportToDate: z.string().nullable(),
  status: openingStockBatchStatusSchema,
  remarks: z.string().nullable(),
  lineCount: z.number().int().nonnegative(),
  validLineCount: z.number().int().nonnegative(),
  postableLineCount: z.number().int().nonnegative(),
  createdAt: z.string(),
  updatedAt: z.string(),
  validatedAt: z.string().nullable(),
  postedAt: z.string().nullable(),
  createdBy: z.object({
    id: z.string().uuid(),
    username: z.string(),
  }),
});

export const paginatedOpeningStockResponseSchema = z.object({
  items: z.array(openingStockBatchSummarySchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

export const openingStockLegacyRowSchema = z.object({
  sourceRowNumber: z.number().int().positive(),
  legacyStoreName: z.string(),
  legacyCategoryName: z.string(),
  legacyItemName: z.string(),
  legacyUnitName: z.string(),
  itemRate: rateStringSchema,
  openingQuantity: quantityStringSchema,
  openingAmount: moneyStringSchema,
  purchaseQuantity: quantityStringSchema,
  purchaseAmount: moneyStringSchema,
  receivedQuantity: quantityStringSchema,
  receivedAmount: moneyStringSchema,
  consumptionQuantity: quantityStringSchema,
  consumptionAmount: moneyStringSchema,
  transferQuantity: quantityStringSchema,
  transferAmount: moneyStringSchema,
  inTransitQuantity: quantityStringSchema,
  inTransitAmount: moneyStringSchema,
  closingQuantity: quantityStringSchema,
  closingAmount: moneyStringSchema,
});

export const openingStockBatchLineSchema = openingStockLegacyRowSchema.extend({
  id: z.string().uuid(),
  storeId: z.string().uuid().nullable(),
  itemId: z.string().uuid().nullable(),
  unitId: z.string().uuid().nullable(),
  mappingStatus: openingStockMappingStatusSchema,
  validationErrors: z.array(z.string()),
  isIncludedForPosting: z.boolean(),
  store: openingStockStoreSummarySchema.nullable(),
  item: openingStockItemSummarySchema.nullable(),
  unit: openingStockUnitSummarySchema.nullable(),
});

export const openingStockPreviewSummarySchema = z.object({
  sourceFilename: z.string().nullable(),
  sourceFileHash: z.string().nullable(),
  reportTitle: z.string().nullable(),
  sourceReportFromDate: z.string().nullable(),
  sourceReportToDate: z.string().nullable(),
  cutoverDate: z.string(),
  isHistoricalCutover: z.boolean(),
  totalStoreCount: z.number().int().nonnegative(),
  totalDetailRowCount: z.number().int().nonnegative(),
  mappedRowCount: z.number().int().nonnegative(),
  unmappedStoreCount: z.number().int().nonnegative(),
  unmappedItemCount: z.number().int().nonnegative(),
  unmappedUnitCount: z.number().int().nonnegative(),
  invalidNumericRowCount: z.number().int().nonnegative(),
  duplicateSourceRowCount: z.number().int().nonnegative(),
  zeroClosingRowCount: z.number().int().nonnegative(),
  negativeClosingRowCount: z.number().int().nonnegative(),
  inTransitRowCount: z.number().int().nonnegative(),
  reconciliationErrorCount: z.number().int().nonnegative(),
  fileAlreadyImported: z.boolean(),
  warningMessages: z.array(z.string()),
});

export const openingStockPreviewSchema = z.object({
  batch: openingStockBatchSummarySchema,
  summary: openingStockPreviewSummarySchema,
  lines: z.array(openingStockBatchLineSchema),
});

export const manualOpeningStockLineInputSchema = z.object({
  itemId: z.string().uuid("Invalid item id"),
  rate: rateStringSchema,
  quantity: nonNegativeQuantityStringSchema.refine((value) => /[1-9]/.test(value), {
    message: "Quantity must be greater than zero",
  }),
});

export const createManualOpeningStockInputSchema = z
  .object({
    storeId: z.string().uuid("Invalid store id"),
    cutoverDate: z.string().date("Invalid cutover date"),
    remarks: remarksSchema,
    lines: z.array(manualOpeningStockLineInputSchema).min(1, "At least one line is required"),
  })
  .strict();

export const openingStockMappingChoiceSchema = z
  .object({
    lineId: z.string().uuid("Invalid line id"),
    storeId: z.string().uuid().nullable().optional(),
    itemId: z.string().uuid().nullable().optional(),
    unitId: z.string().uuid().nullable().optional(),
    includeInPosting: z.boolean().optional(),
  })
  .strict();

export const updateOpeningStockMappingsInputSchema = z
  .object({
    mappings: z
      .array(openingStockMappingChoiceSchema)
      .min(1, "At least one mapping change is required"),
  })
  .strict();

export const validateOpeningStockInputSchema = z
  .object({
    expectedStatus: openingStockBatchStatusSchema.optional(),
  })
  .strict();

export const postOpeningStockInputSchema = z
  .object({
    expectedStatus: openingStockBatchStatusSchema.optional(),
    confirmHistoricalCutover: z.boolean().default(false),
  })
  .strict();

export const cancelOpeningStockInputSchema = z
  .object({
    remarks: remarksSchema,
  })
  .strict();

export const openingStockValidationResultSchema = z.object({
  batch: openingStockBatchSummarySchema,
  summary: openingStockPreviewSummarySchema,
  canPost: z.boolean(),
});

export const openingStockPostResultSchema = z.object({
  batch: openingStockBatchSummarySchema,
  postedLedgerLineCount: z.number().int().nonnegative(),
  postedBalanceGroupCount: z.number().int().nonnegative(),
});
