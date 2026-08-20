import type { z } from "zod";
import type {
  stockBalanceListQuerySchema,
  stockBalanceSchema,
  stockBalanceSummarySchema,
  stockBalanceResponseSchema,
} from "../schemas/stock-balance.js";

export type StockBalanceListQuery = z.infer<typeof stockBalanceListQuerySchema>;
export type StockBalance = z.infer<typeof stockBalanceSchema>;
export type StockBalanceSummary = z.infer<typeof stockBalanceSummarySchema>;
export type StockBalanceResponse = z.infer<typeof stockBalanceResponseSchema>;
