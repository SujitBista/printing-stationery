import {
  cancelOpeningStockInputSchema,
  createManualOpeningStockInputSchema,
  openingStockIdSchema,
  openingStockPreviewSchema,
  openingStockListQuerySchema,
  openingStockPostResultSchema,
  openingStockValidationResultSchema,
  paginatedOpeningStockResponseSchema,
  postOpeningStockInputSchema,
  updateOpeningStockMappingsInputSchema,
  type CancelOpeningStockInput,
  type CreateManualOpeningStockInput,
  type OpeningStockPreview,
  type OpeningStockListQuery,
  type OpeningStockPostResult,
  type OpeningStockValidationResult,
  type PaginatedOpeningStockResponse,
  type PostOpeningStockInput,
  type UpdateOpeningStockMappingsInput,
} from "@printing-stationery/shared";
import { requestJson, type ApiResult } from "./client";

function buildQueryString(query: OpeningStockListQuery): string {
  const params = new URLSearchParams();
  params.set("page", String(query.page));
  params.set("pageSize", String(query.pageSize));
  params.set("status", query.status);
  params.set("sourceType", query.sourceType);
  if (query.search) {
    params.set("search", query.search);
  }
  return params.toString();
}

export async function fetchOpeningStockBatches(
  rawQuery: Partial<OpeningStockListQuery> = {},
): Promise<ApiResult<PaginatedOpeningStockResponse>> {
  const parsedQuery = openingStockListQuerySchema.safeParse(rawQuery);
  if (!parsedQuery.success) {
    return { ok: false, error: "Invalid opening stock list query", status: 400 };
  }
  return requestJson(
    `/api/opening-stock?${buildQueryString(parsedQuery.data)}`,
    { method: "GET" },
    (json) => {
      const parsed = paginatedOpeningStockResponseSchema.safeParse(json);
      return parsed.success
        ? { success: true, data: parsed.data }
        : { success: false, error: "Opening stock list response did not match the expected schema" };
    },
    "Failed to load opening stock batches",
  );
}

export async function fetchOpeningStockBatch(
  id: string,
): Promise<ApiResult<OpeningStockPreview>> {
  const parsedId = openingStockIdSchema.safeParse(id);
  if (!parsedId.success) {
    return { ok: false, error: "Invalid opening stock batch id", status: 400 };
  }
  return requestJson(
    `/api/opening-stock/${parsedId.data}`,
    { method: "GET" },
    (json) => {
      const parsed = openingStockPreviewSchema.safeParse(json);
      return parsed.success
        ? { success: true, data: parsed.data }
        : { success: false, error: "Opening stock batch response did not match the expected schema" };
    },
    "Failed to load opening stock batch",
  );
}

export async function createManualOpeningStock(
  input: CreateManualOpeningStockInput,
): Promise<ApiResult<OpeningStockPreview>> {
  const parsedInput = createManualOpeningStockInputSchema.safeParse(input);
  if (!parsedInput.success) {
    return { ok: false, error: parsedInput.error.issues[0]?.message ?? "Invalid manual opening stock input", status: 400 };
  }
  return requestJson(
    "/api/opening-stock/manual",
    { method: "POST", body: JSON.stringify(parsedInput.data) },
    (json) => {
      const parsed = openingStockPreviewSchema.safeParse(json);
      return parsed.success
        ? { success: true, data: parsed.data }
        : { success: false, error: "Manual opening stock response did not match the expected schema" };
    },
    "Failed to create manual opening stock batch",
  );
}

export async function previewLegacyOpeningStockImport(
  file: File,
): Promise<ApiResult<OpeningStockPreview>> {
  if (!file.name.toLowerCase().endsWith(".xls")) {
    return { ok: false, error: "Only the legacy .xls HTML export is accepted.", status: 400 };
  }
  const formData = new FormData();
  formData.append("file", file);
  return requestJson(
    "/api/opening-stock/import/preview",
    { method: "POST", body: formData },
    (json) => {
      const parsed = openingStockPreviewSchema.safeParse(json);
      return parsed.success
        ? { success: true, data: parsed.data }
        : { success: false, error: "Import preview response did not match the expected schema" };
    },
    "Failed to preview legacy opening stock import",
  );
}

export async function updateOpeningStockMappings(
  id: string,
  input: UpdateOpeningStockMappingsInput,
): Promise<ApiResult<OpeningStockPreview>> {
  const parsedId = openingStockIdSchema.safeParse(id);
  const parsedInput = updateOpeningStockMappingsInputSchema.safeParse(input);
  if (!parsedId.success || !parsedInput.success) {
    return { ok: false, error: "Invalid opening stock mapping update", status: 400 };
  }
  return requestJson(
    `/api/opening-stock/${parsedId.data}/mappings`,
    { method: "PATCH", body: JSON.stringify(parsedInput.data) },
    (json) => {
      const parsed = openingStockPreviewSchema.safeParse(json);
      return parsed.success
        ? { success: true, data: parsed.data }
        : { success: false, error: "Mapping update response did not match the expected schema" };
    },
    "Failed to update opening stock mappings",
  );
}

export async function validateOpeningStock(
  id: string,
): Promise<ApiResult<OpeningStockValidationResult>> {
  const parsedId = openingStockIdSchema.safeParse(id);
  if (!parsedId.success) {
    return { ok: false, error: "Invalid opening stock batch id", status: 400 };
  }
  return requestJson(
    `/api/opening-stock/${parsedId.data}/validate`,
    { method: "POST", body: JSON.stringify({}) },
    (json) => {
      const parsed = openingStockValidationResultSchema.safeParse(json);
      return parsed.success
        ? { success: true, data: parsed.data }
        : { success: false, error: "Validation response did not match the expected schema" };
    },
    "Failed to validate opening stock batch",
  );
}

export async function postOpeningStock(
  id: string,
  input: PostOpeningStockInput,
): Promise<ApiResult<OpeningStockPostResult>> {
  const parsedId = openingStockIdSchema.safeParse(id);
  const parsedInput = postOpeningStockInputSchema.safeParse(input);
  if (!parsedId.success || !parsedInput.success) {
    return { ok: false, error: "Invalid opening stock post request", status: 400 };
  }
  return requestJson(
    `/api/opening-stock/${parsedId.data}/post`,
    { method: "POST", body: JSON.stringify(parsedInput.data) },
    (json) => {
      const parsed = openingStockPostResultSchema.safeParse(json);
      return parsed.success
        ? { success: true, data: parsed.data }
        : { success: false, error: "Post response did not match the expected schema" };
    },
    "Failed to post opening stock batch",
  );
}

export async function cancelOpeningStock(
  id: string,
  input: CancelOpeningStockInput,
): Promise<ApiResult<OpeningStockPreview>> {
  const parsedId = openingStockIdSchema.safeParse(id);
  const parsedInput = cancelOpeningStockInputSchema.safeParse(input);
  if (!parsedId.success || !parsedInput.success) {
    return { ok: false, error: "Invalid opening stock cancellation request", status: 400 };
  }
  return requestJson(
    `/api/opening-stock/${parsedId.data}/cancel`,
    { method: "POST", body: JSON.stringify(parsedInput.data) },
    (json) => {
      const parsed = openingStockPreviewSchema.safeParse(json);
      return parsed.success
        ? { success: true, data: parsed.data }
        : { success: false, error: "Cancel response did not match the expected schema" };
    },
    "Failed to cancel opening stock batch",
  );
}
