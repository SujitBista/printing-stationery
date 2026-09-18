import type { z } from "zod";
import type {
  stockBalanceListQuerySchema,
  stockBalanceSchema,
  stockBalanceSummarySchema,
  stockBalanceResponseSchema,
  stockBalanceUnitSummarySchema,
  stockBalanceStoreOptionSchema,
  stockLedgerListQuerySchema,
  stockLedgerEntrySchema,
  stockLedgerResponseSchema,
  stockLedgerCategorySchema,
  stockLedgerCategoryFilterSchema,
  stockLedgerMovementTypeSchema,
} from "../schemas/stock-balance.js";

export type StockBalanceListQuery = z.infer<typeof stockBalanceListQuerySchema>;
export type StockBalance = z.infer<typeof stockBalanceSchema>;
export type StockBalanceSummary = z.infer<typeof stockBalanceSummarySchema>;
export type StockBalanceResponse = z.infer<typeof stockBalanceResponseSchema>;
export type StockBalanceUnitSummary = z.infer<
  typeof stockBalanceUnitSummarySchema
>;
export type StockBalanceStoreOption = z.infer<
  typeof stockBalanceStoreOptionSchema
>;
export type StockLedgerListQuery = z.infer<typeof stockLedgerListQuerySchema>;
export type StockLedgerEntry = z.infer<typeof stockLedgerEntrySchema>;
export type StockLedgerResponse = z.infer<typeof stockLedgerResponseSchema>;
export type StockLedgerCategory = z.infer<typeof stockLedgerCategorySchema>;
export type StockLedgerCategoryFilter = z.infer<
  typeof stockLedgerCategoryFilterSchema
>;
export type StockLedgerMovementType = z.infer<
  typeof stockLedgerMovementTypeSchema
>;
