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
