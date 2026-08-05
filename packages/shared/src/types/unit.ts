import type { z } from "zod";
import type {
  unitSchema,
  createUnitInputSchema,
  updateUnitInputSchema,
  updateUnitStatusInputSchema,
  unitListQuerySchema,
  paginatedUnitResponseSchema,
  unitStatusFilterSchema,
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
