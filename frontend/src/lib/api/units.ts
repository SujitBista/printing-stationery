import {
  createUnitInputSchema,
  paginatedUnitResponseSchema,
  unitIdSchema,
  unitImportConfirmInputSchema,
  unitImportConfirmResponseSchema,
  unitImportPreviewResponseSchema,
  unitListQuerySchema,
  unitSchema,
  updateUnitInputSchema,
  updateUnitStatusInputSchema,
  type CreateUnitInput,
  type PaginatedUnitResponse,
  type Unit,
  type UnitImportConfirmInput,
  type UnitImportConfirmResponse,
  type UnitImportPreviewResponse,
  type UnitListQuery,
  type UpdateUnitInput,
  type UpdateUnitStatusInput,
} from "@printing-stationery/shared";
import { requestJson, type ApiResult } from "./client";



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

export async function previewUnitImport(
  file: File,
): Promise<ApiResult<UnitImportPreviewResponse>> {
  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    return { ok: false, error: "Only .xlsx files are accepted.", status: 400 };
  }

  const formData = new FormData();
  formData.append("file", file);

  return requestJson(
    "/api/units/import/preview",
    {
      method: "POST",
      body: formData,
    },
    (json) => {
      const parsed = unitImportPreviewResponseSchema.safeParse(json);
      if (!parsed.success) {
        return {
          success: false,
          error: "Import preview response did not match the expected schema",
        };
      }
      return { success: true, data: parsed.data };
    },
    "Failed to preview unit import",
  );
}

export async function confirmUnitImport(
  input: UnitImportConfirmInput,
): Promise<ApiResult<UnitImportConfirmResponse>> {
  const parsedInput = unitImportConfirmInputSchema.safeParse(input);
  if (!parsedInput.success) {
    const issue = parsedInput.error.issues[0];
    return {
      ok: false,
      error: issue?.message ?? "Invalid unit import request",
      status: 400,
    };
  }

  return requestJson(
    "/api/units/import/confirm",
    {
      method: "POST",
      body: JSON.stringify(parsedInput.data),
    },
    (json) => {
      const parsed = unitImportConfirmResponseSchema.safeParse(json);
      if (!parsed.success) {
        return {
          success: false,
          error: "Import confirm response did not match the expected schema",
        };
      }
      return { success: true, data: parsed.data };
    },
    "Failed to import units",
  );
}
