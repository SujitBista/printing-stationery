import {
  branchIdSchema,
  branchImportConfirmInputSchema,
  branchImportConfirmResponseSchema,
  branchImportPreviewResponseSchema,
  branchListQuerySchema,
  branchSchema,
  createBranchInputSchema,
  paginatedBranchResponseSchema,
  updateBranchInputSchema,
  updateBranchStatusInputSchema,
  type Branch,
  type BranchImportConfirmInput,
  type BranchImportConfirmResponse,
  type BranchImportPreviewResponse,
  type BranchListQuery,
  type CreateBranchInput,
  type PaginatedBranchResponse,
  type UpdateBranchInput,
  type UpdateBranchStatusInput,
} from "@printing-stationery/shared";
import { requestJson, type ApiResult } from "./client";

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

export async function previewBranchImport(
  file: File,
): Promise<ApiResult<BranchImportPreviewResponse>> {
  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    return { ok: false, error: "Only .xlsx files are accepted.", status: 400 };
  }

  const formData = new FormData();
  formData.append("file", file);

  return requestJson(
    "/api/branches/import/preview",
    {
      method: "POST",
      body: formData,
    },
    (json) => {
      const parsed = branchImportPreviewResponseSchema.safeParse(json);
      if (!parsed.success) {
        return {
          success: false,
          error: "Import preview response did not match the expected schema",
        };
      }
      return { success: true, data: parsed.data };
    },
    "Failed to preview branch import",
  );
}

export async function confirmBranchImport(
  input: BranchImportConfirmInput,
): Promise<ApiResult<BranchImportConfirmResponse>> {
  const parsedInput = branchImportConfirmInputSchema.safeParse(input);
  if (!parsedInput.success) {
    const issue = parsedInput.error.issues[0];
    return {
      ok: false,
      error: issue?.message ?? "Invalid branch import request",
      status: 400,
    };
  }

  return requestJson(
    "/api/branches/import/confirm",
    {
      method: "POST",
      body: JSON.stringify(parsedInput.data),
    },
    (json) => {
      const parsed = branchImportConfirmResponseSchema.safeParse(json);
      if (!parsed.success) {
        return {
          success: false,
          error: "Import confirm response did not match the expected schema",
        };
      }
      return { success: true, data: parsed.data };
    },
    "Failed to import branches",
  );
}
