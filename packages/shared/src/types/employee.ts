import type { z } from "zod";
import type {
  employeeSchema,
  createEmployeeInputSchema,
  updateEmployeeInputSchema,
  updateEmployeeStatusInputSchema,
  employeeListQuerySchema,
  paginatedEmployeeResponseSchema,
  employeeStatusFilterSchema,
  employeeBranchSummarySchema,
} from "../schemas/employee.js";

export type Employee = z.infer<typeof employeeSchema>;
export type EmployeeStatusFilter = z.infer<typeof employeeStatusFilterSchema>;
export type EmployeeBranchSummary = z.infer<typeof employeeBranchSummarySchema>;
export type CreateEmployeeInput = z.infer<typeof createEmployeeInputSchema>;
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeInputSchema>;
export type UpdateEmployeeStatusInput = z.infer<
  typeof updateEmployeeStatusInputSchema
>;
export type EmployeeListQuery = z.infer<typeof employeeListQuerySchema>;
export type PaginatedEmployeeResponse = z.infer<
  typeof paginatedEmployeeResponseSchema
>;
