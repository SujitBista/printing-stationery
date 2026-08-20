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
  itemImportReadyRowSchema,
  itemImportExistingRowSchema,
  itemImportDuplicateCodeSchema,
  itemImportUnknownUnitRowSchema,
  itemImportUnknownGroupRowSchema,
  itemImportInvalidRowSchema,
  itemImportPreviewResponseSchema,
  itemImportConfirmInputSchema,
  itemImportConfirmResponseSchema,
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
export type ItemImportReadyRow = z.infer<typeof itemImportReadyRowSchema>;
export type ItemImportExistingRow = z.infer<typeof itemImportExistingRowSchema>;
export type ItemImportDuplicateCode = z.infer<
  typeof itemImportDuplicateCodeSchema
>;
export type ItemImportUnknownUnitRow = z.infer<
  typeof itemImportUnknownUnitRowSchema
>;
export type ItemImportUnknownGroupRow = z.infer<
  typeof itemImportUnknownGroupRowSchema
>;
export type ItemImportInvalidRow = z.infer<typeof itemImportInvalidRowSchema>;
export type ItemImportPreviewResponse = z.infer<
  typeof itemImportPreviewResponseSchema
>;
export type ItemImportConfirmInput = z.infer<
  typeof itemImportConfirmInputSchema
>;
export type ItemImportConfirmResponse = z.infer<
  typeof itemImportConfirmResponseSchema
>;
