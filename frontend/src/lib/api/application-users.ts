import {
  applicationUserIdSchema,
  applicationUserListQuerySchema,
  applicationUserSchema,
  createApplicationUserInputSchema,
  eligibleEmployeeListQuerySchema,
  paginatedApplicationUserResponseSchema,
  paginatedEligibleEmployeeResponseSchema,
  resetApplicationUserPasswordInputSchema,
  updateApplicationUserInputSchema,
  updateApplicationUserStatusInputSchema,
  type ApplicationUser,
  type ApplicationUserListQuery,
  type CreateApplicationUserInput,
  type EligibleEmployeeListQuery,
  type PaginatedApplicationUserResponse,
  type PaginatedEligibleEmployeeResponse,
  type ResetApplicationUserPasswordInput,
  type UpdateApplicationUserInput,
  type UpdateApplicationUserStatusInput,
} from "@printing-stationery/shared";
import { requestJson, type ApiResult } from "./client";

function buildListQueryString(query: ApplicationUserListQuery): string {
  const params = new URLSearchParams();
  params.set("page", String(query.page));
  params.set("pageSize", String(query.pageSize));
  params.set("status", query.status);
  if (query.search) {
    params.set("search", query.search);
  }
  if (query.role) {
    params.set("role", query.role);
  }
  if (query.branchId) {
    params.set("branchId", query.branchId);
  }
  return params.toString();
}

function buildEligibleQueryString(query: EligibleEmployeeListQuery): string {
  const params = new URLSearchParams();
  params.set("page", String(query.page));
  params.set("pageSize", String(query.pageSize));
  if (query.search) {
    params.set("search", query.search);
  }
  return params.toString();
}

export async function fetchApplicationUsers(
  rawQuery: Partial<ApplicationUserListQuery> = {},
): Promise<ApiResult<PaginatedApplicationUserResponse>> {
  const parsedQuery = applicationUserListQuerySchema.safeParse(rawQuery);
  if (!parsedQuery.success) {
    return {
      ok: false,
      error: "Invalid application user list query",
      status: 400,
    };
  }

  const queryString = buildListQueryString(parsedQuery.data);

  return requestJson(
    `/api/application-users?${queryString}`,
    { method: "GET" },
    (json) => {
      const parsed = paginatedApplicationUserResponseSchema.safeParse(json);
      if (!parsed.success) {
        return {
          success: false,
          error:
            "Application user list response did not match the expected schema",
        };
      }
      return { success: true, data: parsed.data };
    },
    "Failed to load application users",
  );
}

export async function fetchEligibleEmployees(
  rawQuery: Partial<EligibleEmployeeListQuery> = {},
): Promise<ApiResult<PaginatedEligibleEmployeeResponse>> {
  const parsedQuery = eligibleEmployeeListQuerySchema.safeParse(rawQuery);
  if (!parsedQuery.success) {
    return {
      ok: false,
      error: "Invalid eligible employee list query",
      status: 400,
    };
  }

  const queryString = buildEligibleQueryString(parsedQuery.data);

  return requestJson(
    `/api/application-users/eligible-employees?${queryString}`,
    { method: "GET" },
    (json) => {
      const parsed = paginatedEligibleEmployeeResponseSchema.safeParse(json);
      if (!parsed.success) {
        return {
          success: false,
          error:
            "Eligible employee list response did not match the expected schema",
        };
      }
      return { success: true, data: parsed.data };
    },
    "Failed to load eligible employees",
  );
}

export async function fetchApplicationUser(
  id: string,
): Promise<ApiResult<ApplicationUser>> {
  const parsedId = applicationUserIdSchema.safeParse(id);
  if (!parsedId.success) {
    return { ok: false, error: "Invalid application user id", status: 400 };
  }

  return requestJson(
    `/api/application-users/${parsedId.data}`,
    { method: "GET" },
    (json) => {
      const parsed = applicationUserSchema.safeParse(json);
      if (!parsed.success) {
        return {
          success: false,
          error: "Application user response did not match the expected schema",
        };
      }
      return { success: true, data: parsed.data };
    },
    "Failed to load application user",
  );
}

