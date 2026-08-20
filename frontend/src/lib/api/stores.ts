import {
  createStoreInputSchema,
  paginatedStoreResponseSchema,
  storeIdSchema,
  storeImportConfirmInputSchema,
  storeImportConfirmResponseSchema,
  storeImportPreviewResponseSchema,
  storeListQuerySchema,
  storeSchema,
  updateStoreInputSchema,
  updateStoreStatusInputSchema,
  type CreateStoreInput,
  type PaginatedStoreResponse,
  type Store,
  type StoreImportConfirmInput,
  type StoreImportConfirmResponse,
  type StoreImportPreviewResponse,
  type StoreListQuery,
  type UpdateStoreInput,
  type UpdateStoreStatusInput,
} from "@printing-stationery/shared";
import { requestJson, type ApiResult } from "./client";



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

export async function previewStoreImport(
  file: File,
): Promise<ApiResult<StoreImportPreviewResponse>> {
  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    return { ok: false, error: "Only .xlsx files are accepted.", status: 400 };
  }

  const formData = new FormData();
  formData.append("file", file);

  return requestJson(
    "/api/stores/import/preview",
    {
      method: "POST",
      body: formData,
    },
    (json) => {
      const parsed = storeImportPreviewResponseSchema.safeParse(json);
      if (!parsed.success) {
        return {
          success: false,
          error: "Import preview response did not match the expected schema",
        };
      }
      return { success: true, data: parsed.data };
    },
    "Failed to preview store import",
  );
}

export async function confirmStoreImport(
  input: StoreImportConfirmInput,
): Promise<ApiResult<StoreImportConfirmResponse>> {
  const parsedInput = storeImportConfirmInputSchema.safeParse(input);
  if (!parsedInput.success) {
    const issue = parsedInput.error.issues[0];
    return {
      ok: false,
      error: issue?.message ?? "Invalid store import request",
      status: 400,
    };
  }

  return requestJson(
    "/api/stores/import/confirm",
    {
      method: "POST",
      body: JSON.stringify(parsedInput.data),
    },
    (json) => {
      const parsed = storeImportConfirmResponseSchema.safeParse(json);
      if (!parsed.success) {
        return {
          success: false,
          error: "Import confirm response did not match the expected schema",
        };
      }
      return { success: true, data: parsed.data };
    },
    "Failed to import stores",
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
