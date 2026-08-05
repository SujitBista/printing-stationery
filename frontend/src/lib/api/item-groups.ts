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

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status?: number };

function getBaseUrl(): string | null {
  return process.env.NEXT_PUBLIC_API_URL ?? null;
}

async function parseErrorMessage(
  response: Response,
  fallback: string,
): Promise<string> {
  try {
    const json: unknown = await response.json();
    if (
      json &&
      typeof json === "object" &&
      "error" in json &&
      json.error &&
      typeof json.error === "object" &&
      "message" in json.error &&
      typeof json.error.message === "string"
    ) {
      return json.error.message;
    }
  } catch {
    // Ignore JSON parse failures and use the fallback message.
  }

  return fallback;
}

async function requestJson<T>(
  path: string,
  options: RequestInit | undefined,
  parse: (json: unknown) =>
    | { success: true; data: T }
    | { success: false; error: string },
  fallbackError: string,
): Promise<ApiResult<T>> {
  const baseUrl = getBaseUrl();
  if (!baseUrl) {
    return { ok: false, error: "NEXT_PUBLIC_API_URL is not configured" };
  }

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      ...options,
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        ...(options?.headers ?? {}),
      },
    });

    if (!response.ok) {
      const error = await parseErrorMessage(response, fallbackError);
      return { ok: false, error, status: response.status };
    }

    const json: unknown = await response.json();
    const parsed = parse(json);
    if (!parsed.success) {
      return { ok: false, error: parsed.error, status: response.status };
    }

    return { ok: true, data: parsed.data };
  } catch {
    return {
      ok: false,
      error: "Unable to reach the API. Check that the backend is running.",
    };
  }
}

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
