import type { z } from "zod";
import type {
  openingStockSourceTypeSchema,
  openingStockBatchStatusSchema,
  openingStockMappingStatusSchema,
  quantityStringSchema,
  nonNegativeQuantityStringSchema,
  moneyStringSchema,
  nonNegativeMoneyStringSchema,
  rateStringSchema,
  openingStockIdSchema,
  openingStockListQuerySchema,
  openingStockStoreSummarySchema,
  openingStockUnitSummarySchema,
  openingStockItemSummarySchema,
  openingStockBatchSummarySchema,
  paginatedOpeningStockResponseSchema,
  openingStockLegacyRowSchema,
  openingStockBatchLineSchema,
  openingStockPreviewSummarySchema,
  openingStockPreviewSchema,
  manualOpeningStockLineInputSchema,
  createManualOpeningStockInputSchema,
  openingStockMappingChoiceSchema,
  updateOpeningStockMappingsInputSchema,
  validateOpeningStockInputSchema,
  postOpeningStockInputSchema,
  cancelOpeningStockInputSchema,
  openingStockValidationResultSchema,
  openingStockPostResultSchema,
} from "../schemas/opening-stock.js";

export type OpeningStockSourceType = z.infer<typeof openingStockSourceTypeSchema>;
export type OpeningStockBatchStatus = z.infer<typeof openingStockBatchStatusSchema>;
export type OpeningStockMappingStatus = z.infer<
  typeof openingStockMappingStatusSchema
>;
export type QuantityString = z.infer<typeof quantityStringSchema>;
export type NonNegativeQuantityString = z.infer<
  typeof nonNegativeQuantityStringSchema
>;
export type MoneyString = z.infer<typeof moneyStringSchema>;
export type NonNegativeMoneyString = z.infer<
  typeof nonNegativeMoneyStringSchema
>;
export type RateString = z.infer<typeof rateStringSchema>;
export type OpeningStockId = z.infer<typeof openingStockIdSchema>;
export type OpeningStockListQuery = z.infer<typeof openingStockListQuerySchema>;
export type OpeningStockStoreSummary = z.infer<
  typeof openingStockStoreSummarySchema
>;
export type OpeningStockUnitSummary = z.infer<typeof openingStockUnitSummarySchema>;
export type OpeningStockItemSummary = z.infer<typeof openingStockItemSummarySchema>;
export type OpeningStockBatchSummary = z.infer<
  typeof openingStockBatchSummarySchema
>;
export type PaginatedOpeningStockResponse = z.infer<
  typeof paginatedOpeningStockResponseSchema
>;
export type OpeningStockLegacyRow = z.infer<typeof openingStockLegacyRowSchema>;
export type OpeningStockBatchLine = z.infer<typeof openingStockBatchLineSchema>;
export type OpeningStockPreviewSummary = z.infer<
  typeof openingStockPreviewSummarySchema
>;
export type OpeningStockPreview = z.infer<typeof openingStockPreviewSchema>;
export type ManualOpeningStockLineInput = z.infer<
  typeof manualOpeningStockLineInputSchema
>;
export type CreateManualOpeningStockInput = z.infer<
  typeof createManualOpeningStockInputSchema
>;
export type OpeningStockMappingChoice = z.infer<
  typeof openingStockMappingChoiceSchema
>;
export type UpdateOpeningStockMappingsInput = z.infer<
  typeof updateOpeningStockMappingsInputSchema
>;
export type ValidateOpeningStockInput = z.infer<
  typeof validateOpeningStockInputSchema
>;
export type PostOpeningStockInput = z.infer<typeof postOpeningStockInputSchema>;
export type CancelOpeningStockInput = z.infer<
  typeof cancelOpeningStockInputSchema
>;
export type OpeningStockValidationResult = z.infer<
  typeof openingStockValidationResultSchema
>;
export type OpeningStockPostResult = z.infer<
  typeof openingStockPostResultSchema
>;
