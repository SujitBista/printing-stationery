import {
  stockBalanceListQuerySchema,
  stockBalanceResponseSchema,
  type StockBalanceListQuery,
  type StockBalanceResponse,
} from "@printing-stationery/shared";
import { requestJson, type ApiResult } from "./client";

export async function fetchStockBalances(
  rawQuery: Partial<StockBalanceListQuery> = {},
): Promise<ApiResult<StockBalanceResponse>> {
  const parsedQuery = stockBalanceListQuerySchema.safeParse(rawQuery);
  if (!parsedQuery.success) {
    return { ok: false, error: "Invalid stock balance query", status: 400 };
  }
  const params = new URLSearchParams();
  if (parsedQuery.data.storeId) {
    params.set("storeId", parsedQuery.data.storeId);
  }
  if (parsedQuery.data.itemId) {
    params.set("itemId", parsedQuery.data.itemId);
  }
  return requestJson(
    `/api/stock-balances?${params.toString()}`,
    { method: "GET" },
    (json) => {
      const parsed = stockBalanceResponseSchema.safeParse(json);
      return parsed.success
        ? { success: true, data: parsed.data }
        : { success: false, error: "Stock balance response did not match the expected schema" };
    },
    "Failed to load stock balances",
  );
}
