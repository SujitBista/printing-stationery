import type { z } from "zod";
import type {
  itemGroupSchema,
  createItemGroupInputSchema,
  updateItemGroupInputSchema,
  updateItemGroupStatusInputSchema,
  itemGroupListQuerySchema,
  paginatedItemGroupResponseSchema,
  itemGroupStatusFilterSchema,
  groupTypeSchema,
} from "../schemas/item-group.js";

export type ItemGroup = z.infer<typeof itemGroupSchema>;
export type GroupType = z.infer<typeof groupTypeSchema>;
export type ItemGroupStatusFilter = z.infer<typeof itemGroupStatusFilterSchema>;
export type CreateItemGroupInput = z.infer<typeof createItemGroupInputSchema>;
export type UpdateItemGroupInput = z.infer<typeof updateItemGroupInputSchema>;
export type UpdateItemGroupStatusInput = z.infer<
  typeof updateItemGroupStatusInputSchema
>;
export type ItemGroupListQuery = z.infer<typeof itemGroupListQuerySchema>;
export type PaginatedItemGroupResponse = z.infer<
  typeof paginatedItemGroupResponseSchema
>;
