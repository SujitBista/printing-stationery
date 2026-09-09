import { z } from "zod";
import { multiplyDecimalStrings } from "../decimal-amount.js";
import { isNepaliFiscalYear } from "../nepali-fiscal-year.js";
import { itemUnitSummarySchema } from "./item.js";
import { itemRequestPersonSummarySchema } from "./item-request.js";

const QUANTITY_PATTERN = /^(?:0|[1-9]\d{0,13})(?:\.\d{1,4})?$/;
const RATE_PATTERN = /^(?:0|[1-9]\d{0,13})(?:\.\d{1,4})?$/;
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export const purchaseQuantitySchema = z
  .string({
    required_error: "Quantity is required",
    invalid_type_error: "Quantity must be a valid positive decimal string",
  })
  .refine((value) => QUANTITY_PATTERN.test(value), {
    message:
      "Quantity must be a valid positive decimal string with up to 14 integer digits and 4 fractional digits",
  })
  .refine((value) => /[1-9]/.test(value), {
    message: "Quantity must be greater than zero",
  });

export const purchaseRateSchema = z
  .string({
    required_error: "Rate is required",
    invalid_type_error: "Rate must be a valid non-negative decimal string",
  })
  .refine((value) => RATE_PATTERN.test(value), {
    message:
      "Rate must be a valid non-negative decimal string with up to 14 integer digits and 4 fractional digits",
  });

const optionalTrimmedStringSchema = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((value) => {
    if (value == null) {
      return null;
    }
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  });

const remarksSchema = optionalTrimmedStringSchema.refine(
  (value) => value === null || value.length <= 500,
  { message: "Remarks must be at most 500 characters" },
);

const optionalReferenceSchema = optionalTrimmedStringSchema.refine(
  (value) => value === null || value.length <= 80,
  { message: "This reference must be at most 80 characters" },
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

export const isoDateSchema = z
  .string({
    required_error: "Date is required",
    invalid_type_error: "Date must be YYYY-MM-DD",
  })
  .regex(ISO_DATE_PATTERN, "Date must be YYYY-MM-DD")
  .refine((value) => {
    const utc = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(utc.getTime()) && utc.toISOString().slice(0, 10) === value;
  }, "Date must be a valid calendar date");

export const nepaliFiscalYearSchema = z
  .string({
    required_error: "Fiscal year is required",
  })
  .trim()
  .refine(isNepaliFiscalYear, {
    message: "Fiscal year must be in the form 2083-2084",
  });

export const purchaseLineInputSchema = z
  .object({
    itemId: z.string().uuid("Invalid item id"),
    quantity: purchaseQuantitySchema,
    rate: purchaseRateSchema,
  })
  .strict();

function rejectDuplicateItemIds(
  lines: Array<{ itemId: string }>,
  ctx: z.RefinementCtx,
): void {
  const seen = new Set<string>();
  for (const [index, line] of lines.entries()) {
    if (seen.has(line.itemId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["lines", index, "itemId"],
        message: "The same item cannot appear twice in one purchase",
      });
    }
    seen.add(line.itemId);
  }
}

const purchaseHeaderInputShape = {
  storeId: z.string().uuid("Invalid store id"),
  partyId: z.string().uuid("Invalid party id"),
  purchaseDate: isoDateSchema,
  purchaseBillDate: isoDateSchema,
  poNumber: optionalReferenceSchema,
  grnNumber: optionalReferenceSchema,
  deliveryNoteNumber: optionalReferenceSchema,
  purchaseBillNumber: optionalReferenceSchema,
  remarks: remarksSchema,
  lines: z
    .array(purchaseLineInputSchema)
    .min(1, "At least one purchase line is required"),
};

export const createPurchaseInputSchema = z
  .object(purchaseHeaderInputShape)
  .strict()
  .superRefine((value, ctx) => {
    rejectDuplicateItemIds(value.lines, ctx);
  });

export const updatePurchaseInputSchema = z
  .object({
    ...purchaseHeaderInputShape,
    expectedVersion: z
      .number({
        required_error: "expectedVersion is required",
        invalid_type_error: "expectedVersion must be a positive integer",
      })
      .int()
      .positive(),
  })
  .strict()
  .superRefine((value, ctx) => {
    rejectDuplicateItemIds(value.lines, ctx);
  });

export const deletePurchaseInputSchema = z
  .object({
    expectedVersion: z
      .number({
        required_error: "expectedVersion is required",
        invalid_type_error: "expectedVersion must be a positive integer",
      })
      .int()
      .positive(),
  })
  .strict();

export const purchaseIdSchema = z.string().uuid("Invalid purchase id");

export const purchaseListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  search: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined)),
  storeId: optionalUuidFilterSchema,
  partyId: optionalUuidFilterSchema,
  fiscalYear: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined))
    .refine((value) => value === undefined || isNepaliFiscalYear(value), {
      message: "Fiscal year must be in the form 2083-2084",
    }),
});

export const purchaseStoreSummarySchema = z.object({
  id: z.string().uuid(),
  storeCode: z.string(),
  storeName: z.string(),
  isActive: z.boolean(),
});

export const purchasePartySummarySchema = z.object({
  id: z.string().uuid(),
  partyCode: z.string(),
  partyName: z.string(),
  isActive: z.boolean(),
});

export const purchaseLineItemSummarySchema = z.object({
  id: z.string().uuid(),
  itemCode: z.string(),
  itemName: z.string(),
  isActive: z.boolean(),
  purchaseRate: z.string(),
  unit: itemUnitSummarySchema,
});

export const purchaseLineSchema = z.object({
  id: z.string().uuid(),
  itemId: z.string().uuid(),
  quantity: z.string(),
  rate: z.string(),
  amount: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  item: purchaseLineItemSummarySchema,
});

export const purchaseListItemSchema = z.object({
  id: z.string().uuid(),
  purchaseNumber: z.string(),
  fiscalYear: z.string(),
  purchaseDate: z.string(),
  purchaseBillDate: z.string(),
  store: purchaseStoreSummarySchema,
  party: purchasePartySummarySchema,
  totalAmount: z.string(),
  poNumber: z.string().nullable(),
  grnNumber: z.string().nullable(),
  deliveryNoteNumber: z.string().nullable(),
  purchaseBillNumber: z.string().nullable(),
  remarks: z.string().nullable(),
  createdBy: itemRequestPersonSummarySchema,
  version: z.number().int().positive(),
  createdAt: z.string(),
  updatedAt: z.string(),
  canEdit: z.boolean(),
  canDelete: z.boolean(),
});

export const purchaseSchema = purchaseListItemSchema.extend({
  storeId: z.string().uuid(),
  partyId: z.string().uuid(),
  createdByApplicationUserId: z.string().uuid(),
  lines: z.array(purchaseLineSchema),
});

export const paginatedPurchaseResponseSchema = z.object({
  items: z.array(purchaseListItemSchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
  canCreate: z.boolean(),
});

export function purchaseLineAmount(quantity: string, rate: string): string {
  return multiplyDecimalStrings(quantity, rate, 4);
}
