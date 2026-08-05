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
