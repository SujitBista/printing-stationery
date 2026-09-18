import { z } from "zod";
import {
  itemRequestActionSchema,
  itemRequestIdSchema,
  itemRequestLineSchema,
  itemRequestEmployeeSummarySchema,
  itemRequestPersonSummarySchema,
  itemRequestRequestedByEmployeeSchema,
  itemRequestStatusSchema,
  itemRequestStoreSummarySchema,
  itemRequestUnitSummarySchema,
  itemRequestWorkflowRoleSchema,
  requestedQuantitySchema,
} from "./item-request.js";

export const ITEM_ISSUE_STATUSES = [
  "DRAFT",
  "PENDING_VERIFICATION",
  "RETURNED",
  "REJECTED",
  "POSTED",
] as const;

export const itemIssueStatusSchema = z.enum(ITEM_ISSUE_STATUSES);

export const ITEM_ISSUE_DESTINATION_TYPES = [
  "BRANCH_STORE",
  "CORPORATE_DEPARTMENT",
] as const;

export const itemIssueDestinationTypeSchema = z.enum(
  ITEM_ISSUE_DESTINATION_TYPES,
);

export const ITEM_ISSUE_DELIVERY_STATUSES = [
  "IN_TRANSIT",
  "PARTIALLY_RECEIVED",
  "RECEIVED",
  "RECEIVED_WITH_DISCREPANCY",
  "NEEDS_REVIEW",
] as const;

export const ITEM_ISSUE_RECEIVABLE_DELIVERY_STATUSES = [
  "IN_TRANSIT",
  "PARTIALLY_RECEIVED",
] as const;

export const itemIssueDeliveryStatusSchema = z.enum(
  ITEM_ISSUE_DELIVERY_STATUSES,
);

export const ITEM_ISSUE_RECEIPT_STATUSES = [
  "DRAFT",
  "PENDING_VERIFICATION",
  "RETURNED",
  "CONFIRMED",
  "REJECTED",
] as const;

export const itemIssueReceiptStatusSchema = z.enum(ITEM_ISSUE_RECEIPT_STATUSES);

export const ITEM_ISSUE_DISCREPANCY_REASONS = [
  "MISSING",
  "DAMAGED",
  "WRONG_ITEM",
  "EXCESS",
  "OTHER",
] as const;

export const itemIssueDiscrepancyReasonSchema = z.enum(
  ITEM_ISSUE_DISCREPANCY_REASONS,
);

export const ITEM_ISSUE_DISCREPANCY_RESOLUTIONS = [
  "KEEP_IN_TRANSIT",
  "COMPLETE_WITH_DISCREPANCY",
] as const;

export const itemIssueDiscrepancyResolutionSchema = z.enum(
  ITEM_ISSUE_DISCREPANCY_RESOLUTIONS,
);

export const INCOMING_SHIPMENT_QUEUES = [
  "in-transit",
  "partially-received",
  "awaiting-receipt-verification",
  "received",
  "received-with-discrepancy",
] as const;

export const incomingShipmentQueueSchema = z.enum(INCOMING_SHIPMENT_QUEUES);

export const ITEM_ISSUE_QUEUES = [
  "pending-verification",
  "returned",
  "posted",
] as const;

export const itemIssueQueueSchema = z.enum(ITEM_ISSUE_QUEUES);

export const ITEM_ISSUE_QUEUE_STATUSES = {
  "pending-verification": ["PENDING_VERIFICATION"],
  returned: ["RETURNED"],
  posted: ["POSTED"],
} as const satisfies Record<
  (typeof ITEM_ISSUE_QUEUES)[number],
  readonly (typeof ITEM_ISSUE_STATUSES)[number][]
>;

export const ITEM_ISSUE_ACTIONS = [
  "CREATE",
  "UPDATE",
  "SUBMIT",
  "RETURN",
  "REJECT",
  "VERIFY_POST",
  "DISPATCH",
  "ISSUE_TO_DEPARTMENT",
] as const;

export const itemIssueActionTypeSchema = z.enum(ITEM_ISSUE_ACTIONS);

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

const checkerRemarksInputSchema = z
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

export const verifyItemIssueInputSchema = z
  .object({
    remarks: checkerRemarksInputSchema,
    expectedVersion: z
      .number({
        required_error: "expectedVersion is required",
        invalid_type_error: "expectedVersion must be a positive integer",
      })
      .int()
      .positive(),
  })
  .strict();

export const returnItemIssueInputSchema = z
  .object({
    remarks: checkerRemarksInputSchema,
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
    if (value.remarks === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["remarks"],
        message: "Remarks are required when returning an item issue",
      });
    }
  });

