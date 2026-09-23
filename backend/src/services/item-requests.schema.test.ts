import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CORPORATE_STORE_CODE,
  createItemRequestInputSchema,
  eligibleItemRequestItemListQuerySchema,
  eligibleItemRequestStoreListQuerySchema,
  getItemRequestNavQueues,
  inferItemRequestActorWorkflowRole,
  isCorporateControlStore,
  ITEM_REQUEST_QUEUE_STATUSES,
  ITEM_REQUEST_STATUSES,
  ITEM_REQUEST_SUBMITTED_LIST_FILTER,
  itemRequestActionInputSchema,
  itemRequestListQuerySchema,
  itemRequestWorkflowCanCreate,
  itemRequestWorkflowIsCorporateMaker,
  resolveItemRequestListStatusFilter,
  preferCorporateControlStore,
  resolveItemRequestIssueAction,
} from "@printing-stationery/shared";

const SOURCE = "11111111-1111-4111-8111-111111111111";
const DESTINATION = "22222222-2222-4222-8222-222222222222";
const ITEM = "33333333-3333-4333-8333-333333333333";
const EMPLOYEE = "44444444-4444-4444-8444-444444444444";
const USER = "55555555-5555-4555-8555-555555555555";

describe("create item request store pair schema", () => {
  it("requires source and destination stores", () => {
    const parsed = createItemRequestInputSchema.safeParse({
      requestedByEmployeeId: EMPLOYEE,
      remarks: null,
      lines: [{ itemId: ITEM, requestedQuantity: "1" }],
    });
    assert.equal(parsed.success, false);
  });

  it("requires requestedByEmployeeId", () => {
    const parsed = createItemRequestInputSchema.safeParse({
      sourceStoreId: SOURCE,
      destinationStoreId: DESTINATION,
      remarks: null,
      lines: [{ itemId: ITEM, requestedQuantity: "1" }],
    });
    assert.equal(parsed.success, false);
  });

  it("rejects a client-supplied Created By identity", () => {
    const parsed = createItemRequestInputSchema.safeParse({
      sourceStoreId: SOURCE,
      destinationStoreId: DESTINATION,
      requestedByEmployeeId: EMPLOYEE,
      createdByUserId: USER,
      createdByApplicationUserId: USER,
      remarks: null,
      lines: [{ itemId: ITEM, requestedQuantity: "1" }],
    });
    assert.equal(parsed.success, false);
  });

  it("rejects the same store for Request From and Request To", () => {
    const parsed = createItemRequestInputSchema.safeParse({
      sourceStoreId: SOURCE,
      destinationStoreId: SOURCE,
      requestedByEmployeeId: EMPLOYEE,
      remarks: null,
      lines: [{ itemId: ITEM, requestedQuantity: "1" }],
    });
    assert.equal(parsed.success, false);
    if (!parsed.success) {
      assert.match(
        parsed.error.issues[0]?.message ?? "",
        /must be different/i,
      );
    }
  });

  it("accepts different source and destination stores", () => {
    const parsed = createItemRequestInputSchema.safeParse({
      sourceStoreId: SOURCE,
      destinationStoreId: DESTINATION,
      requestedByEmployeeId: EMPLOYEE,
      remarks: null,
      lines: [{ itemId: ITEM, requestedQuantity: "1.5" }],
    });
    assert.equal(parsed.success, true);
  });
});

describe("eligible requesting store search query", () => {
  it("defaults to a page size larger than five", () => {
    const parsed = eligibleItemRequestStoreListQuerySchema.safeParse({});
    assert.equal(parsed.success, true);
    if (parsed.success) {
      assert.equal(parsed.data.page, 1);
      assert.ok(parsed.data.pageSize > 5);
      assert.equal(parsed.data.search, undefined);
    }
  });

  it("keeps an explicit search that can match stores beyond the first page", () => {
    const parsed = eligibleItemRequestStoreListQuerySchema.safeParse({
      page: 1,
      pageSize: 5,
      search: "Zulu Distant",
    });
    assert.equal(parsed.success, true);
    if (parsed.success) {
      assert.equal(parsed.data.pageSize, 5);
      assert.equal(parsed.data.search, "Zulu Distant");
    }
  });
});

