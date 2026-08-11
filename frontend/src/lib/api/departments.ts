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
import { requestJson, type ApiResult } from "./client";



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
