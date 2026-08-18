import {
  createItemRequestInputSchema,
  eligibleItemRequestItemListQuerySchema,
  itemRequestActionInputSchema,
  itemRequestContextSchema,
  itemRequestIdSchema,
  itemRequestListQuerySchema,
  itemRequestSchema,
  paginatedEligibleItemRequestItemResponseSchema,
  paginatedItemRequestResponseSchema,
  updateItemRequestInputSchema,
  type CreateItemRequestInput,
  type EligibleItemRequestItemListQuery,
  type ItemRequest,
  type ItemRequestActionInput,
  type ItemRequestContext,
  type ItemRequestListQuery,
  type PaginatedEligibleItemRequestItemResponse,
  type PaginatedItemRequestResponse,
  type UpdateItemRequestInput,
} from "@printing-stationery/shared";
import { requestJson, type ApiResult } from "./client";

function buildListQueryString(query: ItemRequestListQuery): string {
  const params = new URLSearchParams();
  params.set("page", String(query.page));
  params.set("pageSize", String(query.pageSize));
  params.set("status", query.status);
  if (query.search) {
    params.set("search", query.search);
  }
  if (query.requestingStoreId) {
    params.set("requestingStoreId", query.requestingStoreId);
  }
  if (query.branchId) {
    params.set("branchId", query.branchId);
  }
  return params.toString();
}

function buildEligibleQueryString(
  query: EligibleItemRequestItemListQuery,
): string {
  const params = new URLSearchParams();
  params.set("page", String(query.page));
  params.set("pageSize", String(query.pageSize));
  if (query.search) {
    params.set("search", query.search);
  }
  return params.toString();
}

export async function fetchItemRequests(
  rawQuery: Partial<ItemRequestListQuery> = {},
): Promise<ApiResult<PaginatedItemRequestResponse>> {
  const parsedQuery = itemRequestListQuerySchema.safeParse(rawQuery);
  if (!parsedQuery.success) {
    return { ok: false, error: "Invalid item request list query", status: 400 };
  }

  return requestJson(
    `/api/item-requests?${buildListQueryString(parsedQuery.data)}`,
    { method: "GET" },
    (json) => {
      const parsed = paginatedItemRequestResponseSchema.safeParse(json);
      if (!parsed.success) {
        return {
          success: false,
          error: "Item request list response did not match the expected schema",
        };
      }
      return { success: true, data: parsed.data };
    },
    "Failed to load item requests",
  );
}

export async function fetchItemRequestContext(): Promise<
  ApiResult<ItemRequestContext>
> {
  return requestJson(
    "/api/item-requests/context",
    { method: "GET" },
    (json) => {
      const parsed = itemRequestContextSchema.safeParse(json);
      if (!parsed.success) {
        return {
          success: false,
          error: "Item request context did not match the expected schema",
        };
      }
      return { success: true, data: parsed.data };
    },
    "Failed to load item request context",
  );
}

export async function fetchEligibleItemRequestItems(
  rawQuery: Partial<EligibleItemRequestItemListQuery> = {},
): Promise<ApiResult<PaginatedEligibleItemRequestItemResponse>> {
  const parsedQuery =
    eligibleItemRequestItemListQuerySchema.safeParse(rawQuery);
  if (!parsedQuery.success) {
    return {
      ok: false,
      error: "Invalid eligible item list query",
      status: 400,
    };
  }

  return requestJson(
    `/api/item-requests/eligible-items?${buildEligibleQueryString(parsedQuery.data)}`,
    { method: "GET" },
    (json) => {
      const parsed =
        paginatedEligibleItemRequestItemResponseSchema.safeParse(json);
      if (!parsed.success) {
        return {
          success: false,
          error: "Eligible item list response did not match the expected schema",
        };
      }
      return { success: true, data: parsed.data };
    },
    "Failed to load eligible items",
  );
}

export async function fetchItemRequest(
  id: string,
): Promise<ApiResult<ItemRequest>> {
  const parsedId = itemRequestIdSchema.safeParse(id);
  if (!parsedId.success) {
    return { ok: false, error: "Invalid item request id", status: 400 };
  }

  return requestJson(
    `/api/item-requests/${parsedId.data}`,
    { method: "GET" },
    (json) => {
      const parsed = itemRequestSchema.safeParse(json);
      if (!parsed.success) {
        return {
          success: false,
          error: "Item request response did not match the expected schema",
        };
      }
      return { success: true, data: parsed.data };
    },
    "Failed to load item request",
  );
}

export async function createItemRequest(
  input: CreateItemRequestInput,
): Promise<ApiResult<ItemRequest>> {
  const parsedInput = createItemRequestInputSchema.safeParse(input);
  if (!parsedInput.success) {
    const issue = parsedInput.error.issues[0];
    return {
      ok: false,
      error: issue?.message ?? "Invalid item request input",
      status: 400,
    };
  }

  return requestJson(
    "/api/item-requests",
    {
      method: "POST",
      body: JSON.stringify(parsedInput.data),
    },
    (json) => {
      const parsed = itemRequestSchema.safeParse(json);
      if (!parsed.success) {
        return {
          success: false,
          error: "Create item request response did not match the expected schema",
        };
      }
      return { success: true, data: parsed.data };
    },
    "Failed to create item request",
  );
}

export async function updateItemRequest(
  id: string,
  input: UpdateItemRequestInput,
): Promise<ApiResult<ItemRequest>> {
  const parsedId = itemRequestIdSchema.safeParse(id);
  if (!parsedId.success) {
    return { ok: false, error: "Invalid item request id", status: 400 };
  }

  const parsedInput = updateItemRequestInputSchema.safeParse(input);
  if (!parsedInput.success) {
    const issue = parsedInput.error.issues[0];
    return {
      ok: false,
      error: issue?.message ?? "Invalid item request update",
      status: 400,
    };
  }

  return requestJson(
    `/api/item-requests/${parsedId.data}`,
    {
      method: "PATCH",
      body: JSON.stringify(parsedInput.data),
    },
    (json) => {
      const parsed = itemRequestSchema.safeParse(json);
      if (!parsed.success) {
        return {
          success: false,
          error: "Update item request response did not match the expected schema",
        };
      }
      return { success: true, data: parsed.data };
    },
    "Failed to update item request",
  );
}

export async function performItemRequestAction(
  id: string,
  input: ItemRequestActionInput,
): Promise<ApiResult<ItemRequest>> {
  const parsedId = itemRequestIdSchema.safeParse(id);
  if (!parsedId.success) {
    return { ok: false, error: "Invalid item request id", status: 400 };
  }

  const parsedInput = itemRequestActionInputSchema.safeParse(input);
  if (!parsedInput.success) {
    const issue = parsedInput.error.issues[0];
    return {
      ok: false,
      error: issue?.message ?? "Invalid item request action",
      status: 400,
    };
  }

  return requestJson(
    `/api/item-requests/${parsedId.data}/actions`,
    {
      method: "POST",
      body: JSON.stringify(parsedInput.data),
    },
    (json) => {
      const parsed = itemRequestSchema.safeParse(json);
      if (!parsed.success) {
        return {
          success: false,
          error:
            "Item request action response did not match the expected schema",
        };
      }
      return { success: true, data: parsed.data };
    },
    "Failed to update item request status",
  );
}