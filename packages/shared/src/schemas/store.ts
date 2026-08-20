import { z } from "zod";

export const storeStatusFilterSchema = z.enum(["ALL", "ACTIVE", "INACTIVE"]);

export const storeHierarchyFilterSchema = z.enum([
  "ALL",
  "TOP_LEVEL",
  "NESTED",
]);

const storeCodeSchema = z
  .string()
  .trim()
  .min(1, "Store code must be between 1 and 30 characters")
  .max(30, "Store code must be between 1 and 30 characters");

const storeNameSchema = z
  .string()
  .trim()
  .min(2, "Store name must be between 2 and 150 characters")
  .max(150, "Store name must be between 2 and 150 characters");

const remarksInputSchema = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((value) => {
    if (value == null) {
      return null;
    }

    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  })
  .refine((value) => value === null || value.length <= 500, {
    message: "Remarks must be at most 500 characters",
  });

const underStoreIdRequiredSchema = z.preprocess(
  (value) => (value === "" ? null : value),
  z.union([z.string().uuid("Invalid under store id"), z.null()]),
);

const underStoreIdCreateSchema = z.preprocess(
  (value) => {
    if (value === "" || value === undefined) {
      return null;
    }
    return value;
  },
  z.union([z.string().uuid("Invalid under store id"), z.null()]),
);

const optionalUuidFilterSchema = z.preprocess(
  (value) => {
    if (value === "" || value === null || value === undefined) {
      return undefined;
    }
    return value;
  },
  z.string().uuid().optional(),
);

export const storeBranchSummarySchema = z.object({
  id: z.string().uuid(),
  branchCode: z.string(),
  branchName: z.string(),
  isActive: z.boolean(),
});

export const storeUnderStoreSummarySchema = z.object({
  id: z.string().uuid(),
  storeCode: z.string(),
  storeName: z.string(),
  branchId: z.string().uuid(),
  isActive: z.boolean(),
});

export const storeSchema = z.object({
  id: z.string().uuid(),
  storeCode: z.string(),
  storeName: z.string(),
  branchId: z.string().uuid(),
  underStoreId: z.string().uuid().nullable(),
  allowTransfer: z.boolean(),
  allowDepartmentIssue: z.boolean(),
  remarks: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  branch: storeBranchSummarySchema,
  underStore: storeUnderStoreSummarySchema.nullable(),
});

export const createStoreInputSchema = z
  .object({
    storeCode: storeCodeSchema,
    storeName: storeNameSchema,
    branchId: z.string().uuid("Invalid branch id"),
    underStoreId: underStoreIdCreateSchema.optional().default(null),
    allowTransfer: z.boolean().optional().default(false),
    allowDepartmentIssue: z.boolean().optional().default(false),
    remarks: remarksInputSchema,
    isActive: z.boolean().optional().default(true),
  })
  .strict();

export const updateStoreInputSchema = z
  .object({
    storeCode: storeCodeSchema,
    storeName: storeNameSchema,
    branchId: z.string().uuid("Invalid branch id"),
    underStoreId: underStoreIdRequiredSchema,
    allowTransfer: z.boolean(),
    allowDepartmentIssue: z.boolean(),
    remarks: remarksInputSchema,
  })
  .strict();

export const updateStoreStatusInputSchema = z
  .object({
    isActive: z.boolean(),
  })
  .strict();

export const storeListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  search: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined)),
  status: storeStatusFilterSchema.default("ALL"),
  branchId: optionalUuidFilterSchema,
  underStoreId: optionalUuidFilterSchema,
  hierarchy: storeHierarchyFilterSchema.default("ALL"),
});

export const paginatedStoreResponseSchema = z.object({
  items: z.array(storeSchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

export const storeIdSchema = z.string().uuid("Invalid store id");

export const STORE_IMPORT_MAX_ROWS = 500;

export const storeImportReadyRowSchema = z.object({
  rowNumber: z.number().int().positive(),
  storeCode: z.string(),
  storeName: z.string(),
  branchId: z.string().uuid(),
  branchName: z.string(),
  underStoreId: z.string().uuid().nullable(),
  underStoreName: z.string().nullable(),
  allowTransfer: z.boolean(),
  allowDepartmentIssue: z.boolean(),
  isActive: z.boolean(),
});

export const storeImportExistingRowSchema = z.object({
  rowNumber: z.number().int().positive(),
  storeCode: z.string(),
  storeName: z.string(),
});

export const storeImportDuplicateCodeSchema = z.object({
  storeCode: z.string(),
  rowNumbers: z.array(z.number().int().positive()).min(2),
});

export const storeImportUnknownBranchRowSchema = z.object({
  rowNumber: z.number().int().positive(),
  storeCode: z.string(),
  branchName: z.string(),
});

export const storeImportUnknownUnderStoreRowSchema = z.object({
  rowNumber: z.number().int().positive(),
  storeCode: z.string(),
  underStoreName: z.string(),
});

export const storeImportInvalidRowSchema = z.object({
  rowNumber: z.number().int().positive(),
  reason: z.string(),
});

export const storeImportPreviewSummarySchema = z.object({
  totalRows: z.number().int().nonnegative(),
  readyCount: z.number().int().nonnegative(),
  existingCount: z.number().int().nonnegative(),
  duplicateCodeCount: z.number().int().nonnegative(),
  unknownBranchCount: z.number().int().nonnegative(),
  unknownUnderStoreCount: z.number().int().nonnegative(),
  invalidRowCount: z.number().int().nonnegative(),
});

export const storeImportPreviewResponseSchema = z.object({
  ready: z.array(storeImportReadyRowSchema),
  existing: z.array(storeImportExistingRowSchema),
  duplicateCodes: z.array(storeImportDuplicateCodeSchema),
  unknownBranches: z.array(storeImportUnknownBranchRowSchema),
  unknownUnderStores: z.array(storeImportUnknownUnderStoreRowSchema),
  invalidRows: z.array(storeImportInvalidRowSchema),
  summary: storeImportPreviewSummarySchema,
});

export const storeImportConfirmStoreSchema = z
  .object({
    storeCode: storeCodeSchema,
    storeName: storeNameSchema,
    branchId: z.string().uuid("Invalid branch id"),
    underStoreId: underStoreIdCreateSchema.optional().default(null),
    underStoreName: z
      .union([z.string(), z.null(), z.undefined()])
      .transform((value) => {
        if (value == null) {
          return null;
        }
        const trimmed = value.trim();
        return trimmed.length === 0 ? null : trimmed;
      })
      .optional()
      .default(null),
    allowTransfer: z.boolean().optional().default(false),
    allowDepartmentIssue: z.boolean().optional().default(false),
    isActive: z.boolean().optional().default(true),
  })
  .strict();

export const storeImportConfirmInputSchema = z.object({
  stores: z
    .array(storeImportConfirmStoreSchema)
    .min(1, "Select at least one store to import")
    .max(
      STORE_IMPORT_MAX_ROWS,
      `Cannot import more than ${STORE_IMPORT_MAX_ROWS} stores at once`,
    ),
});

export const storeImportConfirmResponseSchema = z.object({
  importedCount: z.number().int().nonnegative(),
  skippedExistingCount: z.number().int().nonnegative(),
});

