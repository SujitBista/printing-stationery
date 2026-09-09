import {
  createPartyInputSchema,
  paginatedPartyResponseSchema,
  partyIdSchema,
  partyListQuerySchema,
  partySchema,
  updatePartyInputSchema,
  updatePartyStatusInputSchema,
  type CreatePartyInput,
  type PaginatedPartyResponse,
  type Party,
  type PartyListQuery,
  type UpdatePartyInput,
  type UpdatePartyStatusInput,
} from "@printing-stationery/shared";
import { requestJson, type ApiResult } from "./client";

function buildQueryString(query: PartyListQuery): string {
  const params = new URLSearchParams();
  params.set("page", String(query.page));
  params.set("pageSize", String(query.pageSize));
  params.set("status", query.status);
  if (query.search) {
    params.set("search", query.search);
  }
  return params.toString();
}

export async function fetchParties(
  rawQuery: Partial<PartyListQuery> = {},
): Promise<ApiResult<PaginatedPartyResponse>> {
  const parsedQuery = partyListQuerySchema.safeParse(rawQuery);
  if (!parsedQuery.success) {
    return { ok: false, error: "Invalid party list query", status: 400 };
  }

  const queryString = buildQueryString(parsedQuery.data);

  return requestJson(
    `/api/parties?${queryString}`,
    { method: "GET" },
    (json) => {
      const parsed = paginatedPartyResponseSchema.safeParse(json);
      if (!parsed.success) {
        return {
          success: false,
          error: "Party list response did not match the expected schema",
        };
      }
      return { success: true, data: parsed.data };
    },
    "Failed to load parties",
  );
}

export async function fetchParty(id: string): Promise<ApiResult<Party>> {
  const parsedId = partyIdSchema.safeParse(id);
  if (!parsedId.success) {
    return { ok: false, error: "Invalid party id", status: 400 };
  }

  return requestJson(
    `/api/parties/${parsedId.data}`,
    { method: "GET" },
    (json) => {
      const parsed = partySchema.safeParse(json);
      if (!parsed.success) {
        return {
          success: false,
          error: "Party response did not match the expected schema",
        };
      }
      return { success: true, data: parsed.data };
    },
    "Failed to load party",
  );
}

export async function createParty(
  input: CreatePartyInput,
): Promise<ApiResult<Party>> {
  const parsedInput = createPartyInputSchema.safeParse(input);
  if (!parsedInput.success) {
    const issue = parsedInput.error.issues[0];
    return {
      ok: false,
      error: issue?.message ?? "Invalid party input",
      status: 400,
    };
  }

  return requestJson(
    "/api/parties",
    {
      method: "POST",
      body: JSON.stringify(parsedInput.data),
    },
    (json) => {
      const parsed = partySchema.safeParse(json);
      if (!parsed.success) {
        return {
          success: false,
          error: "Create party response did not match the expected schema",
        };
      }
      return { success: true, data: parsed.data };
    },
    "Failed to create party",
  );
}

export async function updateParty(
  id: string,
  input: UpdatePartyInput,
): Promise<ApiResult<Party>> {
  const parsedId = partyIdSchema.safeParse(id);
  if (!parsedId.success) {
    return { ok: false, error: "Invalid party id", status: 400 };
  }

  const parsedInput = updatePartyInputSchema.safeParse(input);
  if (!parsedInput.success) {
    const issue = parsedInput.error.issues[0];
    return {
      ok: false,
      error: issue?.message ?? "Invalid party update",
      status: 400,
    };
  }

  return requestJson(
    `/api/parties/${parsedId.data}`,
    {
      method: "PATCH",
      body: JSON.stringify(parsedInput.data),
    },
    (json) => {
      const parsed = partySchema.safeParse(json);
      if (!parsed.success) {
        return {
          success: false,
          error: "Update party response did not match the expected schema",
        };
      }
      return { success: true, data: parsed.data };
    },
    "Failed to update party",
  );
}

export async function updatePartyStatus(
  id: string,
  input: UpdatePartyStatusInput,
): Promise<ApiResult<Party>> {
  const parsedId = partyIdSchema.safeParse(id);
  if (!parsedId.success) {
    return { ok: false, error: "Invalid party id", status: 400 };
  }

  const parsedInput = updatePartyStatusInputSchema.safeParse(input);
  if (!parsedInput.success) {
    const issue = parsedInput.error.issues[0];
    return {
      ok: false,
      error: issue?.message ?? "Invalid party status update",
      status: 400,
    };
  }

  return requestJson(
    `/api/parties/${parsedId.data}/status`,
    {
      method: "PATCH",
      body: JSON.stringify(parsedInput.data),
    },
    (json) => {
      const parsed = partySchema.safeParse(json);
      if (!parsed.success) {
        return {
          success: false,
          error:
            "Update party status response did not match the expected schema",
        };
      }
      return { success: true, data: parsed.data };
    },
    "Failed to update party status",
  );
}
