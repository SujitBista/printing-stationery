import {
  createUnitInputSchema,
  paginatedUnitResponseSchema,
  unitIdSchema,
  unitListQuerySchema,
  unitSchema,
  updateUnitInputSchema,
  updateUnitStatusInputSchema,
  type CreateUnitInput,
  type PaginatedUnitResponse,
  type Unit,
  type UnitListQuery,
  type UpdateUnitInput,
  type UpdateUnitStatusInput,
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

function buildQueryString(query: UnitListQuery): string {
  const params = new URLSearchParams();
  params.set("page", String(query.page));
  params.set("pageSize", String(query.pageSize));
  params.set("status", query.status);
  if (query.search) {
    params.set("search", query.search);
  }
  return params.toString();
}

export async function fetchUnits(
  rawQuery: Partial<UnitListQuery> = {},
): Promise<ApiResult<PaginatedUnitResponse>> {
  const parsedQuery = unitListQuerySchema.safeParse(rawQuery);
  if (!parsedQuery.success) {
    return { ok: false, error: "Invalid unit list query", status: 400 };
  }

  const queryString = buildQueryString(parsedQuery.data);

  return requestJson(
    `/api/units?${queryString}`,
    { method: "GET" },
    (json) => {
      const parsed = paginatedUnitResponseSchema.safeParse(json);
      if (!parsed.success) {
        return {
          success: false,
          error: "Unit list response did not match the expected schema",
        };
      }
      return { success: true, data: parsed.data };
    },
    "Failed to load units",
  );
}

export async function fetchUnit(id: string): Promise<ApiResult<Unit>> {
  const parsedId = unitIdSchema.safeParse(id);
  if (!parsedId.success) {
    return { ok: false, error: "Invalid unit id", status: 400 };
  }

  return requestJson(
    `/api/units/${parsedId.data}`,
    { method: "GET" },
    (json) => {
      const parsed = unitSchema.safeParse(json);
      if (!parsed.success) {
        return {
          success: false,
          error: "Unit response did not match the expected schema",
        };
      }
      return { success: true, data: parsed.data };
    },
    "Failed to load unit",
  );
}

export async function createUnit(
  input: CreateUnitInput,
): Promise<ApiResult<Unit>> {
  const parsedInput = createUnitInputSchema.safeParse(input);
  if (!parsedInput.success) {
    const issue = parsedInput.error.issues[0];
    return {
      ok: false,
      error: issue?.message ?? "Invalid unit input",
      status: 400,
    };
  }

  return requestJson(
    "/api/units",
    {
      method: "POST",
      body: JSON.stringify(parsedInput.data),
    },
    (json) => {
      const parsed = unitSchema.safeParse(json);
      if (!parsed.success) {
        return {
          success: false,
          error: "Create unit response did not match the expected schema",
        };
      }
      return { success: true, data: parsed.data };
    },
    "Failed to create unit",
  );
}

export async function updateUnit(
  id: string,
  input: UpdateUnitInput,
): Promise<ApiResult<Unit>> {
  const parsedId = unitIdSchema.safeParse(id);
  if (!parsedId.success) {
    return { ok: false, error: "Invalid unit id", status: 400 };
  }

  const parsedInput = updateUnitInputSchema.safeParse(input);
  if (!parsedInput.success) {
    const issue = parsedInput.error.issues[0];
    return {
      ok: false,
      error: issue?.message ?? "Invalid unit update",
      status: 400,
    };
  }

  return requestJson(
    `/api/units/${parsedId.data}`,
    {
      method: "PATCH",
      body: JSON.stringify(parsedInput.data),
    },
    (json) => {
      const parsed = unitSchema.safeParse(json);
      if (!parsed.success) {
        return {
          success: false,
          error: "Update unit response did not match the expected schema",
        };
      }
      return { success: true, data: parsed.data };
    },
    "Failed to update unit",
  );
}

export async function updateUnitStatus(
  id: string,
  input: UpdateUnitStatusInput,
): Promise<ApiResult<Unit>> {
  const parsedId = unitIdSchema.safeParse(id);
  if (!parsedId.success) {
    return { ok: false, error: "Invalid unit id", status: 400 };
  }

  const parsedInput = updateUnitStatusInputSchema.safeParse(input);
  if (!parsedInput.success) {
    const issue = parsedInput.error.issues[0];
    return {
      ok: false,
      error: issue?.message ?? "Invalid unit status update",
      status: 400,
    };
  }

  return requestJson(
    `/api/units/${parsedId.data}/status`,
    {
      method: "PATCH",
      body: JSON.stringify(parsedInput.data),
    },
    (json) => {
      const parsed = unitSchema.safeParse(json);
      if (!parsed.success) {
        return {
          success: false,
          error:
            "Update unit status response did not match the expected schema",
        };
      }
      return { success: true, data: parsed.data };
    },
    "Failed to update unit status",
  );
}
