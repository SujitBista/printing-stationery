import type { z } from "zod";
import type {
  unitSchema,
  createUnitInputSchema,
  updateUnitInputSchema,
  updateUnitStatusInputSchema,
  unitListQuerySchema,
  paginatedUnitResponseSchema,
  unitStatusFilterSchema,
  unitImportReadyRowSchema,
  unitImportExistingRowSchema,
  unitImportDuplicateNameSchema,
  unitImportInvalidRowSchema,
  unitImportPreviewResponseSchema,
  unitImportConfirmInputSchema,
  unitImportConfirmResponseSchema,
} from "../schemas/unit.js";

export type Unit = z.infer<typeof unitSchema>;
export type UnitStatusFilter = z.infer<typeof unitStatusFilterSchema>;
export type CreateUnitInput = z.infer<typeof createUnitInputSchema>;
export type UpdateUnitInput = z.infer<typeof updateUnitInputSchema>;
export type UpdateUnitStatusInput = z.infer<
  typeof updateUnitStatusInputSchema
>;
export type UnitListQuery = z.infer<typeof unitListQuerySchema>;
export type PaginatedUnitResponse = z.infer<
  typeof paginatedUnitResponseSchema
>;
export type UnitImportReadyRow = z.infer<typeof unitImportReadyRowSchema>;
export type UnitImportExistingRow = z.infer<typeof unitImportExistingRowSchema>;
export type UnitImportDuplicateName = z.infer<
  typeof unitImportDuplicateNameSchema
>;
export type UnitImportInvalidRow = z.infer<typeof unitImportInvalidRowSchema>;
export type UnitImportPreviewResponse = z.infer<
  typeof unitImportPreviewResponseSchema
>;
export type UnitImportConfirmInput = z.infer<
  typeof unitImportConfirmInputSchema
>;
export type UnitImportConfirmResponse = z.infer<
  typeof unitImportConfirmResponseSchema
>;
