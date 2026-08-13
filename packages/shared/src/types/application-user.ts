import type { z } from "zod";
import type {
  applicationUserSchema,
  applicationUserEmployeeSchema,
  createApplicationUserInputSchema,
  updateApplicationUserInputSchema,
  updateApplicationUserStatusInputSchema,
  resetApplicationUserPasswordInputSchema,
  applicationUserListQuerySchema,
  paginatedApplicationUserResponseSchema,
  applicationUserStatusFilterSchema,
  eligibleEmployeeListQuerySchema,
  paginatedEligibleEmployeeResponseSchema,
} from "../schemas/application-user.js";

export type ApplicationUser = z.infer<typeof applicationUserSchema>;
export type ApplicationUserEmployee = z.infer<
  typeof applicationUserEmployeeSchema
>;
export type ApplicationUserStatusFilter = z.infer<
  typeof applicationUserStatusFilterSchema
>;
export type CreateApplicationUserInput = z.infer<
  typeof createApplicationUserInputSchema
>;
export type UpdateApplicationUserInput = z.infer<
  typeof updateApplicationUserInputSchema
>;
export type UpdateApplicationUserStatusInput = z.infer<
  typeof updateApplicationUserStatusInputSchema
>;
export type ResetApplicationUserPasswordInput = z.infer<
  typeof resetApplicationUserPasswordInputSchema
>;
export type ApplicationUserListQuery = z.infer<
  typeof applicationUserListQuerySchema
>;
export type PaginatedApplicationUserResponse = z.infer<
  typeof paginatedApplicationUserResponseSchema
>;
export type EligibleEmployeeListQuery = z.infer<
  typeof eligibleEmployeeListQuerySchema
>;
export type PaginatedEligibleEmployeeResponse = z.infer<
  typeof paginatedEligibleEmployeeResponseSchema
>;
