import { z } from "zod";

export const employeeStatusFilterSchema = z.enum(["ALL", "ACTIVE", "INACTIVE"]);

const employeeCodeSchema = z
  .string()
  .trim()
  .min(1, "Employee code must be between 1 and 30 characters")
  .max(30, "Employee code must be between 1 and 30 characters");

const employeeNameSchema = z
  .string()
  .trim()
  .min(2, "Employee name must be between 2 and 150 characters")
  .max(150, "Employee name must be between 2 and 150 characters");

const optionalUuidFilterSchema = z.preprocess(
  (value) => {
    if (value === "" || value === null || value === undefined) {
      return undefined;
    }
    return value;
  },
  z.string().uuid().optional(),
);

export const employeeBranchSummarySchema = z.object({
  id: z.string().uuid(),
  branchCode: z.string(),
  branchName: z.string(),
  isActive: z.boolean(),
});

export const employeeSchema = z.object({
  id: z.string().uuid(),
  employeeCode: z.string(),
  employeeName: z.string(),
  branchId: z.string().uuid(),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  branch: employeeBranchSummarySchema,
});

export const createEmployeeInputSchema = z
  .object({
    employeeCode: employeeCodeSchema,
    employeeName: employeeNameSchema,
    branchId: z.string().uuid("Invalid branch id"),
    isActive: z.boolean().optional().default(true),
  })
  .strict();

export const updateEmployeeInputSchema = z
  .object({
    employeeCode: employeeCodeSchema,
    employeeName: employeeNameSchema,
    branchId: z.string().uuid("Invalid branch id"),
  })
  .strict();

export const updateEmployeeStatusInputSchema = z
  .object({
    isActive: z.boolean(),
  })
  .strict();

export const employeeListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  search: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined)),
  status: employeeStatusFilterSchema.default("ALL"),
  branchId: optionalUuidFilterSchema,
});

export const paginatedEmployeeResponseSchema = z.object({
  items: z.array(employeeSchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

export const employeeIdSchema = z.string().uuid("Invalid employee id");

/** Maximum data rows accepted from an HRIS employee workbook. */
export const EMPLOYEE_IMPORT_MAX_ROWS = 5000;

export const employeeImportReadyRowSchema = z.object({
  rowNumber: z.number().int().positive(),
  employeeCode: z.string(),
  employeeName: z.string(),
  branchId: z.string().uuid(),
  branchCode: z.string(),
  branchName: z.string(),
  isActive: z.boolean(),
});

export const employeeImportExistingRowSchema = z.object({
  rowNumber: z.number().int().positive(),
  employeeCode: z.string(),
  employeeName: z.string(),
});

export const employeeImportDuplicateCodeSchema = z.object({
  employeeCode: z.string(),
  rowNumbers: z.array(z.number().int().positive()).min(2),
});

export const employeeImportUnknownBranchRowSchema = z.object({
  rowNumber: z.number().int().positive(),
  employeeCode: z.string().optional(),
  branchCode: z.string().optional(),
  branchName: z.string().optional(),
});

export const employeeImportInvalidRowSchema = z.object({
  rowNumber: z.number().int().positive(),
  reason: z.string(),
});

export const employeeImportPreviewSummarySchema = z.object({
  totalRows: z.number().int().nonnegative(),
  readyCount: z.number().int().nonnegative(),
  existingCount: z.number().int().nonnegative(),
  duplicateCodeCount: z.number().int().nonnegative(),
  unknownBranchCount: z.number().int().nonnegative(),
  invalidRowCount: z.number().int().nonnegative(),
});

export const employeeImportPreviewResponseSchema = z.object({
  ready: z.array(employeeImportReadyRowSchema),
  existing: z.array(employeeImportExistingRowSchema),
  duplicateCodes: z.array(employeeImportDuplicateCodeSchema),
  unknownBranches: z.array(employeeImportUnknownBranchRowSchema),
  invalidRows: z.array(employeeImportInvalidRowSchema),
  summary: employeeImportPreviewSummarySchema,
});

export const employeeImportConfirmEmployeeSchema = z
  .object({
    employeeCode: employeeCodeSchema,
    employeeName: employeeNameSchema,
    branchId: z.string().uuid("Invalid branch id"),
    isActive: z.boolean().optional().default(true),
  })
  .strict();

export const employeeImportConfirmInputSchema = z
  .object({
    employees: z
      .array(employeeImportConfirmEmployeeSchema)
      .min(1, "Select at least one employee to import")
      .max(
        EMPLOYEE_IMPORT_MAX_ROWS,
        `Cannot import more than ${EMPLOYEE_IMPORT_MAX_ROWS} employees at once`,
      ),
  })
  .strict();

export const employeeImportConfirmResponseSchema = z.object({
  importedCount: z.number().int().nonnegative(),
  skippedExistingCount: z.number().int().nonnegative(),
});
