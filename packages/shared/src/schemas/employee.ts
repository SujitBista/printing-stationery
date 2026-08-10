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
