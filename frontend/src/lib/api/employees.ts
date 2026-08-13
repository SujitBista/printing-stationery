import {
  createEmployeeInputSchema,
  employeeIdSchema,
  employeeImportConfirmInputSchema,
  employeeImportConfirmResponseSchema,
  employeeImportPreviewResponseSchema,
  employeeListQuerySchema,
  employeeSchema,
  paginatedEmployeeResponseSchema,
  updateEmployeeInputSchema,
  updateEmployeeStatusInputSchema,
  type CreateEmployeeInput,
  type Employee,
  type EmployeeImportConfirmInput,
  type EmployeeImportConfirmResponse,
  type EmployeeImportPreviewResponse,
  type EmployeeListQuery,
  type PaginatedEmployeeResponse,
  type UpdateEmployeeInput,
  type UpdateEmployeeStatusInput,
} from "@printing-stationery/shared";
import { requestJson, type ApiResult } from "./client";

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

export async function previewEmployeeImport(
  file: File,
): Promise<ApiResult<EmployeeImportPreviewResponse>> {
  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    return { ok: false, error: "Only .xlsx files are accepted.", status: 400 };
  }

  const formData = new FormData();
  formData.append("file", file);

  return requestJson(
    "/api/employees/import/preview",
    {
      method: "POST",
      body: formData,
    },
    (json) => {
      const parsed = employeeImportPreviewResponseSchema.safeParse(json);
      if (!parsed.success) {
        return {
          success: false,
          error: "Import preview response did not match the expected schema",
        };
      }
      return { success: true, data: parsed.data };
    },
    "Failed to preview employee import",
  );
}

export async function confirmEmployeeImport(
  input: EmployeeImportConfirmInput,
): Promise<ApiResult<EmployeeImportConfirmResponse>> {
  const parsedInput = employeeImportConfirmInputSchema.safeParse(input);
  if (!parsedInput.success) {
    const issue = parsedInput.error.issues[0];
    return {
      ok: false,
      error: issue?.message ?? "Invalid employee import request",
      status: 400,
    };
  }

  return requestJson(
    "/api/employees/import/confirm",
    {
      method: "POST",
      body: JSON.stringify(parsedInput.data),
    },
    (json) => {
      const parsed = employeeImportConfirmResponseSchema.safeParse(json);
      if (!parsed.success) {
        return {
          success: false,
          error: "Import confirm response did not match the expected schema",
        };
      }
      return { success: true, data: parsed.data };
    },
    "Failed to import employees",
  );
}
