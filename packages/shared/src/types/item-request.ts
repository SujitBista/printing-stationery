import type { z } from "zod";
import type {
  itemRequestStatusSchema,
  itemRequestStatusFilterSchema,
  itemRequestActionTypeSchema,
  itemRequestTerminalStatusSchema,
  createItemRequestInputSchema,
  updateItemRequestInputSchema,
  itemRequestActionInputSchema,
  itemRequestListQuerySchema,
  eligibleItemRequestItemListQuerySchema,
  itemRequestSchema,
  itemRequestListItemSchema,
  itemRequestLineSchema,
  itemRequestActionSchema,
  paginatedItemRequestResponseSchema,
  eligibleItemRequestItemSchema,
  paginatedEligibleItemRequestItemResponseSchema,
  itemRequestContextSchema,
  itemRequestStoreSummarySchema,
  itemRequestPersonSummarySchema,
  itemRequestBranchSummarySchema,
  requestedQuantitySchema,
  itemRequestLineInputSchema,
} from "../schemas/item-request.js";

export type ItemRequestStatus = z.infer<typeof itemRequestStatusSchema>;
export type ItemRequestStatusFilter = z.infer<
  typeof itemRequestStatusFilterSchema
>;
export type ItemRequestActionType = z.infer<typeof itemRequestActionTypeSchema>;
export type ItemRequestTerminalStatus = z.infer<
  typeof itemRequestTerminalStatusSchema
>;
export type CreateItemRequestInput = z.infer<
  typeof createItemRequestInputSchema
>;
export type UpdateItemRequestInput = z.infer<
  typeof updateItemRequestInputSchema
>;
export type ItemRequestActionInput = z.infer<
  typeof itemRequestActionInputSchema
>;
export type ItemRequestListQuery = z.infer<typeof itemRequestListQuerySchema>;
export type EligibleItemRequestItemListQuery = z.infer<
  typeof eligibleItemRequestItemListQuerySchema
>;
export type ItemRequest = z.infer<typeof itemRequestSchema>;
export type ItemRequestListItem = z.infer<typeof itemRequestListItemSchema>;
export type ItemRequestLine = z.infer<typeof itemRequestLineSchema>;
export type ItemRequestAction = z.infer<typeof itemRequestActionSchema>;
export type PaginatedItemRequestResponse = z.infer<
  typeof paginatedItemRequestResponseSchema
>;
export type EligibleItemRequestItem = z.infer<
  typeof eligibleItemRequestItemSchema
>;
export type PaginatedEligibleItemRequestItemResponse = z.infer<
  typeof paginatedEligibleItemRequestItemResponseSchema
>;
export type ItemRequestContext = z.infer<typeof itemRequestContextSchema>;
export type ItemRequestStoreSummary = z.infer<
  typeof itemRequestStoreSummarySchema
>;
export type ItemRequestPersonSummary = z.infer<
  typeof itemRequestPersonSummarySchema
>;
export type ItemRequestBranchSummary = z.infer<
  typeof itemRequestBranchSummarySchema
>;
export type RequestedQuantity = z.infer<typeof requestedQuantitySchema>;
export type ItemRequestLineInput = z.infer<typeof itemRequestLineInputSchema>;
