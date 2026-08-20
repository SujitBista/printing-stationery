import type { z } from "zod";
import type {
  storeSchema,
  createStoreInputSchema,
  updateStoreInputSchema,
  updateStoreStatusInputSchema,
  storeListQuerySchema,
  paginatedStoreResponseSchema,
  storeStatusFilterSchema,
  storeHierarchyFilterSchema,
  storeBranchSummarySchema,
  storeUnderStoreSummarySchema,
  storeImportReadyRowSchema,
  storeImportExistingRowSchema,
  storeImportDuplicateCodeSchema,
  storeImportUnknownBranchRowSchema,
  storeImportUnknownUnderStoreRowSchema,
  storeImportInvalidRowSchema,
  storeImportPreviewResponseSchema,
  storeImportConfirmInputSchema,
  storeImportConfirmResponseSchema,
} from "../schemas/store.js";

export type Store = z.infer<typeof storeSchema>;
export type StoreStatusFilter = z.infer<typeof storeStatusFilterSchema>;
export type StoreHierarchyFilter = z.infer<typeof storeHierarchyFilterSchema>;
export type StoreBranchSummary = z.infer<typeof storeBranchSummarySchema>;
export type StoreUnderStoreSummary = z.infer<
  typeof storeUnderStoreSummarySchema
>;
export type CreateStoreInput = z.infer<typeof createStoreInputSchema>;
export type UpdateStoreInput = z.infer<typeof updateStoreInputSchema>;
export type UpdateStoreStatusInput = z.infer<
  typeof updateStoreStatusInputSchema
>;
export type StoreListQuery = z.infer<typeof storeListQuerySchema>;
export type PaginatedStoreResponse = z.infer<
  typeof paginatedStoreResponseSchema
>;
export type StoreImportReadyRow = z.infer<typeof storeImportReadyRowSchema>;
export type StoreImportExistingRow = z.infer<typeof storeImportExistingRowSchema>;
export type StoreImportDuplicateCode = z.infer<
  typeof storeImportDuplicateCodeSchema
>;
export type StoreImportUnknownBranchRow = z.infer<
  typeof storeImportUnknownBranchRowSchema
>;
export type StoreImportUnknownUnderStoreRow = z.infer<
  typeof storeImportUnknownUnderStoreRowSchema
>;
export type StoreImportInvalidRow = z.infer<typeof storeImportInvalidRowSchema>;
export type StoreImportPreviewResponse = z.infer<
  typeof storeImportPreviewResponseSchema
>;
export type StoreImportConfirmInput = z.infer<
  typeof storeImportConfirmInputSchema
>;
export type StoreImportConfirmResponse = z.infer<
  typeof storeImportConfirmResponseSchema
>;
