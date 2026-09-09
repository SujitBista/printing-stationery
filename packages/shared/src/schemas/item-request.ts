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

/** Legacy-aligned request queues (sidebar + tabs). */
export const ITEM_REQUEST_QUEUES = [
  "request-list",
  "recommend",
  "review",
  "approve",
  "approved",
  "partial-pending",
  "issued",
  "rejected",
] as const;

export const itemRequestQueueSchema = z.enum(ITEM_REQUEST_QUEUES);

/**
 * Statuses shown in each queue. Partial pending / issued currently use APPROVED
 * until remaining-qty filters are added.
 */
export const ITEM_REQUEST_QUEUE_STATUSES = {
  "request-list": "ALL",
  recommend: ["PENDING_BRANCH_CHECKER"],
  review: ["PENDING_CORPORATE_MAKER", "RETURNED_TO_CORPORATE_MAKER"],
  approve: ["PENDING_CORPORATE_CHECKER"],
  approved: ["APPROVED"],
  "partial-pending": ["APPROVED"],
  issued: ["APPROVED"],
  rejected: ["REJECTED"],
} as const satisfies Record<
  (typeof ITEM_REQUEST_QUEUES)[number],
  "ALL" | readonly (typeof ITEM_REQUEST_STATUSES)[number][]
>;

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

function rejectSameSourceAndDestination(
  value: { sourceStoreId?: string; destinationStoreId?: string },
  ctx: z.RefinementCtx,
): void {
  if (
    value.sourceStoreId &&
    value.destinationStoreId &&
    value.sourceStoreId === value.destinationStoreId
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["sourceStoreId"],
      message: "Request From Store and Request To Store must be different",
    });
  }
}

/**
 * `sourceStoreId` is Request From / supplying store.
 * `destinationStoreId` is Request To / receiving store.
 * Backend authorization still overrides destination for non-admin makers.
 */
export const createItemRequestInputSchema = z
  .object({
    sourceStoreId: z.string().uuid("Invalid Request From Store"),
    destinationStoreId: z.string().uuid("Invalid Request To Store"),
    /** Employee on whose behalf the request is made. Created By comes from the session. */
    requestedByEmployeeId: z.string().uuid("Invalid Requested By"),
    remarks: remarksInputSchema,
    lines: z
      .array(itemRequestLineInputSchema)
      .min(1, "At least one request line is required"),
  })
  .strict()
  .superRefine((value, ctx) => {
    rejectDuplicateItemIds(value.lines, ctx);
    rejectSameSourceAndDestination(value, ctx);
  });

export const updateItemRequestInputSchema = z
  .object({
    sourceStoreId: z.string().uuid("Invalid Request From Store").optional(),
    destinationStoreId: z.string().uuid("Invalid Request To Store").optional(),
    requestedByEmployeeId: z.string().uuid("Invalid Requested By").optional(),
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
    (value) =>
      value.remarks !== undefined ||
      value.lines !== undefined ||
      value.sourceStoreId !== undefined ||
      value.destinationStoreId !== undefined ||
      value.requestedByEmployeeId !== undefined,
    {
      message: "At least one field must be provided",
    },
  )
  .superRefine((value, ctx) => {
    if (value.lines) {
      rejectDuplicateItemIds(value.lines, ctx);
    }
    rejectSameSourceAndDestination(value, ctx);
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
  /** When set, overrides `status` with the queue’s status set. */
  queue: itemRequestQueueSchema.optional(),
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
  /** When set, available stock is the Request From / supplying store balance. */
  sourceStoreId: optionalUuidFilterSchema,
});

/** Paginated search of stores allowed to supply / transfer items. */
export const eligibleItemRequestStoreListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  search: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined)),
  /** Exclude the Request To / receiving store from the supplying-store list. */
  excludeStoreId: optionalUuidFilterSchema,
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

export const itemRequestDepartmentSummarySchema = z.object({
  id: z.string().uuid(),
  departmentCode: z.string(),
  departmentName: z.string(),
  isActive: z.boolean(),
});

/**
 * Employee selected in Requested By. Department is always null today because
 * employees are assigned to a branch, not a department.
 */
export const itemRequestRequestedByEmployeeSchema = z.object({
  id: z.string().uuid(),
  employeeCode: z.string(),
  employeeName: z.string(),
  isActive: z.boolean(),
  branch: z.object({
    id: z.string().uuid(),
    branchCode: z.string(),
    branchName: z.string(),
    isActive: z.boolean(),
  }),
  department: itemRequestDepartmentSummarySchema.nullable(),
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
  issuedQuantity: z.string(),
  remainingQuantity: z.string(),
  availableStockQuantity: z.string().nullable(),
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
  totalRequestedQuantity: z.string(),
  totalIssuedQuantity: z.string(),
  totalRemainingQuantity: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  /**
   * Request To / receiving store. Same value as `destinationStore`.
   * Maps to database `requesting_store_id`.
   */
  requestingStore: itemRequestStoreSummarySchema,
  /**
   * Request From / supplying store. Same value as `sourceStore`.
   * Maps to database `corporate_store_id`.
   */
  corporateStore: itemRequestStoreSummarySchema.nullable(),
  sourceStore: itemRequestStoreSummarySchema.nullable(),
  destinationStore: itemRequestStoreSummarySchema,
  requestedBy: itemRequestRequestedByEmployeeSchema.nullable(),
  createdBy: itemRequestPersonSummarySchema,
  pendingWith: itemRequestPersonSummarySchema.nullable(),
  canEdit: z.boolean(),
  allowedActions: z.array(itemRequestActionTypeSchema),
  canCreateIssue: z.boolean(),
});

export const itemRequestSchema = itemRequestListItemSchema.extend({
  requestingStoreId: z.string().uuid(),
  corporateStoreId: z.string().uuid().nullable(),
  sourceStoreId: z.string().uuid().nullable(),
  destinationStoreId: z.string().uuid(),
  requestedByEmployeeId: z.string().uuid().nullable(),
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
  availableStockQuantity: z.string(),
});

export const paginatedEligibleItemRequestItemResponseSchema = z.object({
  items: z.array(eligibleItemRequestItemSchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

export const paginatedEligibleItemRequestStoreResponseSchema = z.object({
  items: z.array(itemRequestStoreSummarySchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

export const itemRequestContextSchema = z.object({
  canCreate: z.boolean(),
  canSelectDestinationStore: z.boolean(),
  canSelectRequestedByEmployee: z.boolean(),
  /** Linked employee of the logged-in user, used as the Requested By default. */
  requestedByEmployee: itemRequestRequestedByEmployeeSchema.nullable(),
  /** Assigned receiving store for a maker; null for Admin. */
  destinationStore: itemRequestStoreSummarySchema.nullable(),
  /** Alias of `destinationStore` for older clients. */
  requestingStore: itemRequestStoreSummarySchema.nullable(),
  sourceStores: z.array(itemRequestStoreSummarySchema),
  destinationStores: z.array(itemRequestStoreSummarySchema),
});
