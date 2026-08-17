import {
  createStoreUserInputSchema,
  eligibleStoreApplicationUserListQuerySchema,
  eligibleStoreUserStoreListQuerySchema,
  paginatedEligibleStoreApplicationUserResponseSchema,
  paginatedEligibleStoreUserStoreResponseSchema,
  paginatedStoreUserResponseSchema,
  storeUserIdSchema,
  storeUserListQuerySchema,
  storeUserSchema,
  updateStoreUserInputSchema,
  updateStoreUserStatusInputSchema,
  type CreateStoreUserInput,
  type EligibleStoreApplicationUserListQuery,
  type EligibleStoreUserStoreListQuery,
  type PaginatedEligibleStoreApplicationUserResponse,
  type PaginatedEligibleStoreUserStoreResponse,
  type PaginatedStoreUserResponse,
  type StoreUser,
  type StoreUserListQuery,
  type UpdateStoreUserInput,
  type UpdateStoreUserStatusInput,
} from "@printing-stationery/shared";
import { requestJson, type ApiResult } from "./client";

function buildListQueryString(query: StoreUserListQuery): string {
  const params = new URLSearchParams();
  params.set("page", String(query.page));
  params.set("pageSize", String(query.pageSize));
  params.set("status", query.status);
  if (query.search) {
    params.set("search", query.search);
  }
  if (query.storeId) {
    params.set("storeId", query.storeId);
  }
  if (query.branchId) {
    params.set("branchId", query.branchId);
  }
  return params.toString();
}

function buildEligibleUserQueryString(
  query: EligibleStoreApplicationUserListQuery,
): string {
  const params = new URLSearchParams();
  params.set("storeId", query.storeId);
  params.set("role", query.role);
  params.set("page", String(query.page));
  params.set("pageSize", String(query.pageSize));
  if (query.search) {
    params.set("search", query.search);
  }
  if (query.excludeAssignmentId) {
    params.set("excludeAssignmentId", query.excludeAssignmentId);
  }
  return params.toString();
}

function buildEligibleStoreQueryString(
  query: EligibleStoreUserStoreListQuery,
): string {
  const params = new URLSearchParams();
  params.set("page", String(query.page));
  params.set("pageSize", String(query.pageSize));
  if (query.search) {
    params.set("search", query.search);
  }
  return params.toString();
}

export async function fetchStoreUsers(
  rawQuery: Partial<StoreUserListQuery> = {},
): Promise<ApiResult<PaginatedStoreUserResponse>> {
  const parsedQuery = storeUserListQuerySchema.safeParse(rawQuery);
  if (!parsedQuery.success) {
    return {
      ok: false,
      error: "Invalid store user list query",
      status: 400,
    };
  }

  const queryString = buildListQueryString(parsedQuery.data);

  return requestJson(
    `/api/store-users?${queryString}`,
    { method: "GET" },
    (json) => {
      const parsed = paginatedStoreUserResponseSchema.safeParse(json);
      if (!parsed.success) {
        return {
          success: false,
          error: "Store user list response did not match the expected schema",
        };
      }
      return { success: true, data: parsed.data };
    },
    "Failed to load store users",
  );
}

export async function fetchEligibleStores(
  rawQuery: Partial<EligibleStoreUserStoreListQuery> = {},
): Promise<ApiResult<PaginatedEligibleStoreUserStoreResponse>> {
  const parsedQuery = eligibleStoreUserStoreListQuerySchema.safeParse(rawQuery);
  if (!parsedQuery.success) {
    return {
      ok: false,
      error: "Invalid eligible store list query",
      status: 400,
    };
  }

  const queryString = buildEligibleStoreQueryString(parsedQuery.data);

  return requestJson(
    `/api/store-users/eligible-stores?${queryString}`,
    { method: "GET" },
    (json) => {
      const parsed =
        paginatedEligibleStoreUserStoreResponseSchema.safeParse(json);
      if (!parsed.success) {
        return {
          success: false,
          error:
            "Eligible store list response did not match the expected schema",
        };
      }
      return { success: true, data: parsed.data };
    },
    "Failed to load eligible stores",
  );
}