export async function createApplicationUser(
  input: CreateApplicationUserInput,
): Promise<ApiResult<ApplicationUser>> {
  const parsedInput = createApplicationUserInputSchema.safeParse(input);
  if (!parsedInput.success) {
    const issue = parsedInput.error.issues[0];
    return {
      ok: false,
      error: issue?.message ?? "Invalid application user input",
      status: 400,
    };
  }

  return requestJson(
    "/api/application-users",
    {
      method: "POST",
      body: JSON.stringify(parsedInput.data),
    },
    (json) => {
      const parsed = applicationUserSchema.safeParse(json);
      if (!parsed.success) {
        return {
          success: false,
          error:
            "Create application user response did not match the expected schema",
        };
      }
      return { success: true, data: parsed.data };
    },
    "Failed to create application user",
  );
}

export async function updateApplicationUser(
  id: string,
  input: UpdateApplicationUserInput,
): Promise<ApiResult<ApplicationUser>> {
  const parsedId = applicationUserIdSchema.safeParse(id);
  if (!parsedId.success) {
    return { ok: false, error: "Invalid application user id", status: 400 };
  }

  const parsedInput = updateApplicationUserInputSchema.safeParse(input);
  if (!parsedInput.success) {
    const issue = parsedInput.error.issues[0];
    return {
      ok: false,
      error: issue?.message ?? "Invalid application user update",
      status: 400,
    };
  }

  return requestJson(
    `/api/application-users/${parsedId.data}`,
    {
      method: "PATCH",
      body: JSON.stringify(parsedInput.data),
    },
    (json) => {
      const parsed = applicationUserSchema.safeParse(json);
      if (!parsed.success) {
        return {
          success: false,
          error:
            "Update application user response did not match the expected schema",
        };
      }
      return { success: true, data: parsed.data };
    },
    "Failed to update application user",
  );
}

export async function updateApplicationUserStatus(
  id: string,
  input: UpdateApplicationUserStatusInput,
): Promise<ApiResult<ApplicationUser>> {
  const parsedId = applicationUserIdSchema.safeParse(id);
  if (!parsedId.success) {
    return { ok: false, error: "Invalid application user id", status: 400 };
  }

  const parsedInput = updateApplicationUserStatusInputSchema.safeParse(input);
  if (!parsedInput.success) {
    const issue = parsedInput.error.issues[0];
    return {
      ok: false,
      error: issue?.message ?? "Invalid application user status update",
      status: 400,
    };
  }

  return requestJson(
    `/api/application-users/${parsedId.data}/status`,
    {
      method: "PATCH",
      body: JSON.stringify(parsedInput.data),
    },
    (json) => {
      const parsed = applicationUserSchema.safeParse(json);
      if (!parsed.success) {
        return {
          success: false,
          error:
            "Update application user status response did not match the expected schema",
        };
      }
      return { success: true, data: parsed.data };
    },
    "Failed to update application user status",
  );
}

export async function resetApplicationUserPassword(
  id: string,
  input: ResetApplicationUserPasswordInput,
): Promise<ApiResult<ApplicationUser>> {
  const parsedId = applicationUserIdSchema.safeParse(id);
  if (!parsedId.success) {
    return { ok: false, error: "Invalid application user id", status: 400 };
  }

  const parsedInput = resetApplicationUserPasswordInputSchema.safeParse(input);
  if (!parsedInput.success) {
    const issue = parsedInput.error.issues[0];
    return {
      ok: false,
      error: issue?.message ?? "Invalid password reset",
      status: 400,
    };
  }

  return requestJson(
    `/api/application-users/${parsedId.data}/reset-password`,
    {
      method: "POST",
      body: JSON.stringify(parsedInput.data),
    },
    (json) => {
      const parsed = applicationUserSchema.safeParse(json);
      if (!parsed.success) {
        return {
          success: false,
          error:
            "Reset password response did not match the expected schema",
        };
      }
      return { success: true, data: parsed.data };
    },
    "Failed to reset password",
  );
}
