import { z } from "zod";

export const branchTypeSchema = z.enum(["HEAD_OFFICE", "BRANCH"]);

export const branchStatusFilterSchema = z.enum(["ALL", "ACTIVE", "INACTIVE"]);

const branchCodeSchema = z
  .string()
  .transform((value) => value.trim().toUpperCase())
  .pipe(
    z
      .string()
      .min(2, "Branch code must be between 2 and 20 characters")
      .max(20, "Branch code must be between 2 and 20 characters")
      .regex(
        /^[A-Z0-9_-]+$/,
        "Branch code may only contain uppercase letters, numbers, hyphens and underscores",
      ),
  );

const branchNameSchema = z
  .string()
  .trim()
  .refine(
    (value) =>
      value === "-" || (value.length >= 2 && value.length <= 150),
    { message: "Branch name must be between 2 and 150 characters" },
  );

const addressInputSchema = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((value) => {
    if (value == null) {
      return null;
    }

    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  })
  .refine((value) => value === null || value.length <= 255, {
    message: "Address must be at most 255 characters",
  });

export const branchSchema = z.object({
  id: z.string().uuid(),
  branchCode: z.string(),
  branchName: z.string(),
  branchType: branchTypeSchema,
  address: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const createBranchInputSchema = z.object({
  branchCode: branchCodeSchema,
  branchName: branchNameSchema,
  branchType: branchTypeSchema,
  address: addressInputSchema,
  isActive: z.boolean().optional().default(true),
});

export const updateBranchInputSchema = z
  .object({
    branchCode: branchCodeSchema.optional(),
    branchName: branchNameSchema.optional(),
    branchType: branchTypeSchema.optional(),
    address: addressInputSchema.optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.branchCode !== undefined ||
      value.branchName !== undefined ||
      value.branchType !== undefined ||
      value.address !== undefined,
    {
      message: "At least one field must be provided",
    },
  );

export const updateBranchStatusInputSchema = z.object({
  isActive: z.boolean(),
});

export const branchListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  search: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined)),
  status: branchStatusFilterSchema.default("ALL"),
});

export const paginatedBranchResponseSchema = z.object({
  items: z.array(branchSchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

export const branchIdSchema = z.string().uuid("Invalid branch id");


export const BRANCH_IMPORT_MAX_ROWS = 500;

export const branchImportReadyRowSchema = z.object({
  rowNumber: z.number().int().positive(),
  branchCode: z.string(),
  branchName: z.string(),
  branchType: branchTypeSchema,
  address: z.string().nullable(),
  isActive: z.boolean(),
});

export const branchImportExistingRowSchema = z.object({
  rowNumber: z.number().int().positive(),
  branchCode: z.string(),
  branchName: z.string(),
});

export const branchImportDuplicateCodeSchema = z.object({
  branchCode: z.string(),
  rowNumbers: z.array(z.number().int().positive()).min(2),
});

export const branchImportInvalidRowSchema = z.object({
  rowNumber: z.number().int().positive(),
  reason: z.string(),
});

export const branchImportPreviewSummarySchema = z.object({
  totalRows: z.number().int().nonnegative(),
  readyCount: z.number().int().nonnegative(),
  existingCount: z.number().int().nonnegative(),
  duplicateCodeCount: z.number().int().nonnegative(),
  invalidRowCount: z.number().int().nonnegative(),
});

export const branchImportPreviewResponseSchema = z.object({
  ready: z.array(branchImportReadyRowSchema),
  existing: z.array(branchImportExistingRowSchema),
  duplicateCodes: z.array(branchImportDuplicateCodeSchema),
  invalidRows: z.array(branchImportInvalidRowSchema),
  summary: branchImportPreviewSummarySchema,
});

export const branchImportConfirmBranchSchema = z.object({
  branchCode: branchCodeSchema,
  branchName: branchNameSchema,
  branchType: branchTypeSchema,
  address: addressInputSchema,
  isActive: z.boolean().optional().default(true),
});

export const branchImportConfirmInputSchema = z.object({
  branches: z.array(branchImportConfirmBranchSchema).min(1, "Select at least one branch to import").max(
    BRANCH_IMPORT_MAX_ROWS,
    `Cannot import more than ${BRANCH_IMPORT_MAX_ROWS} branches at once`,
  ),
});

export const branchImportConfirmResponseSchema = z.object({
  importedCount: z.number().int().nonnegative(),
  skippedExistingCount: z.number().int().nonnegative(),
});
