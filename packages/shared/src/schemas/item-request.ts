import { z } from "zod";
import { branchTypeSchema } from "./branch.js";

export const ITEM_REQUEST_STATUSES = [
  "DRAFT",
  "PENDING_BRANCH_CHECKER",
  "RETURNED_TO_BRANCH_MAKER",
  "PENDING_CORPORATE_MAKER",
  "PENDING_CORPORATE_CHECKER",
  "RETURNED_TO_CORPORATE_MAKER",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
] as const;

export const itemRequestStatusSchema = z.enum(ITEM_REQUEST_STATUSES);

export const ITEM_REQUEST_TERMINAL_STATUSES = [
  "APPROVED",
  "REJECTED",
  "CANCELLED",
] as const;

export const itemRequestTerminalStatusSchema = z.enum(
  ITEM_REQUEST_TERMINAL_STATUSES,
);

export const ITEM_REQUEST_ACTIONS = [
  "SUBMIT",
  "RESUBMIT",
  "RECOMMEND",
  "FORWARD",
  "APPROVE",
  "RETURN",
  "REJECT",
  "CANCEL",
] as const;

export const itemRequestActionTypeSchema = z.enum(ITEM_REQUEST_ACTIONS);

export const itemRequestStatusFilterSchema = z.enum([
  "ALL",
  ...ITEM_REQUEST_STATUSES,
]);

const optionalUuidFilterSchema = z.preprocess(
  (value) => {
    if (value === "" || value === null || value === undefined) {
      return undefined;
    }
    return value;
  },
  z.string().uuid().optional(),
);

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

const QUANTITY_PATTERN = /^(?:0|[1-9]\d{0,13})(?:\.\d{1,4})?$/;

export const requestedQuantitySchema = z
  .string({
    required_error: "Requested quantity is required",
    invalid_type_error:
      "Requested quantity must be a valid positive decimal string",
  })
  .refine((value) => QUANTITY_PATTERN.test(value), {
    message:
      "Requested quantity must be a valid positive decimal string with up to 14 integer digits and 4 fractional digits",
  })
  .refine((value) => /[1-9]/.test(value), {
    message: "Requested quantity must be greater than zero",
  });

export const itemRequestLineInputSchema = z
  .object({
    itemId: z.string().uuid("Invalid item id"),
    requestedQuantity: requestedQuantitySchema,
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
        message: "The same item cannot appear twice in one request",
      });
    }
    seen.add(line.itemId);
  }
}

export const createItemRequestInputSchema = z
  .object({
    remarks: remarksInputSchema,
    lines: z
      .array(itemRequestLineInputSchema)
      .min(1, "At least one request line is required"),
  })
  .strict()
  .superRefine((value, ctx) => {
    rejectDuplicateItemIds(value.lines, ctx);
  });

export const updateItemRequestInputSchema = z
  .object({
    remarks: remarksInputSchema.optional(),
    lines: z
      .array(itemRequestLineInputSchema)
      .min(1, "At least one request line is required")
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
      rejectDuplicateItemIds(value.lines, ctx);
    }
  });

const ACTIONS_REQUIRING_REMARKS: ReadonlySet<
  z.infer<typeof itemRequestActionTypeSchema>
> = new Set(["RETURN", "REJECT"]);

export const itemRequestActionInputSchema = z
  .object({
    action: itemRequestActionTypeSchema,
    remarks: remarksInputSchema,
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
    if (ACTIONS_REQUIRING_REMARKS.has(value.action) && value.remarks === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["remarks"],
        message: "Remarks are required for this action",
      });
    }
  });

export const itemRequestListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  search: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined)),
  status: itemRequestStatusFilterSchema.default("ALL"),
  requestingStoreId: optionalUuidFilterSchema,
  branchId: optionalUuidFilterSchema,
});

export const eligibleItemRequestItemListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  search: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined)),
});

export const itemRequestIdSchema = z.string().uuid("Invalid item request id");

export const itemRequestBranchSummarySchema = z.object({
  id: z.string().uuid(),
  branchCode: z.string(),
  branchName: z.string(),
  branchType: branchTypeSchema,
  isActive: z.boolean(),
});

