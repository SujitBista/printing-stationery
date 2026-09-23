import {
  stockBalanceListQuerySchema,
  stockBalanceResponseSchema,
  stockLedgerListQuerySchema,
  stockLedgerResponseSchema,
  type StockBalanceListQuery,
  type StockBalanceResponse,
  type StockLedgerListQuery,
  type StockLedgerResponse,
} from "@printing-stationery/shared";
import { requestJson, type ApiResult } from "./client";

function setOptionalParam(
  params: URLSearchParams,
  key: string,
  value: string | number | boolean | undefined,
): void {
  if (value === undefined || value === "") {
    return;
  }
  params.set(key, String(value));
}

export async function fetchStockBalances(
  rawQuery: Partial<StockBalanceListQuery> = {},
): Promise<ApiResult<StockBalanceResponse>> {
  const parsedQuery = stockBalanceListQuerySchema.safeParse(rawQuery);
  if (!parsedQuery.success) {
    return { ok: false, error: "Invalid stock balance query", status: 400 };
  }
  const params = new URLSearchParams();
  setOptionalParam(params, "storeId", parsedQuery.data.storeId);
  setOptionalParam(params, "branchId", parsedQuery.data.branchId);
  setOptionalParam(params, "itemId", parsedQuery.data.itemId);
  setOptionalParam(params, "itemGroupId", parsedQuery.data.itemGroupId);
  setOptionalParam(params, "search", parsedQuery.data.search);
  setOptionalParam(params, "includeZeroBalance", parsedQuery.data.includeZeroBalance);
  params.set("page", String(parsedQuery.data.page));
  params.set("pageSize", String(parsedQuery.data.pageSize));
  params.set("sortBy", parsedQuery.data.sortBy);
  params.set("sortOrder", parsedQuery.data.sortOrder);
  return requestJson(
    `/api/stock-balances?${params.toString()}`,
    { method: "GET" },
    (json) => {
      const parsed = stockBalanceResponseSchema.safeParse(json);
      return parsed.success
        ? { success: true, data: parsed.data }
        : {
            success: false,
            error: "Stock balance response did not match the expected schema",
          };
    },
    "Failed to load stock balances",
  );
}

export async function fetchStockLedger(
  rawQuery: StockLedgerListQuery,
): Promise<ApiResult<StockLedgerResponse>> {
  const parsedQuery = stockLedgerListQuerySchema.safeParse(rawQuery);
  if (!parsedQuery.success) {
    return { ok: false, error: "Invalid stock ledger query", status: 400 };
  }
  const params = new URLSearchParams();
  params.set("storeId", parsedQuery.data.storeId);
  params.set("itemId", parsedQuery.data.itemId);
  params.set("unitId", parsedQuery.data.unitId);
  params.set("stockCategory", parsedQuery.data.stockCategory);
  params.set("page", String(parsedQuery.data.page));
  params.set("pageSize", String(parsedQuery.data.pageSize));
  return requestJson(
    `/api/stock-balances/ledger?${params.toString()}`,
    { method: "GET" },
    (json) => {
      const parsed = stockLedgerResponseSchema.safeParse(json);
      return parsed.success
        ? { success: true, data: parsed.data }
        : {
            success: false,
            error: "Stock ledger response did not match the expected schema",
          };
    },
    "Failed to load stock ledger",
  );
}