export const rejectItemIssueInputSchema = z
  .object({
    remarks: checkerRemarksInputSchema,
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
    if (value.remarks === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["remarks"],
        message: "Remarks are required when rejecting an item issue",
      });
    }
  });

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
  queue: itemIssueQueueSchema.optional(),
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

export const itemIssueDepartmentSummarySchema = z.object({
  id: z.string().uuid(),
  departmentCode: z.string(),
  departmentName: z.string(),
  isActive: z.boolean(),
});

export const itemIssueLineSchema = z.object({
  id: z.string().uuid(),
  requestLineId: z.string().uuid().nullable(),
  itemId: z.string().uuid(),
  issueQuantity: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  requestLine: itemIssueRequestLineSummarySchema.nullable(),
  unit: itemRequestUnitSummarySchema,
  dispatchedQuantity: z.string().nullable(),
  confirmedReceivedQuantity: z.string().nullable(),
  remainingInTransitQuantity: z.string().nullable(),
  discrepancyQuantity: z.string().nullable(),
});

export const itemIssueActionSchema = z.object({
  id: z.string().uuid(),
  action: itemIssueActionTypeSchema,
  fromStatus: itemIssueStatusSchema.nullable(),
  toStatus: itemIssueStatusSchema,
  actorWorkflowRole: itemRequestWorkflowRoleSchema,
  remarks: z.string().nullable(),
  stockLedgerReferenceId: z.string().uuid().nullable(),
  createdAt: z.string(),
  actor: itemRequestPersonSummarySchema,
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
  sourceStore: itemRequestStoreSummarySchema.nullable(),
  destinationStore: itemRequestStoreSummarySchema.nullable(),
  createdBy: itemRequestPersonSummarySchema,
  requestedBy: itemRequestRequestedByEmployeeSchema.nullable(),
  lines: z.array(itemRequestLineSchema),
  actions: z.array(itemRequestActionSchema),
});

export const itemIssueLineAvailabilitySchema = z.object({
  requestLineId: z.string().uuid().nullable(),
  itemId: z.string().uuid(),
  itemCode: z.string(),
  itemName: z.string(),
  unit: itemRequestUnitSummarySchema,
  requestedQuantity: z.string().nullable(),
  previouslyIssuedQuantity: z.string().nullable(),
  thisIssueQuantity: z.string(),
  outstandingBeforeThisIssue: z.string().nullable(),
  remainingQuantity: z.string().nullable(),
  remainingAfterIssue: z.string().nullable(),
  availableStockQuantity: z.string().nullable(),
  stockBalanceKnown: z.boolean(),
});

export const itemIssueActiveSummarySchema = z.object({
  id: z.string().uuid(),
  issueNumber: z.string().min(1),
  status: itemIssueStatusSchema,
});

export const itemIssueEligibilitySchema = z.object({
  canCreate: z.boolean(),
  reason: z.string().nullable(),
  request: itemIssueRequestSummarySchema.nullable(),
  draftIssueId: z.string().uuid().nullable(),
  activeIssue: itemIssueActiveSummarySchema.nullable(),
  lines: z.array(itemIssueLineAvailabilitySchema),
});

export const itemIssueListItemSchema = z.object({
  id: z.string().uuid(),
  issueNumber: z.string(),
  requestId: z.string().uuid().nullable(),
  requestNumber: z.string().nullable(),
  destinationType: itemIssueDestinationTypeSchema,
  deliveryStatus: itemIssueDeliveryStatusSchema.nullable(),
  status: itemIssueStatusSchema,
  version: z.number().int().positive(),
  remarks: z.string().nullable(),
  consumptionDescription: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  issueDate: z.string(),
  submittedAt: z.string().nullable(),
  verifiedAt: z.string().nullable(),
  returnedAt: z.string().nullable(),
  rejectedAt: z.string().nullable(),
  fromStore: itemRequestStoreSummarySchema,
  toStore: itemRequestStoreSummarySchema.nullable(),
  department: itemIssueDepartmentSummarySchema.nullable(),
  consumedBy: itemRequestEmployeeSummarySchema.nullable(),
  createdBy: itemRequestPersonSummarySchema,
  submittedBy: itemRequestPersonSummarySchema.nullable(),
  verifiedBy: itemRequestPersonSummarySchema.nullable(),
  canEdit: z.boolean(),
  canSubmit: z.boolean(),
  canVerify: z.boolean(),
  canReturn: z.boolean(),
  canReject: z.boolean(),
});