export const itemRequestStoreSummarySchema = z.object({
  id: z.string().uuid(),
  storeCode: z.string(),
  storeName: z.string(),
  isActive: z.boolean(),
  branch: itemRequestBranchSummarySchema,
});

export const itemRequestEmployeeSummarySchema = z.object({
  id: z.string().uuid(),
  employeeCode: z.string(),
  employeeName: z.string(),
  isActive: z.boolean(),
});

export const itemRequestPersonSummarySchema = z.object({
  id: z.string().uuid(),
  username: z.string(),
  isActive: z.boolean(),
  employee: itemRequestEmployeeSummarySchema.nullable(),
});

export const itemRequestUnitSummarySchema = z.object({
  id: z.string().uuid(),
  unitName: z.string(),
});

export const itemRequestLineItemSummarySchema = z.object({
  id: z.string().uuid(),
  itemCode: z.string(),
  itemName: z.string(),
  isActive: z.boolean(),
  isRequestable: z.boolean(),
  unit: itemRequestUnitSummarySchema,
});

export const itemRequestLineSchema = z.object({
  id: z.string().uuid(),
  itemId: z.string().uuid(),
  requestedQuantity: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  item: itemRequestLineItemSummarySchema,
});

export const itemRequestActionSchema = z.object({
  id: z.string().uuid(),
  action: itemRequestActionTypeSchema,
  fromStatus: itemRequestStatusSchema,
  toStatus: itemRequestStatusSchema,
  remarks: z.string().nullable(),
  createdAt: z.string(),
  actor: itemRequestPersonSummarySchema,
});

export const itemRequestListItemSchema = z.object({
  id: z.string().uuid(),
  requestNumber: z.string(),
  status: itemRequestStatusSchema,
  version: z.number().int().positive(),
  remarks: z.string().nullable(),
  itemCount: z.number().int().nonnegative(),
  createdAt: z.string(),
  updatedAt: z.string(),
  requestingStore: itemRequestStoreSummarySchema,
  corporateStore: itemRequestStoreSummarySchema.nullable(),
  createdBy: itemRequestPersonSummarySchema,
  pendingWith: itemRequestPersonSummarySchema.nullable(),
  canEdit: z.boolean(),
  allowedActions: z.array(itemRequestActionTypeSchema),
  canCreateIssue: z.boolean(),
});

export const itemRequestSchema = itemRequestListItemSchema.extend({
  requestingStoreId: z.string().uuid(),
  corporateStoreId: z.string().uuid().nullable(),
  createdByApplicationUserId: z.string().uuid(),
  branchCheckerApplicationUserId: z.string().uuid().nullable(),
  corporateMakerApplicationUserId: z.string().uuid().nullable(),
  corporateCheckerApplicationUserId: z.string().uuid().nullable(),
  submittedAt: z.string().nullable(),
  recommendedAt: z.string().nullable(),
  forwardedAt: z.string().nullable(),
  approvedAt: z.string().nullable(),
  rejectedAt: z.string().nullable(),
  cancelledAt: z.string().nullable(),
  branchChecker: itemRequestPersonSummarySchema.nullable(),
  corporateMaker: itemRequestPersonSummarySchema.nullable(),
  corporateChecker: itemRequestPersonSummarySchema.nullable(),
  lines: z.array(itemRequestLineSchema),
  actions: z.array(itemRequestActionSchema),
});

export const paginatedItemRequestResponseSchema = z.object({
  items: z.array(itemRequestListItemSchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

export const eligibleItemRequestItemSchema = z.object({
  id: z.string().uuid(),
  itemCode: z.string(),
  itemName: z.string(),
  unit: itemRequestUnitSummarySchema,
});

export const paginatedEligibleItemRequestItemResponseSchema = z.object({
  items: z.array(eligibleItemRequestItemSchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

export const itemRequestContextSchema = z.object({
  canCreate: z.boolean(),
  requestingStore: itemRequestStoreSummarySchema.nullable(),
  corporateStore: itemRequestStoreSummarySchema.nullable(),
});
