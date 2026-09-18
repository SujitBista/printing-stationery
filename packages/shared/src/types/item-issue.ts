import type { z } from "zod";
import type {
  confirmItemIssueReceiptInputSchema,
  createDepartmentIssueInputSchema,
  createItemIssueInputSchema,
  departmentConsumptionListItemSchema,
  departmentConsumptionListQuerySchema,
  departmentIssueLineInputSchema,
  incomingShipmentListItemSchema,
  incomingShipmentListQuerySchema,
  incomingShipmentQueueSchema,
  inTransitQuantitySchema,
  inTransitQuantitiesResponseSchema,
  itemIssueActionSchema,
  itemIssueActionTypeSchema,
  itemIssueActiveSummarySchema,
  itemIssueDeliveryStatusSchema,
  itemIssueDestinationTypeSchema,
  itemIssueDiscrepancyReasonSchema,
  itemIssueDiscrepancyResolutionSchema,
  itemIssueEligibilitySchema,
  itemIssueIdSchema,
  itemIssueLineAvailabilitySchema,
  itemIssueLineInputSchema,
  itemIssueLineSchema,
  itemIssueListItemSchema,
  itemIssueListQuerySchema,
  itemIssueQueueSchema,
  itemIssueReceiptIdSchema,
  itemIssueReceiptLineInputSchema,
  itemIssueReceiptSchema,
  itemIssueReceiptStatusSchema,
  itemIssueRequestSummarySchema,
  itemIssueSchema,
  itemIssueShipmentIdSchema,
  itemIssueShipmentSchema,
  itemIssueStatusSchema,
  paginatedDepartmentConsumptionResponseSchema,
  paginatedIncomingShipmentResponseSchema,
  paginatedItemIssueResponseSchema,
  rejectItemIssueInputSchema,
  returnItemIssueInputSchema,
  returnItemIssueReceiptInputSchema,
  submitItemIssueInputSchema,
  submitItemIssueReceiptInputSchema,
  updateDepartmentIssueInputSchema,
  updateItemIssueInputSchema,
  verifyItemIssueInputSchema,
} from "../schemas/item-issue.js";

export type ItemIssueStatus = z.infer<typeof itemIssueStatusSchema>;
export type ItemIssueDestinationType = z.infer<
  typeof itemIssueDestinationTypeSchema
>;
export type ItemIssueDeliveryStatus = z.infer<
  typeof itemIssueDeliveryStatusSchema
>;
export type ItemIssueReceiptStatus = z.infer<
  typeof itemIssueReceiptStatusSchema
>;
export type ItemIssueDiscrepancyReason = z.infer<
  typeof itemIssueDiscrepancyReasonSchema
>;
export type ItemIssueDiscrepancyResolution = z.infer<
  typeof itemIssueDiscrepancyResolutionSchema
>;
export type IncomingShipmentQueue = z.infer<typeof incomingShipmentQueueSchema>;
export type ItemIssueQueue = z.infer<typeof itemIssueQueueSchema>;
export type ItemIssueActionType = z.infer<typeof itemIssueActionTypeSchema>;
export type ItemIssueId = z.infer<typeof itemIssueIdSchema>;
export type ItemIssueShipmentId = z.infer<typeof itemIssueShipmentIdSchema>;
export type ItemIssueReceiptId = z.infer<typeof itemIssueReceiptIdSchema>;
export type ItemIssueListQuery = z.infer<typeof itemIssueListQuerySchema>;
export type ItemIssueRequestSummary = z.infer<
  typeof itemIssueRequestSummarySchema
>;
export type ItemIssueLineAvailability = z.infer<
  typeof itemIssueLineAvailabilitySchema
>;
export type ItemIssueActiveSummary = z.infer<typeof itemIssueActiveSummarySchema>;
export type ItemIssueEligibility = z.infer<typeof itemIssueEligibilitySchema>;
export type ItemIssueLineInput = z.infer<typeof itemIssueLineInputSchema>;
export type CreateItemIssueInput = z.infer<typeof createItemIssueInputSchema>;
export type UpdateItemIssueInput = z.infer<typeof updateItemIssueInputSchema>;
export type SubmitItemIssueInput = z.infer<typeof submitItemIssueInputSchema>;
export type VerifyItemIssueInput = z.infer<typeof verifyItemIssueInputSchema>;
export type ReturnItemIssueInput = z.infer<typeof returnItemIssueInputSchema>;
export type RejectItemIssueInput = z.infer<typeof rejectItemIssueInputSchema>;
export type DepartmentIssueLineInput = z.infer<
  typeof departmentIssueLineInputSchema
>;
export type CreateDepartmentIssueInput = z.infer<
  typeof createDepartmentIssueInputSchema
>;
export type UpdateDepartmentIssueInput = z.infer<
  typeof updateDepartmentIssueInputSchema
>;
export type ItemIssueReceiptLineInput = z.infer<
  typeof itemIssueReceiptLineInputSchema
>;
export type SubmitItemIssueReceiptInput = z.infer<
  typeof submitItemIssueReceiptInputSchema
>;
export type ConfirmItemIssueReceiptInput = z.infer<
  typeof confirmItemIssueReceiptInputSchema
>;
export type ReturnItemIssueReceiptInput = z.infer<
  typeof returnItemIssueReceiptInputSchema
>;
export type ItemIssueLine = z.infer<typeof itemIssueLineSchema>;
export type ItemIssueAction = z.infer<typeof itemIssueActionSchema>;
export type ItemIssueReceipt = z.infer<typeof itemIssueReceiptSchema>;
export type ItemIssueShipment = z.infer<typeof itemIssueShipmentSchema>;
export type ItemIssueListItem = z.infer<typeof itemIssueListItemSchema>;
export type ItemIssue = z.infer<typeof itemIssueSchema>;
export type PaginatedItemIssueResponse = z.infer<
  typeof paginatedItemIssueResponseSchema
>;
export type IncomingShipmentListQuery = z.infer<
  typeof incomingShipmentListQuerySchema
>;
export type IncomingShipmentListItem = z.infer<
  typeof incomingShipmentListItemSchema
>;
export type PaginatedIncomingShipmentResponse = z.infer<
  typeof paginatedIncomingShipmentResponseSchema
>;
export type DepartmentConsumptionListQuery = z.infer<
  typeof departmentConsumptionListQuerySchema
>;
export type DepartmentConsumptionListItem = z.infer<
  typeof departmentConsumptionListItemSchema
>;
export type PaginatedDepartmentConsumptionResponse = z.infer<
  typeof paginatedDepartmentConsumptionResponseSchema
>;
export type InTransitQuantity = z.infer<typeof inTransitQuantitySchema>;
export type InTransitQuantitiesResponse = z.infer<
  typeof inTransitQuantitiesResponseSchema
>;