export const itemIssueShipmentLineSchema = z.object({
  id: z.string().uuid(),
  itemIssueLineId: z.string().uuid(),
  itemId: z.string().uuid(),
  itemCode: z.string(),
  itemName: z.string(),
  unit: itemRequestUnitSummarySchema,
  dispatchedQuantity: z.string(),
  confirmedReceivedQuantity: z.string(),
  remainingInTransitQuantity: z.string(),
  discrepancyQuantity: z.string(),
});

export const itemIssueReceiptLineSchema = z.object({
  id: z.string().uuid(),
  shipmentLineId: z.string().uuid(),
  receivedQuantityNow: z.string(),
  missingQuantity: z.string(),
  damagedQuantity: z.string(),
  excessQuantity: z.string(),
  discrepancyReason: itemIssueDiscrepancyReasonSchema.nullable(),
  remarks: z.string().nullable(),
});

export const itemIssueReceiptSchema = z.object({
  id: z.string().uuid(),
  shipmentId: z.string().uuid(),
  status: itemIssueReceiptStatusSchema,
  version: z.number().int().positive(),
  receiptDate: z.string(),
  remarks: z.string().nullable(),
  discrepancyResolution: itemIssueDiscrepancyResolutionSchema.nullable(),
  createdAt: z.string(),
  submittedAt: z.string().nullable(),
  verifiedAt: z.string().nullable(),
  createdBy: itemRequestPersonSummarySchema,
  submittedBy: itemRequestPersonSummarySchema.nullable(),
  verifiedBy: itemRequestPersonSummarySchema.nullable(),
  canSubmit: z.boolean(),
  canConfirm: z.boolean(),
  canReturn: z.boolean(),
  lines: z.array(itemIssueReceiptLineSchema),
});

export const itemIssueShipmentSchema = z.object({
  id: z.string().uuid(),
  itemIssueId: z.string().uuid(),
  issueNumber: z.string(),
  requestId: z.string().uuid().nullable(),
  requestNumber: z.string().nullable(),
  deliveryStatus: itemIssueDeliveryStatusSchema,
  dispatchedAt: z.string(),
  receivedAt: z.string().nullable(),
  fromStore: itemRequestStoreSummarySchema,
  toStore: itemRequestStoreSummarySchema,
  dispatchedBy: itemRequestPersonSummarySchema,
  lines: z.array(itemIssueShipmentLineSchema),
  receipts: z.array(itemIssueReceiptSchema),
  canRecordReceipt: z.boolean(),
  canConfirmReceipt: z.boolean(),
});

export const itemIssueSchema = itemIssueListItemSchema.extend({
  request: itemIssueRequestSummarySchema.nullable(),
  lines: z.array(itemIssueLineSchema),
  availability: z.array(itemIssueLineAvailabilitySchema),
  actions: z.array(itemIssueActionSchema),
  shipment: itemIssueShipmentSchema.nullable(),
});

export const paginatedItemIssueResponseSchema = z.object({
  items: z.array(itemIssueListItemSchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

const consumptionDescriptionSchema = z
  .string()
  .trim()
  .min(1, "Consumption Description is required.")
  .max(500, "Consumption Description must be at most 500 characters");

export const departmentIssueLineInputSchema = z
  .object({
    itemId: z.string().uuid("Invalid item id"),
    issueQuantity: issueQuantitySchema,
  })
  .strict();

export const createDepartmentIssueInputSchema = z
  .object({
    fromStoreId: z.string().uuid("Invalid source store id"),
    departmentId: z.string().uuid("Invalid department id"),
    consumedByEmployeeId: z.string().uuid("Invalid employee id").nullable().optional(),
    consumptionDescription: consumptionDescriptionSchema,
    remarks: remarksInputSchema,
    lines: z
      .array(departmentIssueLineInputSchema)
      .min(1, "At least one issue line is required"),
  })
  .strict();

export const updateDepartmentIssueInputSchema = z
  .object({
    departmentId: z.string().uuid("Invalid department id").optional(),
    consumedByEmployeeId: z
      .string()
      .uuid("Invalid employee id")
      .nullable()
      .optional(),
    consumptionDescription: consumptionDescriptionSchema.optional(),
    remarks: remarksInputSchema.optional(),
    lines: z
      .array(departmentIssueLineInputSchema)
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
  .strict();

const nonNegativeQuantitySchema = z
  .string()
  .trim()
  .refine((value) => value.length === 0 || /^(?:0|[1-9]\d*)(?:\.\d{1,4})?$/.test(value), {
    message: "Quantity must be a non-negative decimal",
  })
  .transform((value) => (value.length === 0 ? "0" : value));

export const itemIssueReceiptLineInputSchema = z
  .object({
    shipmentLineId: z.string().uuid("Invalid shipment line id"),
    receivedQuantityNow: issueQuantitySchema,
    missingQuantity: nonNegativeQuantitySchema.optional(),
    damagedQuantity: nonNegativeQuantitySchema.optional(),
    excessQuantity: nonNegativeQuantitySchema.optional(),
    discrepancyReason: itemIssueDiscrepancyReasonSchema.nullable().optional(),
    remarks: remarksInputSchema,
  })
  .strict();

export const submitItemIssueReceiptInputSchema = z
  .object({
    receiptDate: z.string().min(1, "Receipt date is required"),
    remarks: remarksInputSchema,
    discrepancyResolution: itemIssueDiscrepancyResolutionSchema.optional(),
    lines: z
      .array(itemIssueReceiptLineInputSchema)
      .min(1, "At least one receipt line is required"),
  })
  .strict();

export const confirmItemIssueReceiptInputSchema = z
  .object({
    remarks: checkerRemarksInputSchema,
    discrepancyResolution: itemIssueDiscrepancyResolutionSchema.optional(),
    expectedVersion: z
      .number({
        required_error: "expectedVersion is required",
        invalid_type_error: "expectedVersion must be a positive integer",
      })
      .int()
      .positive(),
  })
  .strict();

export const returnItemIssueReceiptInputSchema = z
  .object({
    remarks: checkerRemarksInputSchema,
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
    if (value.remarks === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["remarks"],
        message: "Remarks are required when returning a receipt",
      });
    }
  });

export const itemIssueShipmentIdSchema = z.string().uuid("Invalid shipment id");
export const itemIssueReceiptIdSchema = z.string().uuid("Invalid receipt id");

export const incomingShipmentListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  search: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined)),
  queue: incomingShipmentQueueSchema.optional(),
});

