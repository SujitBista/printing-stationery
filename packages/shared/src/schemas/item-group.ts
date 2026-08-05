import { z } from "zod";

export const itemGroupStatusFilterSchema = z.enum(["ALL", "ACTIVE", "INACTIVE"]);

export const groupTypeSchema = z.enum([
  "INVENTORY",
  "FIXED_ASSET",
  "SERVICES",
  "MAINTENANCE",
]);

const groupCodeSchema = z
  .string()
  .trim()
  .min(1, "Group code must be between 1 and 20 characters")
  .max(20, "Group code must be between 1 and 20 characters");

const groupNameSchema = z
  .string()
  .trim()
  .min(2, "Group name must be between 2 and 100 characters")
  .max(100, "Group name must be between 2 and 100 characters");

export const itemGroupSchema = z.object({
  id: z.string().uuid(),
  groupCode: z.string(),
  groupName: z.string(),
  groupType: groupTypeSchema,
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const createItemGroupInputSchema = z
  .object({
    groupCode: groupCodeSchema,
    groupName: groupNameSchema,
    groupType: groupTypeSchema,
    isActive: z.boolean().optional().default(true),
  })
  .strict();

export const updateItemGroupInputSchema = z
  .object({
    groupCode: groupCodeSchema,
    groupName: groupNameSchema,
    groupType: groupTypeSchema,
  })
  .strict();

export const updateItemGroupStatusInputSchema = z
  .object({
    isActive: z.boolean(),
  })
  .strict();

export const itemGroupListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  search: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined)),
  status: itemGroupStatusFilterSchema.default("ALL"),
});

export const paginatedItemGroupResponseSchema = z.object({
  items: z.array(itemGroupSchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

export const itemGroupIdSchema = z.string().uuid("Invalid item group id");
