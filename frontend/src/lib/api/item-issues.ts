import {
  confirmItemIssueReceiptInputSchema,
  createDepartmentIssueInputSchema,
  createItemIssueInputSchema,
  departmentConsumptionListQuerySchema,
  incomingShipmentListQuerySchema,
  itemIssueEligibilitySchema,
  itemIssueIdSchema,
  itemIssueListQuerySchema,
  itemIssueReceiptIdSchema,
  itemIssueSchema,
  itemIssueShipmentIdSchema,
  itemIssueShipmentSchema,
  itemRequestIdSchema,
  paginatedDepartmentConsumptionResponseSchema,
  paginatedIncomingShipmentResponseSchema,
  paginatedItemIssueResponseSchema,
  rejectItemIssueInputSchema,
  returnItemIssueInputSchema,
  returnItemIssueReceiptInputSchema,
  submitItemIssueInputSchema,
  submitItemIssueReceiptInputSchema,
  updateDepartmentIssueInputSchema,
  updateItemIssueInputSchema,
  verifyItemIssueInputSchema,
  type ConfirmItemIssueReceiptInput,
  type CreateDepartmentIssueInput,
  type CreateItemIssueInput,
  type DepartmentConsumptionListQuery,
  type IncomingShipmentListQuery,
  type ItemIssue,
  type ItemIssueEligibility,
  type ItemIssueListQuery,
  type ItemIssueShipment,
  type PaginatedDepartmentConsumptionResponse,
  type PaginatedIncomingShipmentResponse,
  type PaginatedItemIssueResponse,
  type ReturnItemIssueReceiptInput,
  type SubmitItemIssueReceiptInput,
  type UpdateDepartmentIssueInput,
  type UpdateItemIssueInput,
} from "@printing-stationery/shared";
import { requestJson, type ApiResult } from "./client";

function buildListQueryString(query: ItemIssueListQuery): string {
  const params = new URLSearchParams();
  params.set("page", String(query.page));
  params.set("pageSize", String(query.pageSize));
  params.set("status", query.status);
  if (query.search) {
    params.set("search", query.search);
  }
  if (query.queue) {
    params.set("queue", query.queue);
  }
  return params.toString();
}

export async function fetchItemIssueEligibility(
  requestId: string,
): Promise<ApiResult<ItemIssueEligibility>> {
  const parsedId = itemRequestIdSchema.safeParse(requestId);
  if (!parsedId.success) {
    return { ok: false, error: "Invalid item request id", status: 400 };
  }

  return requestJson(
    `/api/item-requests/${parsedId.data}/issue-eligibility`,
    { method: "GET" },
    (json) => {
      const parsed = itemIssueEligibilitySchema.safeParse(json);
      if (!parsed.success) {
        return {
          success: false,
          error: "Item issue eligibility response did not match the expected schema",
        };
      }
      return { success: true, data: parsed.data };
    },
    "Failed to load item issue eligibility",
  );
}

export async function createItemIssueFromRequest(
  requestId: string,
  input: CreateItemIssueInput,
): Promise<ApiResult<ItemIssue>> {
  const parsedId = itemRequestIdSchema.safeParse(requestId);
  if (!parsedId.success) {
    return { ok: false, error: "Invalid item request id", status: 400 };
  }

  const parsedInput = createItemIssueInputSchema.safeParse(input);
  if (!parsedInput.success) {
    const issue = parsedInput.error.issues[0];
    return {
      ok: false,
      error: issue?.message ?? "Invalid item issue input",
      status: 400,
    };
  }

  return requestJson(
    `/api/item-requests/${parsedId.data}/item-issues`,
    {
      method: "POST",
      body: JSON.stringify(parsedInput.data),
    },
    (json) => {
      const parsed = itemIssueSchema.safeParse(json);
      if (!parsed.success) {
        return {
          success: false,
          error: "Create item issue response did not match the expected schema",
        };
      }
      return { success: true, data: parsed.data };
    },
    "Failed to create item issue",
  );
}

