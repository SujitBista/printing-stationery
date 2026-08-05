import { z } from "zod";

export const departmentStatusFilterSchema = z.enum([
  "ALL",
  "ACTIVE",
  "INACTIVE",
]);

const departmentCodeSchema = z
  .string()
  .transform((value) => value.trim().toUpperCase())
  .pipe(
    z
      .string()
      .min(2, "Department code must be between 2 and 20 characters")
      .max(20, "Department code must be between 2 and 20 characters")
      .regex(
        /^[A-Z0-9_-]+$/,
        "Department code may only contain uppercase letters, numbers, hyphens and underscores",
      ),
  );

const departmentNameSchema = z
  .string()
  .trim()
  .min(2, "Department name must be between 2 and 150 characters")
  .max(150, "Department name must be between 2 and 150 characters");

export const departmentSchema = z.object({
  id: z.string().uuid(),
  departmentCode: z.string(),
  departmentName: z.string(),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const createDepartmentInputSchema = z
  .object({
    departmentCode: departmentCodeSchema,
    departmentName: departmentNameSchema,
    isActive: z.boolean().optional().default(true),
  })
  .strict();

export const updateDepartmentInputSchema = z
  .object({
    departmentCode: departmentCodeSchema.optional(),
    departmentName: departmentNameSchema.optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.departmentCode !== undefined || value.departmentName !== undefined,
    {
      message: "At least one field must be provided",
    },
  );

export const updateDepartmentStatusInputSchema = z
  .object({
    isActive: z.boolean(),
  })
  .strict();

export const departmentListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  search: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined)),
  status: departmentStatusFilterSchema.default("ALL"),
});

export const paginatedDepartmentResponseSchema = z.object({
  items: z.array(departmentSchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

export const departmentIdSchema = z.string().uuid("Invalid department id");
