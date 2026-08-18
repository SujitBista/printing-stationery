import type { z } from "zod";
import type {
  createItemIssueInputSchema,
  itemIssueEligibilitySchema,
  itemIssueIdSchema,
  itemIssueLineAvailabilitySchema,
  itemIssueLineInputSchema,
  itemIssueLineSchema,
  itemIssueListItemSchema,
  itemIssueListQuerySchema,
  itemIssueRequestSummarySchema,
  itemIssueSchema,
  itemIssueStatusSchema,
  paginatedItemIssueResponseSchema,
  submitItemIssueInputSchema,
  updateItemIssueInputSchema,
} from "../schemas/item-issue.js";

export type ItemIssueStatus = z.infer<typeof itemIssueStatusSchema>;
export type ItemIssueId = z.infer<typeof itemIssueIdSchema>;
export type ItemIssueListQuery = z.infer<typeof itemIssueListQuerySchema>;
export type ItemIssueRequestSummary = z.infer<
  typeof itemIssueRequestSummarySchema
>;
export type ItemIssueLineAvailability = z.infer<
  typeof itemIssueLineAvailabilitySchema
>;
export type ItemIssueEligibility = z.infer<typeof itemIssueEligibilitySchema>;
export type ItemIssueLineInput = z.infer<typeof itemIssueLineInputSchema>;
export type CreateItemIssueInput = z.infer<typeof createItemIssueInputSchema>;
export type UpdateItemIssueInput = z.infer<typeof updateItemIssueInputSchema>;
export type SubmitItemIssueInput = z.infer<typeof submitItemIssueInputSchema>;
export type ItemIssueLine = z.infer<typeof itemIssueLineSchema>;
export type ItemIssueListItem = z.infer<typeof itemIssueListItemSchema>;
export type ItemIssue = z.infer<typeof itemIssueSchema>;
export type PaginatedItemIssueResponse = z.infer<
  typeof paginatedItemIssueResponseSchema
>;