describe("eligible item stock query", () => {
  it("reads available stock from Request To Store", () => {
    const parsed = eligibleItemRequestItemListQuerySchema.safeParse({
      destinationStoreId: DESTINATION,
    });
    assert.equal(parsed.success, true);
    if (parsed.success) {
      assert.equal(parsed.data.destinationStoreId, DESTINATION);
    }
  });

  it("does not treat sourceStoreId as the stock store", () => {
    const parsed = eligibleItemRequestItemListQuerySchema.safeParse({
      sourceStoreId: SOURCE,
    });
    assert.equal(parsed.success, true);
    if (parsed.success) {
      assert.equal(parsed.data.destinationStoreId, undefined);
      assert.equal(
        (parsed.data as { sourceStoreId?: string }).sourceStoreId,
        undefined,
      );
    }
  });
});

describe("corporate store identity", () => {
  it("identifies Corporate Store by configured store code 999", () => {
    assert.equal(CORPORATE_STORE_CODE, "999");
    assert.equal(
      isCorporateControlStore({
        storeCode: "999",
        storeName: "Corporate Store",
        underStoreId: null,
        branchType: "HEAD_OFFICE",
      }),
      true,
    );
  });

  it("does not treat a UUID or another store code as Corporate Store", () => {
    assert.equal(
      isCorporateControlStore({
        storeCode: "001",
        storeName: "Birtamod Store",
        underStoreId: SOURCE,
        branchType: "BRANCH",
      }),
      false,
    );
  });

  it("prefers store code 999 when multiple head-office roots exist", () => {
    const preferred = preferCorporateControlStore([
      {
        storeCode: "0999",
        storeName: "Corporate Main Branch 999",
        underStoreId: null,
        branchType: "HEAD_OFFICE",
      },
      {
        storeCode: "999",
        storeName: "Corporate Store",
        underStoreId: null,
        branchType: "HEAD_OFFICE",
      },
    ]);
    assert.equal(preferred?.storeCode, "999");
  });
});

