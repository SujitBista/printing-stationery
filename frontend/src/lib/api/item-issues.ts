import {
  createItemIssueInputSchema,
  itemIssueEligibilitySchema,
  itemIssueIdSchema,
  itemIssueListQuerySchema,
  itemIssueSchema,
  itemRequestIdSchema,
  paginatedItemIssueResponseSchema,
  rejectItemIssueInputSchema,
  returnItemIssueInputSchema,
  submitItemIssueInputSchema,
  updateItemIssueInputSchema,
  verifyItemIssueInputSchema,
  type CreateItemIssueInput,
  type ItemIssue,
  type ItemIssueEligibility,
  type ItemIssueListQuery,
  type PaginatedItemIssueResponse,
  type UpdateItemIssueInput,
} from "@printing-stationery/shared";
import { requestJson, type ApiResult } from "./client";

function buildListQueryString(query: ItemIssueListQuery): string {
  const params = new URLSearchParams();
  params.set("page", String(query.page));
  params.set("pageSize", String(query.pageSize));
  params.set("status", query.status);
  if (query.search) {
    params.set("search", query.search);
  }
  if (query.queue) {
    params.set("queue", query.queue);
  }
  return params.toString();
}

export async function fetchItemIssueEligibility(
  requestId: string,
): Promise<ApiResult<ItemIssueEligibility>> {
  const parsedId = itemRequestIdSchema.safeParse(requestId);
  if (!parsedId.success) {
    return { ok: false, error: "Invalid item request id", status: 400 };
  }

  return requestJson(
    `/api/item-requests/${parsedId.data}/issue-eligibility`,
    { method: "GET" },
    (json) => {
      const parsed = itemIssueEligibilitySchema.safeParse(json);
      if (!parsed.success) {
        return {
          success: false,
          error: "Item issue eligibility response did not match the expected schema",
        };
      }
      return { success: true, data: parsed.data };
    },
    "Failed to load item issue eligibility",
  );
}

export async function createItemIssueFromRequest(
  requestId: string,
  input: CreateItemIssueInput,
): Promise<ApiResult<ItemIssue>> {
  const parsedId = itemRequestIdSchema.safeParse(requestId);
  if (!parsedId.success) {
    return { ok: false, error: "Invalid item request id", status: 400 };
  }

  const parsedInput = createItemIssueInputSchema.safeParse(input);
  if (!parsedInput.success) {
    const issue = parsedInput.error.issues[0];
    return {
      ok: false,
      error: issue?.message ?? "Invalid item issue input",
      status: 400,
    };
  }

  return requestJson(
    `/api/item-requests/${parsedId.data}/item-issues`,
    {
      method: "POST",
      body: JSON.stringify(parsedInput.data),
    },
    (json) => {
      const parsed = itemIssueSchema.safeParse(json);
      if (!parsed.success) {
        return {
          success: false,
          error: "Create item issue response did not match the expected schema",
        };
      }
      return { success: true, data: parsed.data };
    },
    "Failed to create item issue",
  );
}

export async function fetchItemIssues(
  rawQuery: Partial<ItemIssueListQuery> = {},
): Promise<ApiResult<PaginatedItemIssueResponse>> {
  const parsedQuery = itemIssueListQuerySchema.safeParse(rawQuery);
  if (!parsedQuery.success) {
    return { ok: false, error: "Invalid item issue list query", status: 400 };
  }

  return requestJson(
    `/api/item-issues?${buildListQueryString(parsedQuery.data)}`,
    { method: "GET" },
    (json) => {
      const parsed = paginatedItemIssueResponseSchema.safeParse(json);
      if (!parsed.success) {
        return {
          success: false,
          error: "Item issue list response did not match the expected schema",
        };
      }
      return { success: true, data: parsed.data };
    },
    "Failed to load item issues",
  );
}

export async function fetchItemIssue(id: string): Promise<ApiResult<ItemIssue>> {
  const parsedId = itemIssueIdSchema.safeParse(id);
  if (!parsedId.success) {
    return { ok: false, error: "Invalid item issue id", status: 400 };
  }

  return requestJson(
    `/api/item-issues/${parsedId.data}`,
    { method: "GET" },
    (json) => {
      const parsed = itemIssueSchema.safeParse(json);
      if (!parsed.success) {
        return {
          success: false,
          error: "Item issue response did not match the expected schema",
        };
      }
      return { success: true, data: parsed.data };
    },
    "Failed to load item issue",
  );
}

