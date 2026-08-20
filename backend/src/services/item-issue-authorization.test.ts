import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createItemIssueInputSchema } from "@printing-stationery/shared";
import {
  ADMIN_ITEM_ISSUE_OPERATOR_FORBIDDEN_MESSAGE,
  ITEM_ISSUE_OPERATOR_FORBIDDEN_MESSAGE,
  actorMayOperateItemIssue,
  isCorporateSupplyingStore,
  requestAllowsItemIssueCreation,
} from "./item-issue-authorization.js";
import {
  canCreateIssueFromAvailability,
  validateIssueLinesAgainstAvailability,
} from "./item-issues.service.js";
import { AppError } from "../utils/errors.js";

const CORPORATE_STORE_ID = "11111111-1111-4111-8111-111111111111";
const BRANCH_STORE_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_STORE_ID = "33333333-3333-4333-8333-333333333333";
const REQUEST_LINE_ID = "44444444-4444-4444-8444-444444444444";
const OTHER_LINE_ID = "55555555-5555-4555-8555-555555555555";

function actor(roles: Array<"ADMIN" | "MAKER" | "CHECKER" | "HR">) {
  return { roles };
}

function availabilityLine(overrides?: {
  requestLineId?: string;
  remainingQuantity?: string;
  itemCode?: string;
}) {
  return {
    requestLineId: overrides?.requestLineId ?? REQUEST_LINE_ID,
    itemId: "66666666-6666-4666-8666-666666666666",
    itemCode: overrides?.itemCode ?? "PEN-01",
    itemName: "Pen",
    unit: { id: "77777777-7777-4777-8777-777777777777", unitName: "Pcs" },
    requestedQuantity: "10",
    previouslyIssuedQuantity: "0",
    remainingQuantity: overrides?.remainingQuantity ?? "10",
    availableStockQuantity: null,
    stockBalanceKnown: false,
  };
}

describe("item issue authorization", () => {
  it("identifies a head-office root store as the corporate supplying store", () => {
    assert.equal(
      isCorporateSupplyingStore({
        underStoreId: null,
        branchType: "HEAD_OFFICE",
      }),
      true,
    );
  });

  it("rejects a branch store as the corporate supplying store", () => {
    assert.equal(
      isCorporateSupplyingStore({
        underStoreId: CORPORATE_STORE_ID,
        branchType: "BRANCH",
      }),
      false,
    );
  });

  it("allows an active checker assigned to the supplying store", () => {
    assert.equal(
      actorMayOperateItemIssue({
        actor: actor(["CHECKER"]),
        supplyingStoreId: CORPORATE_STORE_ID,
        supervisedStoreIds: [CORPORATE_STORE_ID],
      }),
      true,
    );
  });

  it("denies a maker assigned to the supplying store", () => {
    assert.equal(
      actorMayOperateItemIssue({
        actor: actor(["MAKER"]),
        supplyingStoreId: CORPORATE_STORE_ID,
        supervisedStoreIds: [CORPORATE_STORE_ID],
      }),
      false,
    );
  });

  it("denies a checker assigned only to the requesting store", () => {
    assert.equal(
      actorMayOperateItemIssue({
        actor: actor(["CHECKER"]),
        supplyingStoreId: CORPORATE_STORE_ID,
        supervisedStoreIds: [BRANCH_STORE_ID],
      }),
      false,
    );
  });

  it("denies a checker assigned to an unrelated store", () => {
    assert.equal(
      actorMayOperateItemIssue({
        actor: actor(["CHECKER"]),
        supplyingStoreId: CORPORATE_STORE_ID,
        supervisedStoreIds: [OTHER_STORE_ID],
      }),
      false,
    );
  });

  it("denies administrators even when they supervise the supplying store", () => {
    assert.equal(
      actorMayOperateItemIssue({
        actor: actor(["ADMIN", "CHECKER"]),
        supplyingStoreId: CORPORATE_STORE_ID,
        supervisedStoreIds: [CORPORATE_STORE_ID],
      }),
      false,
    );
  });

  it("uses the database supplying store id, not a browser-provided store id", () => {
    const browserProvidedStoreId = BRANCH_STORE_ID;
    const databaseSupplyingStoreId = CORPORATE_STORE_ID;

    assert.equal(
      actorMayOperateItemIssue({
        actor: actor(["CHECKER"]),
        supplyingStoreId: databaseSupplyingStoreId,
        supervisedStoreIds: [databaseSupplyingStoreId],
      }),
      true,
    );
    assert.equal(
      actorMayOperateItemIssue({
        actor: actor(["CHECKER"]),
        supplyingStoreId: browserProvidedStoreId,
        supervisedStoreIds: [databaseSupplyingStoreId],
      }),
      false,
    );
  });

  it("allows issue creation only from an approved request supplied by corporate store", () => {
    const corporateStore = {
      id: CORPORATE_STORE_ID,
      underStoreId: null,
      branchType: "HEAD_OFFICE",
    };

    assert.equal(
      requestAllowsItemIssueCreation({
        requestStatus: "APPROVED",
        supplyingStoreId: CORPORATE_STORE_ID,
        supplyingStore: corporateStore,
      }),
      true,
    );
    assert.equal(
      requestAllowsItemIssueCreation({
        requestStatus: "PENDING_CORPORATE_CHECKER",
        supplyingStoreId: CORPORATE_STORE_ID,
        supplyingStore: corporateStore,
      }),
      false,
    );
    assert.equal(
      requestAllowsItemIssueCreation({
        requestStatus: "APPROVED",
        supplyingStoreId: BRANCH_STORE_ID,
        supplyingStore: {
          id: BRANCH_STORE_ID,
          underStoreId: CORPORATE_STORE_ID,
          branchType: "BRANCH",
        },
      }),
      false,
    );
  });

  it("keeps a safe authorization message that does not mention makers", () => {
    assert.match(ITEM_ISSUE_OPERATOR_FORBIDDEN_MESSAGE, /checker/i);
    assert.doesNotMatch(ITEM_ISSUE_OPERATOR_FORBIDDEN_MESSAGE, /maker/i);
    assert.match(ADMIN_ITEM_ISSUE_OPERATOR_FORBIDDEN_MESSAGE, /Administrator/i);
  });
});

