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
  "PARTIALLY_ISSUED",
  "ISSUED",
  "REJECTED",
  "CANCELLED",
] as const;

export const itemRequestStatusSchema = z.enum(ITEM_REQUEST_STATUSES);

export const ITEM_REQUEST_TERMINAL_STATUSES = [
  "ISSUED",
  "REJECTED",
  "CANCELLED",
] as const;

export const ITEM_REQUEST_ISSUE_ELIGIBLE_STATUSES = [
  "APPROVED",
  "PARTIALLY_ISSUED",
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

export const ITEM_REQUEST_WORKFLOW_ROLES = [
  "ADMIN",
  "BRANCH_MAKER",
  "BRANCH_CHECKER",
  "CORPORATE_MAKER",
  "CORPORATE_CHECKER",
] as const;

export const itemRequestWorkflowRoleSchema = z.enum(
  ITEM_REQUEST_WORKFLOW_ROLES,
);

/**
 * Request List filter value for requests the Branch Maker has sent to the
 * Branch Checker. Stored status remains `PENDING_BRANCH_CHECKER`.
 */
export const ITEM_REQUEST_SUBMITTED_LIST_FILTER = "SUBMITTED";

const itemRequestStatusFilterEnum = z.enum([
  "ALL",
  ...ITEM_REQUEST_STATUSES,
]);

export const itemRequestStatusFilterSchema = z.preprocess(
  (value) =>
    value === ITEM_REQUEST_SUBMITTED_LIST_FILTER
      ? "PENDING_BRANCH_CHECKER"
      : value,
  itemRequestStatusFilterEnum,
);

export function resolveItemRequestListStatusFilter(
  value: string | null | undefined,
): z.infer<typeof itemRequestStatusFilterEnum> {
  const parsed = itemRequestStatusFilterSchema.safeParse(value ?? "ALL");
  return parsed.success ? parsed.data : "ALL";
}

export function itemRequestListFilterIsSubmitted(
  value: string | null | undefined,
): boolean {
  return (
    value === ITEM_REQUEST_SUBMITTED_LIST_FILTER ||
    value === "PENDING_BRANCH_CHECKER"
  );
}

/** Role-specific request queues (sidebar + tabs). */
export const ITEM_REQUEST_QUEUES = [
  "request-list",
  "drafts",
  "submitted",
  "recommend",
  "recommended",
  "review",
  "forwarded",
  "approve",
  "approved",
  "ready-to-issue",
  "returned",
  "partial-pending",
  "issued",
  "rejected",
] as const;

export const itemRequestQueueSchema = z.enum(ITEM_REQUEST_QUEUES);

/**
 * Statuses shown in each queue. Ready-to-issue / partial-pending also require
 * remaining posted quantity and no submitted/returned issue, applied in the
 * backend. Actor-specific pending-with filters are applied in the backend.
 */
export const ITEM_REQUEST_QUEUE_STATUSES = {
  "request-list": "ALL",
  drafts: ["DRAFT"],
  submitted: ["PENDING_BRANCH_CHECKER"],
  recommend: ["PENDING_BRANCH_CHECKER"],
  recommended: [
    "PENDING_CORPORATE_MAKER",
    "PENDING_CORPORATE_CHECKER",
    "RETURNED_TO_CORPORATE_MAKER",
    "APPROVED",
    "PARTIALLY_ISSUED",
    "ISSUED",
  ],
  review: ["PENDING_CORPORATE_MAKER"],
  forwarded: ["PENDING_CORPORATE_CHECKER"],
  approve: ["PENDING_CORPORATE_CHECKER"],
  approved: ["APPROVED", "PARTIALLY_ISSUED", "ISSUED"],
  "ready-to-issue": ["APPROVED"],
  returned: ["RETURNED_TO_BRANCH_MAKER", "RETURNED_TO_CORPORATE_MAKER"],
  "partial-pending": ["PARTIALLY_ISSUED"],
  issued: ["ISSUED"],
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
 * `sourceStoreId` is Request From Store: the store making the request.
 * `destinationStoreId` is Request To Store: the store that processes and supplies.
 * Backend authorization still overrides Request From Store for non-admin makers.
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

export const deleteItemRequestInputSchema = z
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

export const itemRequestListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  search: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined)),
  status: itemRequestStatusFilterSchema.default("ALL"),
  /**
   * When set to a queue with its own status set, that set is used.
   * `request-list` keeps every status and still honors `status`, including
   * the Submitted alias.
   */
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
  /**
   * Request To Store whose available stock is shown. Required for stock
   * balances; omitted quantities are returned as 0.
   */
  destinationStoreId: optionalUuidFilterSchema,
});