export const incomingShipmentListItemSchema = z.object({
  id: z.string().uuid(),
  itemIssueId: z.string().uuid(),
  issueNumber: z.string(),
  requestNumber: z.string().nullable(),
  fromStore: itemRequestStoreSummarySchema,
  toStore: itemRequestStoreSummarySchema,
  dispatchDate: z.string(),
  receivedDate: z.string().nullable(),
  deliveryStatus: itemIssueDeliveryStatusSchema,
  awaitingReceiptVerification: z.boolean(),
  itemSummaries: z.array(
    z.object({
      itemCode: z.string(),
      itemName: z.string(),
      unitName: z.string(),
      dispatchedQuantity: z.string(),
      confirmedReceivedQuantity: z.string(),
      remainingInTransitQuantity: z.string(),
    }),
  ),
  canRecordReceipt: z.boolean(),
  canConfirmReceipt: z.boolean(),
});

export const paginatedIncomingShipmentResponseSchema = z.object({
  items: z.array(incomingShipmentListItemSchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

export const departmentConsumptionListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  search: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined)),
  departmentId: z.string().uuid().optional(),
  itemId: z.string().uuid().optional(),
  issuedByUserId: z.string().uuid().optional(),
  consumedByEmployeeId: z.string().uuid().optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
});

export const departmentConsumptionLineSchema = z.object({
  id: z.string().uuid(),
  itemId: z.string().uuid(),
  itemCode: z.string(),
  itemName: z.string(),
  unit: itemRequestUnitSummarySchema,
  quantity: z.string(),
  unitCost: z.string(),
  totalCost: z.string(),
});

export const departmentConsumptionListItemSchema = z.object({
  id: z.string().uuid(),
  itemIssueId: z.string().uuid(),
  issueNumber: z.string(),
  issueDate: z.string(),
  department: itemIssueDepartmentSummarySchema,
  consumptionDescription: z.string(),
  consumedBy: itemRequestEmployeeSummarySchema.nullable(),
  createdBy: itemRequestPersonSummarySchema,
  verifiedBy: itemRequestPersonSummarySchema,
  quantityConsumed: z.string(),
  totalConsumptionValue: z.string(),
  lines: z.array(departmentConsumptionLineSchema),
});

export const paginatedDepartmentConsumptionResponseSchema = z.object({
  items: z.array(departmentConsumptionListItemSchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

export const inTransitQuantitySchema = z.object({
  itemId: z.string().uuid(),
  itemCode: z.string(),
  itemName: z.string(),
  unit: itemRequestUnitSummarySchema,
  fromStoreId: z.string().uuid(),
  toStoreId: z.string().uuid(),
  remainingInTransitQuantity: z.string(),
});

export const inTransitQuantitiesResponseSchema = z.object({
  items: z.array(inTransitQuantitySchema),
});
