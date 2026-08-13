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
  employeeImportReadyRowSchema,
  employeeImportExistingRowSchema,
  employeeImportDuplicateCodeSchema,
  employeeImportUnknownBranchRowSchema,
  employeeImportInvalidRowSchema,
  employeeImportPreviewResponseSchema,
  employeeImportConfirmInputSchema,
  employeeImportConfirmResponseSchema,
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
export type EmployeeImportReadyRow = z.infer<typeof employeeImportReadyRowSchema>;
export type EmployeeImportExistingRow = z.infer<
  typeof employeeImportExistingRowSchema
>;
export type EmployeeImportDuplicateCode = z.infer<
  typeof employeeImportDuplicateCodeSchema
>;
export type EmployeeImportUnknownBranchRow = z.infer<
  typeof employeeImportUnknownBranchRowSchema
>;
export type EmployeeImportInvalidRow = z.infer<
  typeof employeeImportInvalidRowSchema
>;
export type EmployeeImportPreviewResponse = z.infer<
  typeof employeeImportPreviewResponseSchema
>;
export type EmployeeImportConfirmInput = z.infer<
  typeof employeeImportConfirmInputSchema
>;
export type EmployeeImportConfirmResponse = z.infer<
  typeof employeeImportConfirmResponseSchema
>;