/** Paginated search of stores that may make item requests (Request From). */
export const eligibleItemRequestStoreListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  search: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined)),
  /** Exclude the Request To Store from the Request From Store list. */
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
  actorWorkflowRole: itemRequestWorkflowRoleSchema,
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
  availableStockQuantity: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  /**
   * Request From Store: the store making the request.
   * Maps to database `requesting_store_id`. Same value as `sourceStore`.
   */
  requestingStore: itemRequestStoreSummarySchema,
  /**
   * Request To Store: the store that processes and supplies.
   * Maps to database `corporate_store_id`. Same value as `destinationStore`.
   */
  corporateStore: itemRequestStoreSummarySchema.nullable(),
  sourceStore: itemRequestStoreSummarySchema.nullable(),
  destinationStore: itemRequestStoreSummarySchema.nullable(),
  requestedBy: itemRequestRequestedByEmployeeSchema.nullable(),
  createdBy: itemRequestPersonSummarySchema,
  pendingWith: itemRequestPersonSummarySchema.nullable(),
  canEdit: z.boolean(),
  canDelete: z.boolean(),
  allowedActions: z.array(itemRequestActionTypeSchema),
  canCreateIssue: z.boolean(),
  activeIssue: z
    .object({
      id: z.string().uuid(),
      issueNumber: z.string().min(1),
      status: z.enum([
        "DRAFT",
        "PENDING_VERIFICATION",
        "RETURNED",
        "REJECTED",
        "POSTED",
      ]),
    })
    .nullable(),
});

export const itemRequestSchema = itemRequestListItemSchema.extend({
  requestingStoreId: z.string().uuid(),
  corporateStoreId: z.string().uuid().nullable(),
  sourceStoreId: z.string().uuid(),
  destinationStoreId: z.string().uuid().nullable(),
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
  workflowRoles: z.array(itemRequestWorkflowRoleSchema),
  canViewFulfilment: z.boolean(),
  readyToIssueCount: z.number().int().nonnegative(),
  pendingIssueVerificationCount: z.number().int().nonnegative(),
  returnedIssueCount: z.number().int().nonnegative(),
  canSelectRequestFromStore: z.boolean(),
  canSelectRequestToStore: z.boolean(),
  /** Admin may change Request From Store. Alias of `canSelectRequestFromStore`. */
  canSelectDestinationStore: z.boolean(),
  canSelectRequestedByEmployee: z.boolean(),
  /** Linked employee of the logged-in user, used as the Requested By default. */
  requestedByEmployee: itemRequestRequestedByEmployeeSchema.nullable(),
  /**
   * Assigned Request From Store for a maker; null for Admin.
   * Alias of `requestFromStore`.
   */
  destinationStore: itemRequestStoreSummarySchema.nullable(),
  requestFromStore: itemRequestStoreSummarySchema.nullable(),
  /** Alias of `requestFromStore` for older clients. */
  requestingStore: itemRequestStoreSummarySchema.nullable(),
  /** Default Request To Store (Corporate Store). */
  requestToStore: itemRequestStoreSummarySchema.nullable(),
  corporateStore: itemRequestStoreSummarySchema.nullable(),
  /** Request From Store options (stores that may make requests). */
  sourceStores: z.array(itemRequestStoreSummarySchema),
  /** Request To Store options (normally Corporate Store). */
  destinationStores: z.array(itemRequestStoreSummarySchema),
});
