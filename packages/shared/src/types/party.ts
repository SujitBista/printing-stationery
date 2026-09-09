import type { z } from "zod";
import type {
  partySchema,
  createPartyInputSchema,
  updatePartyInputSchema,
  updatePartyStatusInputSchema,
  partyListQuerySchema,
  paginatedPartyResponseSchema,
  partyStatusFilterSchema,
} from "../schemas/party.js";

export type Party = z.infer<typeof partySchema>;
export type PartyStatusFilter = z.infer<typeof partyStatusFilterSchema>;
export type CreatePartyInput = z.infer<typeof createPartyInputSchema>;
export type UpdatePartyInput = z.infer<typeof updatePartyInputSchema>;
export type UpdatePartyStatusInput = z.infer<
  typeof updatePartyStatusInputSchema
>;
export type PartyListQuery = z.infer<typeof partyListQuerySchema>;
export type PaginatedPartyResponse = z.infer<
  typeof paginatedPartyResponseSchema
>;
