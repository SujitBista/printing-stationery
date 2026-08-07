import {
  createStoreInputSchema,
  paginatedStoreResponseSchema,
  storeIdSchema,
  storeListQuerySchema,
  storeSchema,
  updateStoreInputSchema,
  updateStoreStatusInputSchema,
  type CreateStoreInput,
  type PaginatedStoreResponse,
  type Store,
  type StoreListQuery,
  type UpdateStoreInput,
  type UpdateStoreStatusInput,
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

function buildQueryString(query: StoreListQuery): string {
  const params = new URLSearchParams();
  params.set("page", String(query.page));
  params.set("pageSize", String(query.pageSize));
  params.set("status", query.status);
  params.set("hierarchy", query.hierarchy);
  if (query.search) {
    params.set("search", query.search);
  }
  if (query.branchId) {
    params.set("branchId", query.branchId);
  }
  if (query.underStoreId) {
    params.set("underStoreId", query.underStoreId);
  }
  return params.toString();
}

export async function fetchStores(
  rawQuery: Partial<StoreListQuery> = {},
): Promise<ApiResult<PaginatedStoreResponse>> {
  const parsedQuery = storeListQuerySchema.safeParse(rawQuery);
  if (!parsedQuery.success) {
    return { ok: false, error: "Invalid store list query", status: 400 };
  }

  const queryString = buildQueryString(parsedQuery.data);

  return requestJson(
    `/api/stores?${queryString}`,
    { method: "GET" },
    (json) => {
      const parsed = paginatedStoreResponseSchema.safeParse(json);
      if (!parsed.success) {
        return {
          success: false,
          error: "Store list response did not match the expected schema",
        };
      }
      return { success: true, data: parsed.data };
    },
    "Failed to load stores",
  );
}

export async function fetchStore(id: string): Promise<ApiResult<Store>> {
  const parsedId = storeIdSchema.safeParse(id);
  if (!parsedId.success) {
    return { ok: false, error: "Invalid store id", status: 400 };
  }

  return requestJson(
    `/api/stores/${parsedId.data}`,
    { method: "GET" },
    (json) => {
      const parsed = storeSchema.safeParse(json);
      if (!parsed.success) {
        return {
          success: false,
          error: "Store response did not match the expected schema",
        };
      }
      return { success: true, data: parsed.data };
    },
    "Failed to load store",
  );
}

export async function createStore(
  input: CreateStoreInput,
): Promise<ApiResult<Store>> {
  const parsedInput = createStoreInputSchema.safeParse(input);
  if (!parsedInput.success) {
    const issue = parsedInput.error.issues[0];
    return {
      ok: false,
      error: issue?.message ?? "Invalid store input",
      status: 400,
    };
  }

  return requestJson(
    "/api/stores",
    {
      method: "POST",
      body: JSON.stringify(parsedInput.data),
    },
    (json) => {
      const parsed = storeSchema.safeParse(json);
      if (!parsed.success) {
        return {
          success: false,
          error: "Create store response did not match the expected schema",
        };
      }
      return { success: true, data: parsed.data };
    },
    "Failed to create store",
  );
}

export async function updateStore(
  id: string,
  input: UpdateStoreInput,
): Promise<ApiResult<Store>> {
  const parsedId = storeIdSchema.safeParse(id);
  if (!parsedId.success) {
    return { ok: false, error: "Invalid store id", status: 400 };
  }

  const parsedInput = updateStoreInputSchema.safeParse(input);
  if (!parsedInput.success) {
    const issue = parsedInput.error.issues[0];
    return {
      ok: false,
      error: issue?.message ?? "Invalid store update",
      status: 400,
    };
  }

  return requestJson(
    `/api/stores/${parsedId.data}`,
    {
      method: "PATCH",
      body: JSON.stringify(parsedInput.data),
    },
    (json) => {
      const parsed = storeSchema.safeParse(json);
      if (!parsed.success) {
        return {
          success: false,
          error: "Update store response did not match the expected schema",
        };
      }
      return { success: true, data: parsed.data };
    },
    "Failed to update store",
  );
}

export async function updateStoreStatus(
  id: string,
  input: UpdateStoreStatusInput,
): Promise<ApiResult<Store>> {
  const parsedId = storeIdSchema.safeParse(id);
  if (!parsedId.success) {
    return { ok: false, error: "Invalid store id", status: 400 };
  }

  const parsedInput = updateStoreStatusInputSchema.safeParse(input);
  if (!parsedInput.success) {
    const issue = parsedInput.error.issues[0];
    return {
      ok: false,
      error: issue?.message ?? "Invalid store status update",
      status: 400,
    };
  }

  return requestJson(
    `/api/stores/${parsedId.data}/status`,
    {
      method: "PATCH",
      body: JSON.stringify(parsedInput.data),
    },
    (json) => {
      const parsed = storeSchema.safeParse(json);
      if (!parsed.success) {
        return {
          success: false,
          error:
            "Update store status response did not match the expected schema",
        };
      }
      return { success: true, data: parsed.data };
    },
    "Failed to update store status",
  );
}