describe("item issue remaining quantity rules", () => {
  it("allows a new issue when remaining quantity is positive", () => {
    assert.equal(
      canCreateIssueFromAvailability([availabilityLine({ remainingQuantity: "2" })]),
      true,
    );
  });

  it("rejects a new issue when no remaining quantity is available", () => {
    assert.equal(
      canCreateIssueFromAvailability([availabilityLine({ remainingQuantity: "0" })]),
      false,
    );
  });

  it("rejects an issue quantity that exceeds remaining quantity", () => {
    assert.throws(
      () =>
        validateIssueLinesAgainstAvailability({
          lines: [{ requestLineId: REQUEST_LINE_ID, issueQuantity: "11" }],
          availability: [availabilityLine({ remainingQuantity: "10" })],
        }),
      (error: unknown) =>
        error instanceof AppError &&
        error.statusCode === 409 &&
        /exceeds the remaining requested quantity/i.test(error.message),
    );
  });

  it("rejects issue lines that do not belong to the request", () => {
    assert.throws(
      () =>
        validateIssueLinesAgainstAvailability({
          lines: [{ requestLineId: OTHER_LINE_ID, issueQuantity: "1" }],
          availability: [availabilityLine()],
        }),
      (error: unknown) =>
        error instanceof AppError &&
        error.statusCode === 400 &&
        /must belong to the selected request/i.test(error.message),
    );
  });
});

describe("item issue create input", () => {
  const validLine = {
    requestLineId: REQUEST_LINE_ID,
    issueQuantity: "1",
  };

  it("rejects a browser-provided store id instead of trusting it", () => {
    const parsed = createItemIssueInputSchema.safeParse({
      remarks: null,
      lines: [validLine],
      fromStoreId: BRANCH_STORE_ID,
    });

    assert.equal(parsed.success, false);
  });

  it("rejects duplicate request lines in one issue", () => {
    const parsed = createItemIssueInputSchema.safeParse({
      remarks: null,
      lines: [validLine, { ...validLine }],
    });

    assert.equal(parsed.success, false);
  });
});
