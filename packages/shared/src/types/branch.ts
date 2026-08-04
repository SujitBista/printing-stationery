import type { z } from "zod";
import type {
  branchSchema,
  createBranchInputSchema,
  updateBranchInputSchema,
  updateBranchStatusInputSchema,
  branchListQuerySchema,
  paginatedBranchResponseSchema,
  branchTypeSchema,
  branchStatusFilterSchema,
} from "../schemas/branch.js";

export type Branch = z.infer<typeof branchSchema>;
export type BranchType = z.infer<typeof branchTypeSchema>;
export type BranchStatusFilter = z.infer<typeof branchStatusFilterSchema>;
export type CreateBranchInput = z.infer<typeof createBranchInputSchema>;
export type UpdateBranchInput = z.infer<typeof updateBranchInputSchema>;
export type UpdateBranchStatusInput = z.infer<
  typeof updateBranchStatusInputSchema
>;
export type BranchListQuery = z.infer<typeof branchListQuerySchema>;
export type PaginatedBranchResponse = z.infer<
  typeof paginatedBranchResponseSchema
>;
