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