export async function fetchItemIssues(
  rawQuery: Partial<ItemIssueListQuery> = {},
): Promise<ApiResult<PaginatedItemIssueResponse>> {
  const parsedQuery = itemIssueListQuerySchema.safeParse(rawQuery);
  if (!parsedQuery.success) {
    return { ok: false, error: "Invalid item issue list query", status: 400 };
  }

  return requestJson(
    `/api/item-issues?${buildListQueryString(parsedQuery.data)}`,
    { method: "GET" },
    (json) => {
      const parsed = paginatedItemIssueResponseSchema.safeParse(json);
      if (!parsed.success) {
        return {
          success: false,
          error: "Item issue list response did not match the expected schema",
        };
      }
      return { success: true, data: parsed.data };
    },
    "Failed to load item issues",
  );
}

export async function fetchItemIssue(id: string): Promise<ApiResult<ItemIssue>> {
  const parsedId = itemIssueIdSchema.safeParse(id);
  if (!parsedId.success) {
    return { ok: false, error: "Invalid item issue id", status: 400 };
  }

  return requestJson(
    `/api/item-issues/${parsedId.data}`,
    { method: "GET" },
    (json) => {
      const parsed = itemIssueSchema.safeParse(json);
      if (!parsed.success) {
        return {
          success: false,
          error: "Item issue response did not match the expected schema",
        };
      }
      return { success: true, data: parsed.data };
    },
    "Failed to load item issue",
  );
}

export async function updateItemIssue(
  id: string,
  input: UpdateItemIssueInput,
): Promise<ApiResult<ItemIssue>> {
  const parsedId = itemIssueIdSchema.safeParse(id);
  if (!parsedId.success) {
    return { ok: false, error: "Invalid item issue id", status: 400 };
  }

  const parsedInput = updateItemIssueInputSchema.safeParse(input);
  if (!parsedInput.success) {
    const issue = parsedInput.error.issues[0];
    return {
      ok: false,
      error: issue?.message ?? "Invalid item issue update",
      status: 400,
    };
  }

  return requestJson(
    `/api/item-issues/${parsedId.data}`,
    {
      method: "PATCH",
      body: JSON.stringify(parsedInput.data),
    },
    (json) => {
      const parsed = itemIssueSchema.safeParse(json);
      if (!parsed.success) {
        return {
          success: false,
          error: "Update item issue response did not match the expected schema",
        };
      }
      return { success: true, data: parsed.data };
    },
    "Failed to update item issue",
  );
}

export async function submitItemIssue(
  id: string,
  input: { expectedVersion: number },
): Promise<ApiResult<ItemIssue>> {
  const parsedId = itemIssueIdSchema.safeParse(id);
  if (!parsedId.success) {
    return { ok: false, error: "Invalid item issue id", status: 400 };
  }

  const parsedInput = submitItemIssueInputSchema.safeParse(input);
  if (!parsedInput.success) {
    const issue = parsedInput.error.issues[0];
    return {
      ok: false,
      error: issue?.message ?? "Invalid item issue submit request",
      status: 400,
    };
  }

  return requestJson(
    `/api/item-issues/${parsedId.data}/submit`,
    {
      method: "POST",
      body: JSON.stringify(parsedInput.data),
    },
    (json) => {
      const parsed = itemIssueSchema.safeParse(json);
      if (!parsed.success) {
        return {
          success: false,
          error: "Submit item issue response did not match the expected schema",
        };
      }
      return { success: true, data: parsed.data };
    },
    "Failed to submit item issue",
  );
}

function postIssueAction(
  id: string,
  path: "verify" | "return" | "reject",
  body: unknown,
  invalidMessage: string,
  failedMessage: string,
): Promise<ApiResult<ItemIssue>> {
  return requestJson(
    `/api/item-issues/${id}/${path}`,
    {
      method: "POST",
      body: JSON.stringify(body),
    },
    (json) => {
      const parsed = itemIssueSchema.safeParse(json);
      if (!parsed.success) {
        return { success: false, error: invalidMessage };
      }
      return { success: true, data: parsed.data };
    },
    failedMessage,
  );
}

