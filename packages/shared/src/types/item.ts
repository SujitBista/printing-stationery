import type { z } from "zod";
import type {
  itemSchema,
  createItemInputSchema,
  updateItemInputSchema,
  updateItemStatusInputSchema,
  itemListQuerySchema,
  paginatedItemResponseSchema,
  itemStatusFilterSchema,
  returnTypeSchema,
  itemUnitSummarySchema,
  itemGroupSummarySchema,
} from "../schemas/item.js";

export type Item = z.infer<typeof itemSchema>;
export type ReturnType = z.infer<typeof returnTypeSchema>;
export type ItemStatusFilter = z.infer<typeof itemStatusFilterSchema>;
export type ItemUnitSummary = z.infer<typeof itemUnitSummarySchema>;
export type ItemGroupSummary = z.infer<typeof itemGroupSummarySchema>;
export type CreateItemInput = z.infer<typeof createItemInputSchema>;
export type UpdateItemInput = z.infer<typeof updateItemInputSchema>;
export type UpdateItemStatusInput = z.infer<typeof updateItemStatusInputSchema>;
export type ItemListQuery = z.infer<typeof itemListQuerySchema>;
export type PaginatedItemResponse = z.infer<typeof paginatedItemResponseSchema>;
