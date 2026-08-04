import {
  branchIdSchema,
  branchListQuerySchema,
  branchSchema,
  createBranchInputSchema,
  paginatedBranchResponseSchema,
  updateBranchInputSchema,
  updateBranchStatusInputSchema,
  type Branch,
  type BranchListQuery,
  type CreateBranchInput,
  type PaginatedBranchResponse,
  type UpdateBranchInput,
  type UpdateBranchStatusInput,
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

function buildQueryString(query: BranchListQuery): string {
  const params = new URLSearchParams();
  params.set("page", String(query.page));
  params.set("pageSize", String(query.pageSize));
  params.set("status", query.status);
  if (query.search) {
    params.set("search", query.search);
  }
  return params.toString();
}

export async function fetchBranches(
  rawQuery: Partial<BranchListQuery> = {},
): Promise<ApiResult<PaginatedBranchResponse>> {
  const parsedQuery = branchListQuerySchema.safeParse(rawQuery);
  if (!parsedQuery.success) {
    return { ok: false, error: "Invalid branch list query", status: 400 };
  }

  const queryString = buildQueryString(parsedQuery.data);

  return requestJson(
    `/api/branches?${queryString}`,
    { method: "GET" },
    (json) => {
      const parsed = paginatedBranchResponseSchema.safeParse(json);
      if (!parsed.success) {
        return {
          success: false,
          error: "Branch list response did not match the expected schema",
        };
      }
      return { success: true, data: parsed.data };
    },
    "Failed to load branches",
  );
}

export async function fetchBranch(
  id: string,
): Promise<ApiResult<Branch>> {
  const parsedId = branchIdSchema.safeParse(id);
  if (!parsedId.success) {
    return { ok: false, error: "Invalid branch id", status: 400 };
  }

  return requestJson(
    `/api/branches/${parsedId.data}`,
    { method: "GET" },
    (json) => {
      const parsed = branchSchema.safeParse(json);
      if (!parsed.success) {
        return {
          success: false,
          error: "Branch response did not match the expected schema",
        };
      }
      return { success: true, data: parsed.data };
    },
    "Failed to load branch",
  );
}

export async function createBranch(
  input: CreateBranchInput,
): Promise<ApiResult<Branch>> {
  const parsedInput = createBranchInputSchema.safeParse(input);
  if (!parsedInput.success) {
    const issue = parsedInput.error.issues[0];
    return {
      ok: false,
      error: issue?.message ?? "Invalid branch input",
      status: 400,
    };
  }

  return requestJson(
    "/api/branches",
    {
      method: "POST",
      body: JSON.stringify(parsedInput.data),
    },
    (json) => {
      const parsed = branchSchema.safeParse(json);
      if (!parsed.success) {
        return {
          success: false,
          error: "Create branch response did not match the expected schema",
        };
      }
      return { success: true, data: parsed.data };
    },
    "Failed to create branch",
  );
}

export async function updateBranch(
  id: string,
  input: UpdateBranchInput,
): Promise<ApiResult<Branch>> {
  const parsedId = branchIdSchema.safeParse(id);
  if (!parsedId.success) {
    return { ok: false, error: "Invalid branch id", status: 400 };
  }

  const parsedInput = updateBranchInputSchema.safeParse(input);
  if (!parsedInput.success) {
    const issue = parsedInput.error.issues[0];
    return {
      ok: false,
      error: issue?.message ?? "Invalid branch update",
      status: 400,
    };
  }

  return requestJson(
    `/api/branches/${parsedId.data}`,
    {
      method: "PATCH",
      body: JSON.stringify(parsedInput.data),
    },
    (json) => {
      const parsed = branchSchema.safeParse(json);
      if (!parsed.success) {
        return {
          success: false,
          error: "Update branch response did not match the expected schema",
        };
      }
      return { success: true, data: parsed.data };
    },
    "Failed to update branch",
  );
}

export async function updateBranchStatus(
  id: string,
  input: UpdateBranchStatusInput,
): Promise<ApiResult<Branch>> {
  const parsedId = branchIdSchema.safeParse(id);
  if (!parsedId.success) {
    return { ok: false, error: "Invalid branch id", status: 400 };
  }

  const parsedInput = updateBranchStatusInputSchema.safeParse(input);
  if (!parsedInput.success) {
    const issue = parsedInput.error.issues[0];
    return {
      ok: false,
      error: issue?.message ?? "Invalid branch status update",
      status: 400,
    };
  }

  return requestJson(
    `/api/branches/${parsedId.data}/status`,
    {
      method: "PATCH",
      body: JSON.stringify(parsedInput.data),
    },
    (json) => {
      const parsed = branchSchema.safeParse(json);
      if (!parsed.success) {
        return {
          success: false,
          error:
            "Update branch status response did not match the expected schema",
        };
      }
      return { success: true, data: parsed.data };
    },
    "Failed to update branch status",
  );
}
