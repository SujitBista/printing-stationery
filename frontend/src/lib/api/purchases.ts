import {
  createPurchaseInputSchema,
  deletePurchaseInputSchema,
  paginatedPurchaseResponseSchema,
  purchaseIdSchema,
  purchaseListQuerySchema,
  purchaseSchema,
  updatePurchaseInputSchema,
  type CreatePurchaseInput,
  type DeletePurchaseInput,
  type PaginatedPurchaseResponse,
  type Purchase,
  type PurchaseListQuery,
  type UpdatePurchaseInput,
} from "@printing-stationery/shared";
import { requestJson, type ApiResult } from "./client";

function buildQueryString(query: PurchaseListQuery): string {
  const params = new URLSearchParams();
  params.set("page", String(query.page));
  params.set("pageSize", String(query.pageSize));
  if (query.search) {
    params.set("search", query.search);
  }
  if (query.storeId) {
    params.set("storeId", query.storeId);
  }
  if (query.partyId) {
    params.set("partyId", query.partyId);
  }
  if (query.fiscalYear) {
    params.set("fiscalYear", query.fiscalYear);
  }
  return params.toString();
}

export async function fetchPurchases(
  rawQuery: Partial<PurchaseListQuery> = {},
): Promise<ApiResult<PaginatedPurchaseResponse>> {
  const parsedQuery = purchaseListQuerySchema.safeParse(rawQuery);
  if (!parsedQuery.success) {
    return { ok: false, error: "Invalid purchase list query", status: 400 };
  }

  return requestJson(
    `/api/purchases?${buildQueryString(parsedQuery.data)}`,
    { method: "GET" },
    (json) => {
      const parsed = paginatedPurchaseResponseSchema.safeParse(json);
      if (!parsed.success) {
        return {
          success: false,
          error: "Purchase list response did not match the expected schema",
        };
      }
      return { success: true, data: parsed.data };
    },
    "Failed to load purchases",
  );
}

export async function fetchPurchase(
  id: string,
): Promise<ApiResult<Purchase>> {
  const parsedId = purchaseIdSchema.safeParse(id);
  if (!parsedId.success) {
    return { ok: false, error: "Invalid purchase id", status: 400 };
  }

  return requestJson(
    `/api/purchases/${parsedId.data}`,
    { method: "GET" },
    (json) => {
      const parsed = purchaseSchema.safeParse(json);
      if (!parsed.success) {
        return {
          success: false,
          error: "Purchase response did not match the expected schema",
        };
      }
      return { success: true, data: parsed.data };
    },
    "Failed to load purchase",
  );
}

export async function createPurchase(
  input: CreatePurchaseInput,
): Promise<ApiResult<Purchase>> {
  const parsedInput = createPurchaseInputSchema.safeParse(input);
  if (!parsedInput.success) {
    const issue = parsedInput.error.issues[0];
    return {
      ok: false,
      error: issue?.message ?? "Invalid purchase input",
      status: 400,
    };
  }

  return requestJson(
    "/api/purchases",
    {
      method: "POST",
      body: JSON.stringify(parsedInput.data),
    },
    (json) => {
      const parsed = purchaseSchema.safeParse(json);
      if (!parsed.success) {
        return {
          success: false,
          error: "Create purchase response did not match the expected schema",
        };
      }
      return { success: true, data: parsed.data };
    },
    "Failed to create purchase",
  );
}

export async function updatePurchase(
  id: string,
  input: UpdatePurchaseInput,
): Promise<ApiResult<Purchase>> {
  const parsedId = purchaseIdSchema.safeParse(id);
  if (!parsedId.success) {
    return { ok: false, error: "Invalid purchase id", status: 400 };
  }

  const parsedInput = updatePurchaseInputSchema.safeParse(input);
  if (!parsedInput.success) {
    const issue = parsedInput.error.issues[0];
    return {
      ok: false,
      error: issue?.message ?? "Invalid purchase update",
      status: 400,
    };
  }

  return requestJson(
    `/api/purchases/${parsedId.data}`,
    {
      method: "PATCH",
      body: JSON.stringify(parsedInput.data),
    },
    (json) => {
      const parsed = purchaseSchema.safeParse(json);
      if (!parsed.success) {
        return {
          success: false,
          error: "Update purchase response did not match the expected schema",
        };
      }
      return { success: true, data: parsed.data };
    },
    "Failed to update purchase",
  );
}

export async function deletePurchase(
  id: string,
  input: DeletePurchaseInput,
): Promise<ApiResult<void>> {
  const parsedId = purchaseIdSchema.safeParse(id);
  if (!parsedId.success) {
    return { ok: false, error: "Invalid purchase id", status: 400 };
  }

  const parsedInput = deletePurchaseInputSchema.safeParse(input);
  if (!parsedInput.success) {
    const issue = parsedInput.error.issues[0];
    return {
      ok: false,
      error: issue?.message ?? "Invalid purchase delete",
      status: 400,
    };
  }

  return requestJson(
    `/api/purchases/${parsedId.data}`,
    {
      method: "DELETE",
      body: JSON.stringify(parsedInput.data),
    },
    () => ({ success: true, data: undefined }),
    "Failed to delete purchase",
  );
}
