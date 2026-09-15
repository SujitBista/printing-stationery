import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  itemRequestNotificationRecipientIds,
  itemRequestPendingAssignee,
  notificationListQuerySchema,
  notificationTypeForItemRequestAction,
} from "@printing-stationery/shared";
import {
  buildItemRequestNotificationMessage,
  buildItemRequestNotificationRows,
  itemRequestNotificationVerb,
} from "./item-request-notifications.js";

const CREATOR = "11111111-1111-4111-8111-111111111111";
const CHECKER = "22222222-2222-4222-8222-222222222222";
const CORP_MAKER = "33333333-3333-4333-8333-333333333333";
const CORP_CHECKER = "44444444-4444-4444-8444-444444444444";
const REQUEST = "55555555-5555-4555-8555-555555555555";

describe("item request notification mapping", () => {
  it("maps workflow actions to notification types and skips cancel", () => {
    assert.equal(
      notificationTypeForItemRequestAction("SUBMIT"),
      "ITEM_REQUEST_SUBMITTED",
    );
    assert.equal(
      notificationTypeForItemRequestAction("RESUBMIT"),
      "ITEM_REQUEST_SUBMITTED",
    );
    assert.equal(
      notificationTypeForItemRequestAction("RECOMMEND"),
      "ITEM_REQUEST_RECOMMENDED",
    );
    assert.equal(
      notificationTypeForItemRequestAction("FORWARD"),
      "ITEM_REQUEST_FORWARDED",
    );
    assert.equal(
      notificationTypeForItemRequestAction("APPROVE"),
      "ITEM_REQUEST_APPROVED",
    );
    assert.equal(
      notificationTypeForItemRequestAction("RETURN"),
      "ITEM_REQUEST_RETURNED",
    );
    assert.equal(
      notificationTypeForItemRequestAction("REJECT"),
      "ITEM_REQUEST_REJECTED",
    );
    assert.equal(notificationTypeForItemRequestAction("CANCEL"), null);
  });

  it("uses the shared pending-assignee mapping", () => {
    assert.equal(
      itemRequestPendingAssignee("PENDING_BRANCH_CHECKER"),
      "branchChecker",
    );
    assert.equal(
      itemRequestPendingAssignee("RETURNED_TO_BRANCH_MAKER"),
      "createdBy",
    );
    assert.equal(itemRequestPendingAssignee("APPROVED"), null);
  });

  it("notifies the branch checker on submit and excludes the actor", () => {
    assert.deepEqual(
      itemRequestNotificationRecipientIds({
        toStatus: "PENDING_BRANCH_CHECKER",
        actorUserId: CREATOR,
        createdByApplicationUserId: CREATOR,
        branchCheckerApplicationUserId: CHECKER,
        corporateMakerApplicationUserId: null,
        corporateCheckerApplicationUserId: null,
      }),
      [CHECKER],
    );
  });

  it("notifies the corporate maker on recommend", () => {
    assert.deepEqual(
      itemRequestNotificationRecipientIds({
        toStatus: "PENDING_CORPORATE_MAKER",
        actorUserId: CHECKER,
        createdByApplicationUserId: CREATOR,
        branchCheckerApplicationUserId: CHECKER,
        corporateMakerApplicationUserId: CORP_MAKER,
        corporateCheckerApplicationUserId: CORP_CHECKER,
      }),
      [CORP_MAKER],
    );
  });

  it("notifies the corporate checker on forward", () => {
    assert.deepEqual(
      itemRequestNotificationRecipientIds({
        toStatus: "PENDING_CORPORATE_CHECKER",
        actorUserId: CORP_MAKER,
        createdByApplicationUserId: CREATOR,
        branchCheckerApplicationUserId: CHECKER,
        corporateMakerApplicationUserId: CORP_MAKER,
        corporateCheckerApplicationUserId: CORP_CHECKER,
      }),
      [CORP_CHECKER],
    );
  });

  it("notifies the branch maker when a request is returned to them", () => {
    assert.deepEqual(
      itemRequestNotificationRecipientIds({
        toStatus: "RETURNED_TO_BRANCH_MAKER",
        actorUserId: CHECKER,
        createdByApplicationUserId: CREATOR,
        branchCheckerApplicationUserId: CHECKER,
        corporateMakerApplicationUserId: CORP_MAKER,
        corporateCheckerApplicationUserId: CORP_CHECKER,
      }),
      [CREATOR],
    );
  });

  it("notifies the corporate maker when a request is returned to them", () => {
    assert.deepEqual(
      itemRequestNotificationRecipientIds({
        toStatus: "RETURNED_TO_CORPORATE_MAKER",
        actorUserId: CORP_CHECKER,
        createdByApplicationUserId: CREATOR,
        branchCheckerApplicationUserId: CHECKER,
        corporateMakerApplicationUserId: CORP_MAKER,
        corporateCheckerApplicationUserId: CORP_CHECKER,
      }),
      [CORP_MAKER],
    );
  });

  it("notifies recorded participants on approve except the actor", () => {
    const recipients = itemRequestNotificationRecipientIds({
      toStatus: "APPROVED",
      actorUserId: CORP_CHECKER,
      createdByApplicationUserId: CREATOR,
      branchCheckerApplicationUserId: CHECKER,
      corporateMakerApplicationUserId: CORP_MAKER,
      corporateCheckerApplicationUserId: CORP_CHECKER,
    });
    assert.deepEqual(new Set(recipients), new Set([CREATOR, CHECKER, CORP_MAKER]));
    assert.equal(recipients.includes(CORP_CHECKER), false);
  });

  it("builds one row per recipient with stored copy", () => {
    const rows = buildItemRequestNotificationRows({
      action: "SUBMIT",
      toStatus: "PENDING_BRANCH_CHECKER",
      requestId: REQUEST,
      requestNumber: "IR-20260915-ABCD",
      actorUserId: CREATOR,
      actorName: "Ram Maker",
      remarks: null,
      createdByApplicationUserId: CREATOR,
      branchCheckerApplicationUserId: CHECKER,
      corporateMakerApplicationUserId: null,
      corporateCheckerApplicationUserId: null,
    });

    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.recipientUserId, CHECKER);
    assert.equal(rows[0]?.type, "ITEM_REQUEST_SUBMITTED");
    assert.equal(rows[0]?.title, "Item request submitted");
    assert.equal(
      rows[0]?.message,
      "Ram Maker submitted request IR-20260915-ABCD.",
    );
    assert.equal(rows[0]?.relatedEntityType, "ITEM_REQUEST");
    assert.equal(rows[0]?.relatedEntityId, REQUEST);
    assert.equal(rows[0]?.isRead, false);
  });

  it("uses resubmitted wording for RESUBMIT", () => {
    assert.equal(
      itemRequestNotificationVerb("ITEM_REQUEST_SUBMITTED", "RESUBMIT"),
      "resubmitted",
    );
    assert.match(
      buildItemRequestNotificationMessage({
        type: "ITEM_REQUEST_SUBMITTED",
        action: "RESUBMIT",
        actorName: "Ram Maker",
        requestNumber: "IR-1",
        remarks: "Please review again",
      }),
      /resubmitted request IR-1\. Please review again/,
    );
  });

  it("does not emit rows for cancel", () => {
    const rows = buildItemRequestNotificationRows({
      action: "CANCEL",
      toStatus: "CANCELLED",
      requestId: REQUEST,
      requestNumber: "IR-1",
      actorUserId: CREATOR,
      actorName: "Ram Maker",
      remarks: null,
      createdByApplicationUserId: CREATOR,
      branchCheckerApplicationUserId: CHECKER,
      corporateMakerApplicationUserId: null,
      corporateCheckerApplicationUserId: null,
    });
    assert.deepEqual(rows, []);
  });
});

describe("notification list query schema", () => {
  it("parses unreadOnly query flags", () => {
    const parsed = notificationListQuerySchema.safeParse({
      unreadOnly: "true",
    });
    assert.equal(parsed.success, true);
    if (parsed.success) {
      assert.equal(parsed.data.unreadOnly, true);
      assert.equal(parsed.data.page, 1);
      assert.equal(parsed.data.pageSize, 20);
    }
  });
});
