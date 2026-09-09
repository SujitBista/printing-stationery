import type { z } from "zod";
import type {
  createPurchaseInputSchema,
  deletePurchaseInputSchema,
  paginatedPurchaseResponseSchema,
  purchaseIdSchema,
  purchaseLineInputSchema,
  purchaseLineSchema,
  purchaseListItemSchema,
  purchaseListQuerySchema,
  purchasePartySummarySchema,
  purchaseQuantitySchema,
  purchaseRateSchema,
  purchaseSchema,
  purchaseStoreSummarySchema,
  updatePurchaseInputSchema,
} from "../schemas/purchase.js";

export type PurchaseQuantity = z.infer<typeof purchaseQuantitySchema>;
export type PurchaseRate = z.infer<typeof purchaseRateSchema>;
export type PurchaseLineInput = z.infer<typeof purchaseLineInputSchema>;
export type CreatePurchaseInput = z.infer<typeof createPurchaseInputSchema>;
export type UpdatePurchaseInput = z.infer<typeof updatePurchaseInputSchema>;
export type DeletePurchaseInput = z.infer<typeof deletePurchaseInputSchema>;
export type PurchaseId = z.infer<typeof purchaseIdSchema>;
export type PurchaseListQuery = z.infer<typeof purchaseListQuerySchema>;
export type PurchaseStoreSummary = z.infer<typeof purchaseStoreSummarySchema>;
export type PurchasePartySummary = z.infer<typeof purchasePartySummarySchema>;
export type PurchaseLine = z.infer<typeof purchaseLineSchema>;
export type PurchaseListItem = z.infer<typeof purchaseListItemSchema>;
export type Purchase = z.infer<typeof purchaseSchema>;
export type PaginatedPurchaseResponse = z.infer<
  typeof paginatedPurchaseResponseSchema
>;
