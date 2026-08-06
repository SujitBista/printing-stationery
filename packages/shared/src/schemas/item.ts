import { z } from "zod";
import { groupTypeSchema } from "./item-group.js";

export const itemStatusFilterSchema = z.enum(["ALL", "ACTIVE", "INACTIVE"]);

export const returnTypeSchema = z.enum(["RETURNABLE", "NON_RETURNABLE"]);

const itemCodeSchema = z
  .string()
  .trim()
  .min(1, "Item code must be between 1 and 30 characters")
  .max(30, "Item code must be between 1 and 30 characters");

const itemNameSchema = z
  .string()
  .trim()
  .min(2, "Item name must be between 2 and 150 characters")
  .max(150, "Item name must be between 2 and 150 characters");

const PURCHASE_RATE_PATTERN = /^(?:0|[1-9]\d{0,13})(?:\.\d{1,4})?$/;

const purchaseRateSchema = z
  .string({
    required_error: "Purchase rate is required",
    invalid_type_error: "Purchase rate must be a valid non-negative decimal string",
  })
  .refine((value) => PURCHASE_RATE_PATTERN.test(value), {
    message:
      "Purchase rate must be a valid non-negative decimal string with up to 14 integer digits and 4 fractional digits",
  });

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

const optionalUuidFilterSchema = z.preprocess(
  (value) => {
    if (value === "" || value === null || value === undefined) {
      return undefined;
    }
    return value;
  },
  z.string().uuid().optional(),
);

const optionalGroupTypeFilterSchema = z.preprocess(
  (value) => {
    if (value === "" || value === null || value === undefined) {
      return undefined;
    }
    return value;
  },
  groupTypeSchema.optional(),
);

export const itemUnitSummarySchema = z.object({
  id: z.string().uuid(),
  unitName: z.string(),
});

export const itemGroupSummarySchema = z.object({
  id: z.string().uuid(),
  groupCode: z.string(),
  groupName: z.string(),
  groupType: groupTypeSchema,
});

export const itemSchema = z.object({
  id: z.string().uuid(),
  itemCode: z.string(),
  itemName: z.string(),
  unitId: z.string().uuid(),
  itemGroupId: z.string().uuid(),
  returnType: returnTypeSchema,
  purchaseRate: z.string(),
  remarks: z.string().nullable(),
  isActive: z.boolean(),
  isRequestable: z.boolean(),
  isIssuable: z.boolean(),
  trackSerialNumber: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  unit: itemUnitSummarySchema,
  itemGroup: itemGroupSummarySchema,
});

export const createItemInputSchema = z
  .object({
    itemCode: itemCodeSchema,
    itemName: itemNameSchema,
    unitId: z.string().uuid("Invalid unit id"),
    itemGroupId: z.string().uuid("Invalid item group id"),
    returnType: returnTypeSchema.default("NON_RETURNABLE"),
    purchaseRate: purchaseRateSchema,
    remarks: remarksInputSchema,
    isActive: z.boolean().optional().default(true),
    isRequestable: z.boolean().optional().default(true),
    isIssuable: z.boolean().optional().default(true),
    trackSerialNumber: z.boolean().optional().default(false),
  })
  .strict();

export const updateItemInputSchema = z
  .object({
    itemCode: itemCodeSchema,
    itemName: itemNameSchema,
    unitId: z.string().uuid("Invalid unit id"),
    itemGroupId: z.string().uuid("Invalid item group id"),
    returnType: returnTypeSchema,
    purchaseRate: purchaseRateSchema,
    remarks: remarksInputSchema,
    isRequestable: z.boolean(),
    isIssuable: z.boolean(),
    trackSerialNumber: z.boolean(),
  })
  .strict();

export const updateItemStatusInputSchema = z
  .object({
    isActive: z.boolean(),
  })
  .strict();

export const itemListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  search: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined)),
  status: itemStatusFilterSchema.default("ALL"),
  unitId: optionalUuidFilterSchema,
  itemGroupId: optionalUuidFilterSchema,
  groupType: optionalGroupTypeFilterSchema,
});

export const paginatedItemResponseSchema = z.object({
  items: z.array(itemSchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

export const itemIdSchema = z.string().uuid("Invalid item id");