export async function verifyItemIssue(
  id: string,
  input: { expectedVersion: number; remarks?: string | null },
): Promise<ApiResult<ItemIssue>> {
  const parsedId = itemIssueIdSchema.safeParse(id);
  if (!parsedId.success) {
    return { ok: false, error: "Invalid item issue id", status: 400 };
  }
  const parsedInput = verifyItemIssueInputSchema.safeParse(input);
  if (!parsedInput.success) {
    return {
      ok: false,
      error: parsedInput.error.issues[0]?.message ?? "Invalid verify request",
      status: 400,
    };
  }
  return postIssueAction(
    parsedId.data,
    "verify",
    parsedInput.data,
    "Verify item issue response did not match the expected schema",
    "Failed to verify item issue",
  );
}

export async function returnItemIssue(
  id: string,
  input: { expectedVersion: number; remarks: string },
): Promise<ApiResult<ItemIssue>> {
  const parsedId = itemIssueIdSchema.safeParse(id);
  if (!parsedId.success) {
    return { ok: false, error: "Invalid item issue id", status: 400 };
  }
  const parsedInput = returnItemIssueInputSchema.safeParse(input);
  if (!parsedInput.success) {
    return {
      ok: false,
      error: parsedInput.error.issues[0]?.message ?? "Invalid return request",
      status: 400,
    };
  }
  return postIssueAction(
    parsedId.data,
    "return",
    parsedInput.data,
    "Return item issue response did not match the expected schema",
    "Failed to return item issue",
  );
}

export async function rejectItemIssue(
  id: string,
  input: { expectedVersion: number; remarks: string },
): Promise<ApiResult<ItemIssue>> {
  const parsedId = itemIssueIdSchema.safeParse(id);
  if (!parsedId.success) {
    return { ok: false, error: "Invalid item issue id", status: 400 };
  }
  const parsedInput = rejectItemIssueInputSchema.safeParse(input);
  if (!parsedInput.success) {
    return {
      ok: false,
      error: parsedInput.error.issues[0]?.message ?? "Invalid reject request",
      status: 400,
    };
  }
  return postIssueAction(
    parsedId.data,
    "reject",
    parsedInput.data,
    "Reject item issue response did not match the expected schema",
    "Failed to reject item issue",
  );
}

export async function createDepartmentIssue(
  input: CreateDepartmentIssueInput,
): Promise<ApiResult<ItemIssue>> {
  const parsedInput = createDepartmentIssueInputSchema.safeParse(input);
  if (!parsedInput.success) {
    return {
      ok: false,
      error:
        parsedInput.error.issues[0]?.message ?? "Invalid department issue input",
      status: 400,
    };
  }
  return requestJson(
    "/api/item-issues/department",
    {
      method: "POST",
      body: JSON.stringify(parsedInput.data),
    },
    (json) => {
      const parsed = itemIssueSchema.safeParse(json);
      if (!parsed.success) {
        return {
          success: false,
          error: "Create department issue response did not match the expected schema",
        };
      }
      return { success: true, data: parsed.data };
    },
    "Failed to create department issue",
  );
}

export async function updateDepartmentIssue(
  id: string,
  input: UpdateDepartmentIssueInput,
): Promise<ApiResult<ItemIssue>> {
  const parsedId = itemIssueIdSchema.safeParse(id);
  if (!parsedId.success) {
    return { ok: false, error: "Invalid item issue id", status: 400 };
  }
  const parsedInput = updateDepartmentIssueInputSchema.safeParse(input);
  if (!parsedInput.success) {
    return {
      ok: false,
      error:
        parsedInput.error.issues[0]?.message ?? "Invalid department issue update",
      status: 400,
    };
  }
  return requestJson(
    `/api/item-issues/department/${parsedId.data}`,
    {
      method: "PATCH",
      body: JSON.stringify(parsedInput.data),
    },
    (json) => {
      const parsed = itemIssueSchema.safeParse(json);
      if (!parsed.success) {
        return {
          success: false,
          error: "Update department issue response did not match the expected schema",
        };
      }
      return { success: true, data: parsed.data };
    },
    "Failed to update department issue",
  );
}