describe("item request workflow remarks and history", () => {
  it("requires remarks for Return and Reject but not Approve", () => {
    const base = { expectedVersion: 2 };
    assert.equal(
      itemRequestActionInputSchema.safeParse({
        ...base,
        action: "RETURN",
        remarks: null,
      }).success,
      false,
    );
    assert.equal(
      itemRequestActionInputSchema.safeParse({
        ...base,
        action: "REJECT",
        remarks: "   ",
      }).success,
      false,
    );
    assert.equal(
      itemRequestActionInputSchema.safeParse({
        ...base,
        action: "APPROVE",
        remarks: null,
      }).success,
      true,
    );
    assert.equal(
      itemRequestActionInputSchema.safeParse({
        ...base,
        action: "RETURN",
        remarks: "Send back to Corporate Maker",
      }).success,
      true,
    );
  });

  it("infers Corporate Checker history role for final approval actions", () => {
    assert.equal(
      inferItemRequestActorWorkflowRole({
        action: "APPROVE",
        fromStatus: "PENDING_CORPORATE_CHECKER",
      }),
      "CORPORATE_CHECKER",
    );
    assert.equal(
      inferItemRequestActorWorkflowRole({
        action: "RETURN",
        fromStatus: "PENDING_CORPORATE_CHECKER",
      }),
      "CORPORATE_CHECKER",
    );
    assert.equal(
      inferItemRequestActorWorkflowRole({
        action: "FORWARD",
        fromStatus: "PENDING_CORPORATE_MAKER",
      }),
      "CORPORATE_MAKER",
    );
    assert.equal(
      inferItemRequestActorWorkflowRole({
        action: "RECOMMEND",
        fromStatus: "PENDING_BRANCH_CHECKER",
      }),
      "BRANCH_CHECKER",
    );
  });

  it("keeps fulfilment queues out of Corporate Checker approval navigation", () => {
    const nav = getItemRequestNavQueues(["CORPORATE_CHECKER"], true);
    assert.deepEqual(nav.workflowQueues, [
      "approve",
      "approved",
      "returned",
      "rejected",
      "request-list",
    ]);
    assert.deepEqual(nav.fulfilmentQueues, ["issued", "partial-pending"]);
    assert.equal(nav.workflowQueues.includes("recommend"), false);
    assert.equal(nav.workflowQueues.includes("review"), false);
    assert.equal(nav.workflowQueues.includes("ready-to-issue"), false);
  });

  it("adds Ready to Issue to Corporate Maker navigation", () => {
    const nav = getItemRequestNavQueues(["CORPORATE_MAKER"], true);
    assert.ok(nav.workflowQueues.includes("review"));
    assert.ok(nav.workflowQueues.includes("ready-to-issue"));
    assert.equal(nav.workflowQueues.includes("approve"), false);
  });

  it("lets only admins and Branch Makers create item requests", () => {
    assert.equal(itemRequestWorkflowCanCreate(["ADMIN"]), true);
    assert.equal(itemRequestWorkflowCanCreate(["BRANCH_MAKER"]), true);
    assert.equal(itemRequestWorkflowCanCreate(["CORPORATE_MAKER"]), false);
    assert.equal(itemRequestWorkflowCanCreate(["CORPORATE_CHECKER"]), false);
    assert.equal(itemRequestWorkflowCanCreate(["BRANCH_CHECKER"]), false);
    assert.equal(itemRequestWorkflowIsCorporateMaker(["CORPORATE_MAKER"]), true);
    assert.equal(
      itemRequestWorkflowIsCorporateMaker(["CORPORATE_MAKER", "BRANCH_MAKER"]),
      false,
    );
  });

  it("keeps Ready to Issue as unposted approved requests", () => {
    assert.deepEqual(ITEM_REQUEST_QUEUE_STATUSES["ready-to-issue"], ["APPROVED"]);
    assert.deepEqual(ITEM_REQUEST_QUEUE_STATUSES["partial-pending"], [
      "PARTIALLY_ISSUED",
    ]);
  });

  it("resolves issue actions from the active issue instead of always creating", () => {
    assert.equal(
      resolveItemRequestIssueAction({
        canCreateNewIssue: true,
        requestStatus: "APPROVED",
        activeIssue: null,
      }),
      "CREATE",
    );
    assert.equal(
      resolveItemRequestIssueAction({
        canCreateNewIssue: false,
        requestStatus: "APPROVED",
        activeIssue: { status: "DRAFT" },
      }),
      "CONTINUE_DRAFT",
    );
    assert.equal(
      resolveItemRequestIssueAction({
        canCreateNewIssue: false,
        requestStatus: "APPROVED",
        activeIssue: { status: "PENDING_VERIFICATION" },
      }),
      "VIEW_SUBMITTED",
    );
    assert.equal(
      resolveItemRequestIssueAction({
        canCreateNewIssue: false,
        requestStatus: "APPROVED",
        activeIssue: { status: "RETURNED" },
      }),
      "CORRECT_AND_RESUBMIT",
    );
    assert.equal(
      resolveItemRequestIssueAction({
        canCreateNewIssue: true,
        requestStatus: "PARTIALLY_ISSUED",
        activeIssue: null,
      }),
      "CREATE_REMAINING",
    );
  });
});

describe("submitted item request status", () => {
  it("keeps PENDING_BRANCH_CHECKER as the stored submitted status", () => {
    assert.equal(ITEM_REQUEST_STATUSES.includes("PENDING_BRANCH_CHECKER"), true);
    assert.equal(
      (ITEM_REQUEST_STATUSES as readonly string[]).includes("SUBMITTED"),
      false,
    );
    assert.equal(ITEM_REQUEST_SUBMITTED_LIST_FILTER, "SUBMITTED");
    assert.deepEqual(ITEM_REQUEST_QUEUE_STATUSES.submitted, [
      "PENDING_BRANCH_CHECKER",
    ]);
    assert.equal(
      getItemRequestNavQueues(["BRANCH_MAKER"], false).workflowQueues.includes(
        "submitted",
      ),
      false,
    );
  });

  it("maps Request List status=SUBMITTED onto the stored status", () => {
    const parsed = itemRequestListQuerySchema.parse({
      status: "SUBMITTED",
      queue: "request-list",
    });

    assert.equal(parsed.status, "PENDING_BRANCH_CHECKER");
    assert.equal(parsed.queue, "request-list");
    assert.equal(
      resolveItemRequestListStatusFilter("SUBMITTED"),
      "PENDING_BRANCH_CHECKER",
    );
    assert.equal(resolveItemRequestListStatusFilter("DRAFT"), "DRAFT");
  });
});
