import type { z } from "zod";
import type {
  departmentSchema,
  createDepartmentInputSchema,
  updateDepartmentInputSchema,
  updateDepartmentStatusInputSchema,
  departmentListQuerySchema,
  paginatedDepartmentResponseSchema,
  departmentStatusFilterSchema,
} from "../schemas/department.js";

export type Department = z.infer<typeof departmentSchema>;
export type DepartmentStatusFilter = z.infer<
  typeof departmentStatusFilterSchema
>;
export type CreateDepartmentInput = z.infer<typeof createDepartmentInputSchema>;
export type UpdateDepartmentInput = z.infer<typeof updateDepartmentInputSchema>;
export type UpdateDepartmentStatusInput = z.infer<
  typeof updateDepartmentStatusInputSchema
>;
export type DepartmentListQuery = z.infer<typeof departmentListQuerySchema>;
export type PaginatedDepartmentResponse = z.infer<
  typeof paginatedDepartmentResponseSchema
>;
