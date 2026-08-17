import type { z } from "zod";
import type {
  storeUserSchema,
  storeUserBranchSummarySchema,
  storeUserStoreSummarySchema,
  storeUserEmployeeSummarySchema,
  storeUserPersonSummarySchema,
  createStoreUserInputSchema,
  updateStoreUserInputSchema,
  updateStoreUserStatusInputSchema,
  storeUserListQuerySchema,
  paginatedStoreUserResponseSchema,
  storeUserStatusFilterSchema,
  storeUserAssignableRoleSchema,
  eligibleStoreApplicationUserSchema,
  eligibleStoreApplicationUserListQuerySchema,
  paginatedEligibleStoreApplicationUserResponseSchema,
  eligibleStoreUserStoreListQuerySchema,
  paginatedEligibleStoreUserStoreResponseSchema,
} from "../schemas/store-user.js";

export type StoreUser = z.infer<typeof storeUserSchema>;
export type StoreUserBranchSummary = z.infer<
  typeof storeUserBranchSummarySchema
>;
export type StoreUserStoreSummary = z.infer<typeof storeUserStoreSummarySchema>;
export type StoreUserEmployeeSummary = z.infer<
  typeof storeUserEmployeeSummarySchema
>;
export type StoreUserPersonSummary = z.infer<
  typeof storeUserPersonSummarySchema
>;
export type StoreUserStatusFilter = z.infer<typeof storeUserStatusFilterSchema>;
export type StoreUserAssignableRole = z.infer<
  typeof storeUserAssignableRoleSchema
>;
export type CreateStoreUserInput = z.infer<typeof createStoreUserInputSchema>;
export type UpdateStoreUserInput = z.infer<typeof updateStoreUserInputSchema>;
export type UpdateStoreUserStatusInput = z.infer<
  typeof updateStoreUserStatusInputSchema
>;
export type StoreUserListQuery = z.infer<typeof storeUserListQuerySchema>;
export type PaginatedStoreUserResponse = z.infer<
  typeof paginatedStoreUserResponseSchema
>;
export type EligibleStoreApplicationUser = z.infer<
  typeof eligibleStoreApplicationUserSchema
>;
export type EligibleStoreApplicationUserListQuery = z.infer<
  typeof eligibleStoreApplicationUserListQuerySchema
>;
export type PaginatedEligibleStoreApplicationUserResponse = z.infer<
  typeof paginatedEligibleStoreApplicationUserResponseSchema
>;
export type EligibleStoreUserStoreListQuery = z.infer<
  typeof eligibleStoreUserStoreListQuerySchema
>;
export type PaginatedEligibleStoreUserStoreResponse = z.infer<
  typeof paginatedEligibleStoreUserStoreResponseSchema
>;