export async function fetchDepartmentConsumptions(
  rawQuery: Partial<DepartmentConsumptionListQuery> = {},
): Promise<ApiResult<PaginatedDepartmentConsumptionResponse>> {
  const parsedQuery = departmentConsumptionListQuerySchema.safeParse(rawQuery);
  if (!parsedQuery.success) {
    return { ok: false, error: "Invalid department consumption query", status: 400 };
  }
  const params = new URLSearchParams();
  params.set("page", String(parsedQuery.data.page));
  params.set("pageSize", String(parsedQuery.data.pageSize));
  if (parsedQuery.data.search) params.set("search", parsedQuery.data.search);
  if (parsedQuery.data.departmentId) {
    params.set("departmentId", parsedQuery.data.departmentId);
  }
  if (parsedQuery.data.itemId) params.set("itemId", parsedQuery.data.itemId);
  if (parsedQuery.data.issuedByUserId) {
    params.set("issuedByUserId", parsedQuery.data.issuedByUserId);
  }
  if (parsedQuery.data.consumedByEmployeeId) {
    params.set("consumedByEmployeeId", parsedQuery.data.consumedByEmployeeId);
  }
  if (parsedQuery.data.fromDate) params.set("fromDate", parsedQuery.data.fromDate);
  if (parsedQuery.data.toDate) params.set("toDate", parsedQuery.data.toDate);
  return requestJson(
    `/api/item-issues/department-consumption?${params.toString()}`,
    { method: "GET" },
    (json) => {
      const parsed = paginatedDepartmentConsumptionResponseSchema.safeParse(json);
      if (!parsed.success) {
        return {
          success: false,
          error: "Department consumption list response did not match the expected schema",
        };
      }
      return { success: true, data: parsed.data };
    },
    "Failed to load department consumption",
  );
}

export async function fetchIncomingShipments(
  rawQuery: Partial<IncomingShipmentListQuery> = {},
): Promise<ApiResult<PaginatedIncomingShipmentResponse>> {
  const parsedQuery = incomingShipmentListQuerySchema.safeParse(rawQuery);
  if (!parsedQuery.success) {
    return { ok: false, error: "Invalid incoming shipment query", status: 400 };
  }
  const params = new URLSearchParams();
  params.set("page", String(parsedQuery.data.page));
  params.set("pageSize", String(parsedQuery.data.pageSize));
  if (parsedQuery.data.search) params.set("search", parsedQuery.data.search);
  if (parsedQuery.data.queue) params.set("queue", parsedQuery.data.queue);
  return requestJson(
    `/api/item-issues/incoming?${params.toString()}`,
    { method: "GET" },
    (json) => {
      const parsed = paginatedIncomingShipmentResponseSchema.safeParse(json);
      if (!parsed.success) {
        return {
          success: false,
          error: "Incoming shipment list response did not match the expected schema",
        };
      }
      return { success: true, data: parsed.data };
    },
    "Failed to load incoming items",
  );
}

export async function fetchIncomingShipment(
  id: string,
): Promise<ApiResult<ItemIssueShipment>> {
  const parsedId = itemIssueShipmentIdSchema.safeParse(id);
  if (!parsedId.success) {
    return { ok: false, error: "Invalid shipment id", status: 400 };
  }
  return requestJson(
    `/api/item-issues/incoming/${parsedId.data}`,
    { method: "GET" },
    (json) => {
      const parsed = itemIssueShipmentSchema.safeParse(json);
      if (!parsed.success) {
        return {
          success: false,
          error: "Incoming shipment response did not match the expected schema",
        };
      }
      return { success: true, data: parsed.data };
    },
    "Failed to load incoming shipment",
  );
}