export async function updateItemIssue(
  id: string,
  input: UpdateItemIssueInput,
): Promise<ApiResult<ItemIssue>> {
  const parsedId = itemIssueIdSchema.safeParse(id);
  if (!parsedId.success) {
    return { ok: false, error: "Invalid item issue id", status: 400 };
  }

  const parsedInput = updateItemIssueInputSchema.safeParse(input);
  if (!parsedInput.success) {
    const issue = parsedInput.error.issues[0];
    return {
      ok: false,
      error: issue?.message ?? "Invalid item issue update",
      status: 400,
    };
  }

  return requestJson(
    `/api/item-issues/${parsedId.data}`,
    {
      method: "PATCH",
      body: JSON.stringify(parsedInput.data),
    },
    (json) => {
      const parsed = itemIssueSchema.safeParse(json);
      if (!parsed.success) {
        return {
          success: false,
          error: "Update item issue response did not match the expected schema",
        };
      }
      return { success: true, data: parsed.data };
    },
    "Failed to update item issue",
  );
}

export async function submitItemIssue(
  id: string,
  input: { expectedVersion: number },
): Promise<ApiResult<ItemIssue>> {
  const parsedId = itemIssueIdSchema.safeParse(id);
  if (!parsedId.success) {
    return { ok: false, error: "Invalid item issue id", status: 400 };
  }

  const parsedInput = submitItemIssueInputSchema.safeParse(input);
  if (!parsedInput.success) {
    const issue = parsedInput.error.issues[0];
    return {
      ok: false,
      error: issue?.message ?? "Invalid item issue submit request",
      status: 400,
    };
  }

  return requestJson(
    `/api/item-issues/${parsedId.data}/submit`,
    {
      method: "POST",
      body: JSON.stringify(parsedInput.data),
    },
    (json) => {
      const parsed = itemIssueSchema.safeParse(json);
      if (!parsed.success) {
        return {
          success: false,
          error: "Submit item issue response did not match the expected schema",
        };
      }
      return { success: true, data: parsed.data };
    },
    "Failed to submit item issue",
  );
}

function postIssueAction(
  id: string,
  path: "verify" | "return" | "reject",
  body: unknown,
  invalidMessage: string,
  failedMessage: string,
): Promise<ApiResult<ItemIssue>> {
  return requestJson(
    `/api/item-issues/${id}/${path}`,
    {
      method: "POST",
      body: JSON.stringify(body),
    },
    (json) => {
      const parsed = itemIssueSchema.safeParse(json);
      if (!parsed.success) {
        return { success: false, error: invalidMessage };
      }
      return { success: true, data: parsed.data };
    },
    failedMessage,
  );
}

export async function verifyItemIssue(
  id: string,
  input: { expectedVersion: number; remarks?: string | null },
): Promise<ApiResult<ItemIssue>> {
  const parsedId = itemIssueIdSchema.safeParse(id);
  if (!parsedId.success) {
    return { ok: false, error: "Invalid item issue id", status: 400 };
  }
  const parsedInput = verifyItemIssueInputSchema.safeParse(input);
  if (!parsedInput.success) {
    return {
      ok: false,
      error: parsedInput.error.issues[0]?.message ?? "Invalid verify request",
      status: 400,
    };
  }
  return postIssueAction(
    parsedId.data,
    "verify",
    parsedInput.data,
    "Verify item issue response did not match the expected schema",
    "Failed to verify item issue",
  );
}

export async function returnItemIssue(
  id: string,
  input: { expectedVersion: number; remarks: string },
): Promise<ApiResult<ItemIssue>> {
  const parsedId = itemIssueIdSchema.safeParse(id);
  if (!parsedId.success) {
    return { ok: false, error: "Invalid item issue id", status: 400 };
  }
  const parsedInput = returnItemIssueInputSchema.safeParse(input);
  if (!parsedInput.success) {
    return {
      ok: false,
      error: parsedInput.error.issues[0]?.message ?? "Invalid return request",
      status: 400,
    };
  }
  return postIssueAction(
    parsedId.data,
    "return",
    parsedInput.data,
    "Return item issue response did not match the expected schema",
    "Failed to return item issue",
  );
}

export async function rejectItemIssue(
  id: string,
  input: { expectedVersion: number; remarks: string },
): Promise<ApiResult<ItemIssue>> {
  const parsedId = itemIssueIdSchema.safeParse(id);
  if (!parsedId.success) {
    return { ok: false, error: "Invalid item issue id", status: 400 };
  }
  const parsedInput = rejectItemIssueInputSchema.safeParse(input);
  if (!parsedInput.success) {
    return {
      ok: false,
      error: parsedInput.error.issues[0]?.message ?? "Invalid reject request",
      status: 400,
    };
  }
  return postIssueAction(
    parsedId.data,
    "reject",
    parsedInput.data,
    "Reject item issue response did not match the expected schema",
    "Failed to reject item issue",
  );
}
