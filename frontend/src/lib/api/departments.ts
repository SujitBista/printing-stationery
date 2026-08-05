import {
  createDepartmentInputSchema,
  departmentIdSchema,
  departmentListQuerySchema,
  departmentSchema,
  paginatedDepartmentResponseSchema,
  updateDepartmentInputSchema,
  updateDepartmentStatusInputSchema,
  type CreateDepartmentInput,
  type Department,
  type DepartmentListQuery,
  type PaginatedDepartmentResponse,
  type UpdateDepartmentInput,
  type UpdateDepartmentStatusInput,
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

function buildQueryString(query: DepartmentListQuery): string {
  const params = new URLSearchParams();
  params.set("page", String(query.page));
  params.set("pageSize", String(query.pageSize));
  params.set("status", query.status);
  if (query.search) {
    params.set("search", query.search);
  }
  return params.toString();
}

export async function fetchDepartments(
  rawQuery: Partial<DepartmentListQuery> = {},
): Promise<ApiResult<PaginatedDepartmentResponse>> {
  const parsedQuery = departmentListQuerySchema.safeParse(rawQuery);
  if (!parsedQuery.success) {
    return { ok: false, error: "Invalid department list query", status: 400 };
  }

  const queryString = buildQueryString(parsedQuery.data);

  return requestJson(
    `/api/departments?${queryString}`,
    { method: "GET" },
    (json) => {
      const parsed = paginatedDepartmentResponseSchema.safeParse(json);
      if (!parsed.success) {
        return {
          success: false,
          error: "Department list response did not match the expected schema",
        };
      }
      return { success: true, data: parsed.data };
    },
    "Failed to load departments",
  );
}

export async function fetchDepartment(
  id: string,
): Promise<ApiResult<Department>> {
  const parsedId = departmentIdSchema.safeParse(id);
  if (!parsedId.success) {
    return { ok: false, error: "Invalid department id", status: 400 };
  }

  return requestJson(
    `/api/departments/${parsedId.data}`,
    { method: "GET" },
    (json) => {
      const parsed = departmentSchema.safeParse(json);
      if (!parsed.success) {
        return {
          success: false,
          error: "Department response did not match the expected schema",
        };
      }
      return { success: true, data: parsed.data };
    },
    "Failed to load department",
  );
}

export async function createDepartment(
  input: CreateDepartmentInput,
): Promise<ApiResult<Department>> {
  const parsedInput = createDepartmentInputSchema.safeParse(input);
  if (!parsedInput.success) {
    const issue = parsedInput.error.issues[0];
    return {
      ok: false,
      error: issue?.message ?? "Invalid department input",
      status: 400,
    };
  }

  return requestJson(
    "/api/departments",
    {
      method: "POST",
      body: JSON.stringify(parsedInput.data),
    },
    (json) => {
      const parsed = departmentSchema.safeParse(json);
      if (!parsed.success) {
        return {
          success: false,
          error:
            "Create department response did not match the expected schema",
        };
      }
      return { success: true, data: parsed.data };
    },
    "Failed to create department",
  );
}

export async function updateDepartment(
  id: string,
  input: UpdateDepartmentInput,
): Promise<ApiResult<Department>> {
  const parsedId = departmentIdSchema.safeParse(id);
  if (!parsedId.success) {
    return { ok: false, error: "Invalid department id", status: 400 };
  }

  const parsedInput = updateDepartmentInputSchema.safeParse(input);
  if (!parsedInput.success) {
    const issue = parsedInput.error.issues[0];
    return {
      ok: false,
      error: issue?.message ?? "Invalid department update",
      status: 400,
    };
  }

  return requestJson(
    `/api/departments/${parsedId.data}`,
    {
      method: "PATCH",
      body: JSON.stringify(parsedInput.data),
    },
    (json) => {
      const parsed = departmentSchema.safeParse(json);
      if (!parsed.success) {
        return {
          success: false,
          error:
            "Update department response did not match the expected schema",
        };
      }
      return { success: true, data: parsed.data };
    },
    "Failed to update department",
  );
}

export async function updateDepartmentStatus(
  id: string,
  input: UpdateDepartmentStatusInput,
): Promise<ApiResult<Department>> {
  const parsedId = departmentIdSchema.safeParse(id);
  if (!parsedId.success) {
    return { ok: false, error: "Invalid department id", status: 400 };
  }

  const parsedInput = updateDepartmentStatusInputSchema.safeParse(input);
  if (!parsedInput.success) {
    const issue = parsedInput.error.issues[0];
    return {
      ok: false,
      error: issue?.message ?? "Invalid department status update",
      status: 400,
    };
  }

  return requestJson(
    `/api/departments/${parsedId.data}/status`,
    {
      method: "PATCH",
      body: JSON.stringify(parsedInput.data),
    },
    (json) => {
      const parsed = departmentSchema.safeParse(json);
      if (!parsed.success) {
        return {
          success: false,
          error:
            "Update department status response did not match the expected schema",
        };
      }
      return { success: true, data: parsed.data };
    },
    "Failed to update department status",
  );
}