export async function submitItemIssueReceipt(
  shipmentId: string,
  input: SubmitItemIssueReceiptInput,
): Promise<ApiResult<ItemIssueShipment>> {
  const parsedId = itemIssueShipmentIdSchema.safeParse(shipmentId);
  if (!parsedId.success) {
    return { ok: false, error: "Invalid shipment id", status: 400 };
  }
  const parsedInput = submitItemIssueReceiptInputSchema.safeParse(input);
  if (!parsedInput.success) {
    return {
      ok: false,
      error: parsedInput.error.issues[0]?.message ?? "Invalid receipt input",
      status: 400,
    };
  }
  return requestJson(
    `/api/item-issues/incoming/${parsedId.data}/receipts`,
    {
      method: "POST",
      body: JSON.stringify(parsedInput.data),
    },
    (json) => {
      const parsed = itemIssueShipmentSchema.safeParse(json);
      if (!parsed.success) {
        return {
          success: false,
          error: "Submit receipt response did not match the expected schema",
        };
      }
      return { success: true, data: parsed.data };
    },
    "Failed to submit receipt",
  );
}

function postReceiptAction(
  receiptId: string,
  path: "confirm" | "return" | "complete-with-discrepancy",
  body: unknown,
  failedMessage: string,
): Promise<ApiResult<ItemIssueShipment>> {
  return requestJson(
    `/api/item-issues/receipts/${receiptId}/${path}`,
    {
      method: "POST",
      body: JSON.stringify(body),
    },
    (json) => {
      const parsed = itemIssueShipmentSchema.safeParse(json);
      if (!parsed.success) {
        return {
          success: false,
          error: "Receipt action response did not match the expected schema",
        };
      }
      return { success: true, data: parsed.data };
    },
    failedMessage,
  );
}

export async function confirmItemIssueReceipt(
  receiptId: string,
  input: ConfirmItemIssueReceiptInput,
): Promise<ApiResult<ItemIssueShipment>> {
  const parsedId = itemIssueReceiptIdSchema.safeParse(receiptId);
  if (!parsedId.success) {
    return { ok: false, error: "Invalid receipt id", status: 400 };
  }
  const parsedInput = confirmItemIssueReceiptInputSchema.safeParse(input);
  if (!parsedInput.success) {
    return {
      ok: false,
      error: parsedInput.error.issues[0]?.message ?? "Invalid confirm request",
      status: 400,
    };
  }
  return postReceiptAction(
    parsedId.data,
    "confirm",
    parsedInput.data,
    "Failed to confirm receipt",
  );
}

export async function completeItemIssueReceiptWithDiscrepancy(
  receiptId: string,
  input: ConfirmItemIssueReceiptInput,
): Promise<ApiResult<ItemIssueShipment>> {
  const parsedId = itemIssueReceiptIdSchema.safeParse(receiptId);
  if (!parsedId.success) {
    return { ok: false, error: "Invalid receipt id", status: 400 };
  }
  const parsedInput = confirmItemIssueReceiptInputSchema.safeParse(input);
  if (!parsedInput.success) {
    return {
      ok: false,
      error: parsedInput.error.issues[0]?.message ?? "Invalid discrepancy request",
      status: 400,
    };
  }
  return postReceiptAction(
    parsedId.data,
    "complete-with-discrepancy",
    parsedInput.data,
    "Failed to complete receipt with discrepancy",
  );
}

export async function returnItemIssueReceipt(
  receiptId: string,
  input: ReturnItemIssueReceiptInput,
): Promise<ApiResult<ItemIssueShipment>> {
  const parsedId = itemIssueReceiptIdSchema.safeParse(receiptId);
  if (!parsedId.success) {
    return { ok: false, error: "Invalid receipt id", status: 400 };
  }
  const parsedInput = returnItemIssueReceiptInputSchema.safeParse(input);
  if (!parsedInput.success) {
    return {
      ok: false,
      error: parsedInput.error.issues[0]?.message ?? "Invalid return request",
      status: 400,
    };
  }
  return postReceiptAction(
    parsedId.data,
    "return",
    parsedInput.data,
    "Failed to return receipt",
  );
}
