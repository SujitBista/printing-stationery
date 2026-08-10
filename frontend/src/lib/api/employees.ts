import {
  createEmployeeInputSchema,
  employeeIdSchema,
  employeeListQuerySchema,
  employeeSchema,
  paginatedEmployeeResponseSchema,
  updateEmployeeInputSchema,
  updateEmployeeStatusInputSchema,
  type CreateEmployeeInput,
  type Employee,
  type EmployeeListQuery,
  type PaginatedEmployeeResponse,
  type UpdateEmployeeInput,
  type UpdateEmployeeStatusInput,
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

function buildQueryString(query: EmployeeListQuery): string {
  const params = new URLSearchParams();
  params.set("page", String(query.page));
  params.set("pageSize", String(query.pageSize));
  params.set("status", query.status);
  if (query.search) {
    params.set("search", query.search);
  }
  if (query.branchId) {
    params.set("branchId", query.branchId);
  }
  return params.toString();
}

export async function fetchEmployees(
  rawQuery: Partial<EmployeeListQuery> = {},
): Promise<ApiResult<PaginatedEmployeeResponse>> {
  const parsedQuery = employeeListQuerySchema.safeParse(rawQuery);
  if (!parsedQuery.success) {
    return { ok: false, error: "Invalid employee list query", status: 400 };
  }

  const queryString = buildQueryString(parsedQuery.data);

  return requestJson(
    `/api/employees?${queryString}`,
    { method: "GET" },
    (json) => {
      const parsed = paginatedEmployeeResponseSchema.safeParse(json);
      if (!parsed.success) {
        return {
          success: false,
          error: "Employee list response did not match the expected schema",
        };
      }
      return { success: true, data: parsed.data };
    },
    "Failed to load employees",
  );
}

export async function fetchEmployee(id: string): Promise<ApiResult<Employee>> {
  const parsedId = employeeIdSchema.safeParse(id);
  if (!parsedId.success) {
    return { ok: false, error: "Invalid employee id", status: 400 };
  }

  return requestJson(
    `/api/employees/${parsedId.data}`,
    { method: "GET" },
    (json) => {
      const parsed = employeeSchema.safeParse(json);
      if (!parsed.success) {
        return {
          success: false,
          error: "Employee response did not match the expected schema",
        };
      }
      return { success: true, data: parsed.data };
    },
    "Failed to load employee",
  );
}

export async function createEmployee(
  input: CreateEmployeeInput,
): Promise<ApiResult<Employee>> {
  const parsedInput = createEmployeeInputSchema.safeParse(input);
  if (!parsedInput.success) {
    const issue = parsedInput.error.issues[0];
    return {
      ok: false,
      error: issue?.message ?? "Invalid employee input",
      status: 400,
    };
  }

  return requestJson(
    "/api/employees",
    {
      method: "POST",
      body: JSON.stringify(parsedInput.data),
    },
    (json) => {
      const parsed = employeeSchema.safeParse(json);
      if (!parsed.success) {
        return {
          success: false,
          error: "Create employee response did not match the expected schema",
        };
      }
      return { success: true, data: parsed.data };
    },
    "Failed to create employee",
  );
}

export async function updateEmployee(
  id: string,
  input: UpdateEmployeeInput,
): Promise<ApiResult<Employee>> {
  const parsedId = employeeIdSchema.safeParse(id);
  if (!parsedId.success) {
    return { ok: false, error: "Invalid employee id", status: 400 };
  }

  const parsedInput = updateEmployeeInputSchema.safeParse(input);
  if (!parsedInput.success) {
    const issue = parsedInput.error.issues[0];
    return {
      ok: false,
      error: issue?.message ?? "Invalid employee update",
      status: 400,
    };
  }

  return requestJson(
    `/api/employees/${parsedId.data}`,
    {
      method: "PATCH",
      body: JSON.stringify(parsedInput.data),
    },
    (json) => {
      const parsed = employeeSchema.safeParse(json);
      if (!parsed.success) {
        return {
          success: false,
          error: "Update employee response did not match the expected schema",
        };
      }
      return { success: true, data: parsed.data };
    },
    "Failed to update employee",
  );
}

export async function updateEmployeeStatus(
  id: string,
  input: UpdateEmployeeStatusInput,
): Promise<ApiResult<Employee>> {
  const parsedId = employeeIdSchema.safeParse(id);
  if (!parsedId.success) {
    return { ok: false, error: "Invalid employee id", status: 400 };
  }

  const parsedInput = updateEmployeeStatusInputSchema.safeParse(input);
  if (!parsedInput.success) {
    const issue = parsedInput.error.issues[0];
    return {
      ok: false,
      error: issue?.message ?? "Invalid employee status update",
      status: 400,
    };
  }

  return requestJson(
    `/api/employees/${parsedId.data}/status`,
    {
      method: "PATCH",
      body: JSON.stringify(parsedInput.data),
    },
    (json) => {
      const parsed = employeeSchema.safeParse(json);
      if (!parsed.success) {
        return {
          success: false,
          error:
            "Update employee status response did not match the expected schema",
        };
      }
      return { success: true, data: parsed.data };
    },
    "Failed to update employee status",
  );
}
