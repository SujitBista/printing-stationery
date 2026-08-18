import { z } from "zod";
import {
  itemRequestIdSchema,
  itemRequestLineSchema,
  itemRequestPersonSummarySchema,
  itemRequestStatusSchema,
  itemRequestStoreSummarySchema,
  itemRequestUnitSummarySchema,
  requestedQuantitySchema,
} from "./item-request.js";

export const ITEM_ISSUE_STATUSES = ["DRAFT", "SUBMITTED"] as const;

export const itemIssueStatusSchema = z.enum(ITEM_ISSUE_STATUSES);

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

export const issueQuantitySchema = requestedQuantitySchema.refine(
  (value) => /[1-9]/.test(value),
  {
    message: "Issue quantity must be greater than zero",
  },
);

export const itemIssueLineInputSchema = z
  .object({
    requestLineId: z.string().uuid("Invalid request line id"),
    issueQuantity: z.string().trim(),
  })
  .strict();

function rejectDuplicateRequestLineIds(
  lines: Array<{ requestLineId: string }>,
  ctx: z.RefinementCtx,
): void {
  const seen = new Set<string>();
  for (const [index, line] of lines.entries()) {
    if (seen.has(line.requestLineId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["lines", index, "requestLineId"],
        message: "The same request line cannot appear twice in one issue",
      });
    }
    seen.add(line.requestLineId);
  }
}

export const createItemIssueInputSchema = z
  .object({
    remarks: remarksInputSchema,
    lines: z
      .array(itemIssueLineInputSchema)
      .min(1, "At least one issue line is required"),
  })
  .strict()
  .superRefine((value, ctx) => {
    rejectDuplicateRequestLineIds(value.lines, ctx);
  });

export const updateItemIssueInputSchema = z
  .object({
    remarks: remarksInputSchema.optional(),
    lines: z
      .array(itemIssueLineInputSchema)
      .min(1, "At least one issue line is required")
      .optional(),
    expectedVersion: z
      .number({
        required_error: "expectedVersion is required",
        invalid_type_error: "expectedVersion must be a positive integer",
      })
      .int()
      .positive(),
  })
  .strict()
  .refine(
    (value) => value.remarks !== undefined || value.lines !== undefined,
    {
      message: "At least one field must be provided",
    },
  )
  .superRefine((value, ctx) => {
    if (value.lines) {
      rejectDuplicateRequestLineIds(value.lines, ctx);
    }
  });

export const submitItemIssueInputSchema = z
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

export const itemIssueIdSchema = z.string().uuid("Invalid item issue id");

export const itemIssueListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  search: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined)),
  status: z.union([z.literal("ALL"), itemIssueStatusSchema]).default("ALL"),
});

export const itemIssueRequestLineSummarySchema = z.object({
  id: z.string().uuid(),
  requestedQuantity: z.string(),
  item: z.object({
    id: z.string().uuid(),
    itemCode: z.string(),
    itemName: z.string(),
    isActive: z.boolean(),
    isRequestable: z.boolean(),
    isIssuable: z.boolean(),
    unit: itemRequestUnitSummarySchema,
  }),
});

export const itemIssueLineSchema = z.object({
  id: z.string().uuid(),
  requestLineId: z.string().uuid(),
  itemId: z.string().uuid(),
  issueQuantity: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  requestLine: itemIssueRequestLineSummarySchema,
});

export const itemIssueRequestSummarySchema = z.object({
  id: z.string().uuid(),
  requestNumber: z.string(),
  status: itemRequestStatusSchema,
  remarks: z.string().nullable(),
  createdAt: z.string(),
  approvedAt: z.string().nullable(),
  requestingStore: itemRequestStoreSummarySchema,
  corporateStore: itemRequestStoreSummarySchema.nullable(),
  createdBy: itemRequestPersonSummarySchema,
  lines: z.array(itemRequestLineSchema),
});

export const itemIssueLineAvailabilitySchema = z.object({
  requestLineId: z.string().uuid(),
  itemId: z.string().uuid(),
  itemCode: z.string(),
  itemName: z.string(),
  unit: itemRequestUnitSummarySchema,
  requestedQuantity: z.string(),
  previouslyIssuedQuantity: z.string(),
  remainingQuantity: z.string(),
  availableStockQuantity: z.string().nullable(),
  stockBalanceKnown: z.boolean(),
});

export const itemIssueEligibilitySchema = z.object({
  canCreate: z.boolean(),
  reason: z.string().nullable(),
  request: itemIssueRequestSummarySchema.nullable(),
  draftIssueId: z.string().uuid().nullable(),
  lines: z.array(itemIssueLineAvailabilitySchema),
});

export const itemIssueListItemSchema = z.object({
  id: z.string().uuid(),
  issueNumber: z.string(),
  requestId: z.string().uuid(),
  requestNumber: z.string(),
  status: itemIssueStatusSchema,
  version: z.number().int().positive(),
  remarks: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  submittedAt: z.string().nullable(),
  fromStore: itemRequestStoreSummarySchema,
  toStore: itemRequestStoreSummarySchema,
  createdBy: itemRequestPersonSummarySchema,
  submittedBy: itemRequestPersonSummarySchema.nullable(),
  canEdit: z.boolean(),
  canSubmit: z.boolean(),
});

export const itemIssueSchema = itemIssueListItemSchema.extend({
  request: itemIssueRequestSummarySchema,
  lines: z.array(itemIssueLineSchema),
  availability: z.array(itemIssueLineAvailabilitySchema),
});

export const paginatedItemIssueResponseSchema = z.object({
  items: z.array(itemIssueListItemSchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});
