import { z } from "zod";

export const unitStatusFilterSchema = z.enum(["ALL", "ACTIVE", "INACTIVE"]);

const unitNameSchema = z
  .string()
  .trim()
  .min(2, "Unit name must be between 2 and 100 characters")
  .max(100, "Unit name must be between 2 and 100 characters");

export const unitSchema = z.object({
  id: z.string().uuid(),
  unitName: z.string(),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const createUnitInputSchema = z
  .object({
    unitName: unitNameSchema,
    isActive: z.boolean().optional().default(true),
  })
  .strict();

export const updateUnitInputSchema = z
  .object({
    unitName: unitNameSchema,
  })
  .strict();

export const updateUnitStatusInputSchema = z
  .object({
    isActive: z.boolean(),
  })
  .strict();

export const unitListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  search: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined)),
  status: unitStatusFilterSchema.default("ALL"),
});

export const paginatedUnitResponseSchema = z.object({
  items: z.array(unitSchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

export const unitIdSchema = z.string().uuid("Invalid unit id");

export const UNIT_IMPORT_MAX_ROWS = 500;

export const unitImportReadyRowSchema = z.object({
  rowNumber: z.number().int().positive(),
  unitName: z.string(),
  isActive: z.boolean(),
});

export const unitImportExistingRowSchema = z.object({
  rowNumber: z.number().int().positive(),
  unitName: z.string(),
});

export const unitImportDuplicateNameSchema = z.object({
  unitName: z.string(),
  rowNumbers: z.array(z.number().int().positive()).min(2),
});

export const unitImportInvalidRowSchema = z.object({
  rowNumber: z.number().int().positive(),
  reason: z.string(),
});

export const unitImportPreviewSummarySchema = z.object({
  totalRows: z.number().int().nonnegative(),
  readyCount: z.number().int().nonnegative(),
  existingCount: z.number().int().nonnegative(),
  duplicateNameCount: z.number().int().nonnegative(),
  invalidRowCount: z.number().int().nonnegative(),
});

export const unitImportPreviewResponseSchema = z.object({
  ready: z.array(unitImportReadyRowSchema),
  existing: z.array(unitImportExistingRowSchema),
  duplicateNames: z.array(unitImportDuplicateNameSchema),
  invalidRows: z.array(unitImportInvalidRowSchema),
  summary: unitImportPreviewSummarySchema,
});

export const unitImportConfirmUnitSchema = z.object({
  unitName: unitNameSchema,
  isActive: z.boolean().optional().default(true),
});

export const unitImportConfirmInputSchema = z.object({
  units: z
    .array(unitImportConfirmUnitSchema)
    .min(1, "Select at least one unit to import")
    .max(
      UNIT_IMPORT_MAX_ROWS,
      `Cannot import more than ${UNIT_IMPORT_MAX_ROWS} units at once`,
    ),
});

export const unitImportConfirmResponseSchema = z.object({
  importedCount: z.number().int().nonnegative(),
  skippedExistingCount: z.number().int().nonnegative(),
});