export async function fetchEligibleStoreApplicationUsers(
  rawQuery: Partial<EligibleStoreApplicationUserListQuery>,
): Promise<ApiResult<PaginatedEligibleStoreApplicationUserResponse>> {
  const parsedQuery =
    eligibleStoreApplicationUserListQuerySchema.safeParse(rawQuery);
  if (!parsedQuery.success) {
    return {
      ok: false,
      error: "Invalid eligible application user list query",
      status: 400,
    };
  }

  const queryString = buildEligibleUserQueryString(parsedQuery.data);

  return requestJson(
    `/api/store-users/eligible-application-users?${queryString}`,
    { method: "GET" },
    (json) => {
      const parsed =
        paginatedEligibleStoreApplicationUserResponseSchema.safeParse(json);
      if (!parsed.success) {
        return {
          success: false,
          error:
            "Eligible application user list response did not match the expected schema",
        };
      }
      return { success: true, data: parsed.data };
    },
    "Failed to load eligible application users",
  );
}

export async function fetchStoreUser(
  id: string,
): Promise<ApiResult<StoreUser>> {
  const parsedId = storeUserIdSchema.safeParse(id);
  if (!parsedId.success) {
    return { ok: false, error: "Invalid store user id", status: 400 };
  }

  return requestJson(
    `/api/store-users/${parsedId.data}`,
    { method: "GET" },
    (json) => {
      const parsed = storeUserSchema.safeParse(json);
      if (!parsed.success) {
        return {
          success: false,
          error: "Store user response did not match the expected schema",
        };
      }
      return { success: true, data: parsed.data };
    },
    "Failed to load store user",
  );
}

export async function createStoreUser(
  input: CreateStoreUserInput,
): Promise<ApiResult<StoreUser>> {
  const parsedInput = createStoreUserInputSchema.safeParse(input);
  if (!parsedInput.success) {
    const issue = parsedInput.error.issues[0];
    return {
      ok: false,
      error: issue?.message ?? "Invalid store user input",
      status: 400,
    };
  }

  return requestJson(
    "/api/store-users",
    {
      method: "POST",
      body: JSON.stringify(parsedInput.data),
    },
    (json) => {
      const parsed = storeUserSchema.safeParse(json);
      if (!parsed.success) {
        return {
          success: false,
          error: "Create store user response did not match the expected schema",
        };
      }
      return { success: true, data: parsed.data };
    },
    "Failed to create store user",
  );
}

export async function updateStoreUser(
  id: string,
  input: UpdateStoreUserInput,
): Promise<ApiResult<StoreUser>> {
  const parsedId = storeUserIdSchema.safeParse(id);
  if (!parsedId.success) {
    return { ok: false, error: "Invalid store user id", status: 400 };
  }

  const parsedInput = updateStoreUserInputSchema.safeParse(input);
  if (!parsedInput.success) {
    const issue = parsedInput.error.issues[0];
    return {
      ok: false,
      error: issue?.message ?? "Invalid store user update",
      status: 400,
    };
  }

  return requestJson(
    `/api/store-users/${parsedId.data}`,
    {
      method: "PATCH",
      body: JSON.stringify(parsedInput.data),
    },
    (json) => {
      const parsed = storeUserSchema.safeParse(json);
      if (!parsed.success) {
        return {
          success: false,
          error: "Update store user response did not match the expected schema",
        };
      }
      return { success: true, data: parsed.data };
    },
    "Failed to update store user",
  );
}

export async function updateStoreUserStatus(
  id: string,
  input: UpdateStoreUserStatusInput,
): Promise<ApiResult<StoreUser>> {
  const parsedId = storeUserIdSchema.safeParse(id);
  if (!parsedId.success) {
    return { ok: false, error: "Invalid store user id", status: 400 };
  }

  const parsedInput = updateStoreUserStatusInputSchema.safeParse(input);
  if (!parsedInput.success) {
    const issue = parsedInput.error.issues[0];
    return {
      ok: false,
      error: issue?.message ?? "Invalid store user status update",
      status: 400,
    };
  }

  return requestJson(
    `/api/store-users/${parsedId.data}/status`,
    {
      method: "PATCH",
      body: JSON.stringify(parsedInput.data),
    },
    (json) => {
      const parsed = storeUserSchema.safeParse(json);
      if (!parsed.success) {
        return {
          success: false,
          error:
            "Update store user status response did not match the expected schema",
        };
      }
      return { success: true, data: parsed.data };
    },
    "Failed to update store user status",
  );
}
