import {
  createItemInputSchema,
  paginatedItemResponseSchema,
  itemIdSchema,
  itemListQuerySchema,
  itemSchema,
  updateItemInputSchema,
  updateItemStatusInputSchema,
  type CreateItemInput,
  type PaginatedItemResponse,
  type Item,
  type ItemListQuery,
  type UpdateItemInput,
  type UpdateItemStatusInput,
} from "@printing-stationery/shared";
import { requestJson, type ApiResult } from "./client";



function buildQueryString(query: ItemListQuery): string {
  const params = new URLSearchParams();
  params.set("page", String(query.page));
  params.set("pageSize", String(query.pageSize));
  params.set("status", query.status);
  if (query.search) {
    params.set("search", query.search);
  }
  if (query.unitId) {
    params.set("unitId", query.unitId);
  }
  if (query.itemGroupId) {
    params.set("itemGroupId", query.itemGroupId);
  }
  if (query.groupType) {
    params.set("groupType", query.groupType);
  }
  return params.toString();
}

export async function fetchItems(
  rawQuery: Partial<ItemListQuery> = {},
): Promise<ApiResult<PaginatedItemResponse>> {
  const parsedQuery = itemListQuerySchema.safeParse(rawQuery);
  if (!parsedQuery.success) {
    return { ok: false, error: "Invalid item list query", status: 400 };
  }

  const queryString = buildQueryString(parsedQuery.data);

  return requestJson(
    `/api/items?${queryString}`,
    { method: "GET" },
    (json) => {
      const parsed = paginatedItemResponseSchema.safeParse(json);
      if (!parsed.success) {
        return {
          success: false,
          error: "Item list response did not match the expected schema",
        };
      }
      return { success: true, data: parsed.data };
    },
    "Failed to load items",
  );
}

export async function fetchItem(id: string): Promise<ApiResult<Item>> {
  const parsedId = itemIdSchema.safeParse(id);
  if (!parsedId.success) {
    return { ok: false, error: "Invalid item id", status: 400 };
  }

  return requestJson(
    `/api/items/${parsedId.data}`,
    { method: "GET" },
    (json) => {
      const parsed = itemSchema.safeParse(json);
      if (!parsed.success) {
        return {
          success: false,
          error: "Item response did not match the expected schema",
        };
      }
      return { success: true, data: parsed.data };
    },
    "Failed to load item",
  );
}

export async function createItem(
  input: CreateItemInput,
): Promise<ApiResult<Item>> {
  const parsedInput = createItemInputSchema.safeParse(input);
  if (!parsedInput.success) {
    const issue = parsedInput.error.issues[0];
    return {
      ok: false,
      error: issue?.message ?? "Invalid item input",
      status: 400,
    };
  }

  return requestJson(
    "/api/items",
    {
      method: "POST",
      body: JSON.stringify(parsedInput.data),
    },
    (json) => {
      const parsed = itemSchema.safeParse(json);
      if (!parsed.success) {
        return {
          success: false,
          error: "Create item response did not match the expected schema",
        };
      }
      return { success: true, data: parsed.data };
    },
    "Failed to create item",
  );
}

export async function updateItem(
  id: string,
  input: UpdateItemInput,
): Promise<ApiResult<Item>> {
  const parsedId = itemIdSchema.safeParse(id);
  if (!parsedId.success) {
    return { ok: false, error: "Invalid item id", status: 400 };
  }

  const parsedInput = updateItemInputSchema.safeParse(input);
  if (!parsedInput.success) {
    const issue = parsedInput.error.issues[0];
    return {
      ok: false,
      error: issue?.message ?? "Invalid item update",
      status: 400,
    };
  }

  return requestJson(
    `/api/items/${parsedId.data}`,
    {
      method: "PATCH",
      body: JSON.stringify(parsedInput.data),
    },
    (json) => {
      const parsed = itemSchema.safeParse(json);
      if (!parsed.success) {
        return {
          success: false,
          error: "Update item response did not match the expected schema",
        };
      }
      return { success: true, data: parsed.data };
    },
    "Failed to update item",
  );
}

export async function updateItemStatus(
  id: string,
  input: UpdateItemStatusInput,
): Promise<ApiResult<Item>> {
  const parsedId = itemIdSchema.safeParse(id);
  if (!parsedId.success) {
    return { ok: false, error: "Invalid item id", status: 400 };
  }

  const parsedInput = updateItemStatusInputSchema.safeParse(input);
  if (!parsedInput.success) {
    const issue = parsedInput.error.issues[0];
    return {
      ok: false,
      error: issue?.message ?? "Invalid item status update",
      status: 400,
    };
  }

  return requestJson(
    `/api/items/${parsedId.data}/status`,
    {
      method: "PATCH",
      body: JSON.stringify(parsedInput.data),
    },
    (json) => {
      const parsed = itemSchema.safeParse(json);
      if (!parsed.success) {
        return {
          success: false,
          error:
            "Update item status response did not match the expected schema",
        };
      }
      return { success: true, data: parsed.data };
    },
    "Failed to update item status",
  );
}
