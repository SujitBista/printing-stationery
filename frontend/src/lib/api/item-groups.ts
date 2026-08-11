import {
  createItemGroupInputSchema,
  paginatedItemGroupResponseSchema,
  itemGroupIdSchema,
  itemGroupListQuerySchema,
  itemGroupSchema,
  updateItemGroupInputSchema,
  updateItemGroupStatusInputSchema,
  type CreateItemGroupInput,
  type PaginatedItemGroupResponse,
  type ItemGroup,
  type ItemGroupListQuery,
  type UpdateItemGroupInput,
  type UpdateItemGroupStatusInput,
} from "@printing-stationery/shared";
import { requestJson, type ApiResult } from "./client";



function buildQueryString(query: ItemGroupListQuery): string {
  const params = new URLSearchParams();
  params.set("page", String(query.page));
  params.set("pageSize", String(query.pageSize));
  params.set("status", query.status);
  if (query.search) {
    params.set("search", query.search);
  }
  return params.toString();
}

export async function fetchItemGroups(
  rawQuery: Partial<ItemGroupListQuery> = {},
): Promise<ApiResult<PaginatedItemGroupResponse>> {
  const parsedQuery = itemGroupListQuerySchema.safeParse(rawQuery);
  if (!parsedQuery.success) {
    return { ok: false, error: "Invalid item group list query", status: 400 };
  }

  const queryString = buildQueryString(parsedQuery.data);

  return requestJson(
    `/api/item-groups?${queryString}`,
    { method: "GET" },
    (json) => {
      const parsed = paginatedItemGroupResponseSchema.safeParse(json);
      if (!parsed.success) {
        return {
          success: false,
          error: "Item group list response did not match the expected schema",
        };
      }
      return { success: true, data: parsed.data };
    },
    "Failed to load item groups",
  );
}

export async function fetchItemGroup(
  id: string,
): Promise<ApiResult<ItemGroup>> {
  const parsedId = itemGroupIdSchema.safeParse(id);
  if (!parsedId.success) {
    return { ok: false, error: "Invalid item group id", status: 400 };
  }

  return requestJson(
    `/api/item-groups/${parsedId.data}`,
    { method: "GET" },
    (json) => {
      const parsed = itemGroupSchema.safeParse(json);
      if (!parsed.success) {
        return {
          success: false,
          error: "Item group response did not match the expected schema",
        };
      }
      return { success: true, data: parsed.data };
    },
    "Failed to load item group",
  );
}

export async function createItemGroup(
  input: CreateItemGroupInput,
): Promise<ApiResult<ItemGroup>> {
  const parsedInput = createItemGroupInputSchema.safeParse(input);
  if (!parsedInput.success) {
    const issue = parsedInput.error.issues[0];
    return {
      ok: false,
      error: issue?.message ?? "Invalid item group input",
      status: 400,
    };
  }

  return requestJson(
    "/api/item-groups",
    {
      method: "POST",
      body: JSON.stringify(parsedInput.data),
    },
    (json) => {
      const parsed = itemGroupSchema.safeParse(json);
      if (!parsed.success) {
        return {
          success: false,
          error:
            "Create item group response did not match the expected schema",
        };
      }
      return { success: true, data: parsed.data };
    },
    "Failed to create item group",
  );
}

export async function updateItemGroup(
  id: string,
  input: UpdateItemGroupInput,
): Promise<ApiResult<ItemGroup>> {
  const parsedId = itemGroupIdSchema.safeParse(id);
  if (!parsedId.success) {
    return { ok: false, error: "Invalid item group id", status: 400 };
  }

  const parsedInput = updateItemGroupInputSchema.safeParse(input);
  if (!parsedInput.success) {
    const issue = parsedInput.error.issues[0];
    return {
      ok: false,
      error: issue?.message ?? "Invalid item group update",
      status: 400,
    };
  }

  return requestJson(
    `/api/item-groups/${parsedId.data}`,
    {
      method: "PATCH",
      body: JSON.stringify(parsedInput.data),
    },
    (json) => {
      const parsed = itemGroupSchema.safeParse(json);
      if (!parsed.success) {
        return {
          success: false,
          error:
            "Update item group response did not match the expected schema",
        };
      }
      return { success: true, data: parsed.data };
    },
    "Failed to update item group",
  );
}

export async function updateItemGroupStatus(
  id: string,
  input: UpdateItemGroupStatusInput,
): Promise<ApiResult<ItemGroup>> {
  const parsedId = itemGroupIdSchema.safeParse(id);
  if (!parsedId.success) {
    return { ok: false, error: "Invalid item group id", status: 400 };
  }

  const parsedInput = updateItemGroupStatusInputSchema.safeParse(input);
  if (!parsedInput.success) {
    const issue = parsedInput.error.issues[0];
    return {
      ok: false,
      error: issue?.message ?? "Invalid item group status update",
      status: 400,
    };
  }

  return requestJson(
    `/api/item-groups/${parsedId.data}/status`,
    {
      method: "PATCH",
      body: JSON.stringify(parsedInput.data),
    },
    (json) => {
      const parsed = itemGroupSchema.safeParse(json);
      if (!parsed.success) {
        return {
          success: false,
          error:
            "Update item group status response did not match the expected schema",
        };
      }
      return { success: true, data: parsed.data };
    },
    "Failed to update item group status",
  );
}
