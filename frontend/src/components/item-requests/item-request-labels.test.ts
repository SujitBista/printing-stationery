import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  departmentDisplayName,
  employeeDisplayName,
  formatStoreTransferDirection,
  getItemRequestActionLabel,
  ITEM_REQUEST_LIST_STATUS_FILTER_OPTIONS,
  itemRequestPendingWithLabel,
  itemRequestTrackingStatusLabel,
  requestedByDisplayName,
  storeOptionLabel,
} from "./item-request-labels.js";

describe("formatStoreTransferDirection", () => {
  it("renders requesting store then processing store", () => {
    assert.equal(
      formatStoreTransferDirection(
        { storeName: "Birtamod Store" },
        { storeName: "Corporate Store" },
      ),
      "Birtamod Store → Corporate Store",
    );
  });
});

describe("storeOptionLabel", () => {
  it("renders store code, store name, and branch name", () => {
    assert.equal(
      storeOptionLabel({
        storeCode: "HO-01",
        storeName: "Head Office Store",
        branch: { branchName: "Head Office" },
      }),
      "HO-01 — Head Office Store (Head Office)",
    );
  });
});

describe("requested by labels", () => {
  it("formats Requested By as name and employee number", () => {
    assert.equal(
      employeeDisplayName({
        employeeName: "Anjani Chaudhary",
        employeeCode: "368",
      }),
      "Anjani Chaudhary (368)",
    );
  });

  it("shows that no department is assigned when the employee has none", () => {
    assert.equal(departmentDisplayName(null), "No department assigned");
  });

  it("prefers Requested By over Created By when both refer to people", () => {
    assert.equal(
      requestedByDisplayName(
        {
          employeeName: "Anjani Chaudhary",
          employeeCode: "368",
        },
        {
          id: "11111111-1111-4111-8111-111111111111",
          username: "admin",
          isActive: true,
          employee: {
            id: "22222222-2222-4222-8222-222222222222",
            employeeCode: "247",
            employeeName: "Mukesh Soni",
            isActive: true,
          },
        },
      ),
      "Anjani Chaudhary (368)",
    );
  });
});

describe("request list status filter", () => {
  it("offers Submitted without treating it as a separate stored status label", () => {
    const submitted = ITEM_REQUEST_LIST_STATUS_FILTER_OPTIONS.find(
      (option) => option.value === "SUBMITTED",
    );
    assert.equal(submitted?.label, "Submitted");
    assert.equal(
      itemRequestTrackingStatusLabel("PENDING_BRANCH_CHECKER"),
      "Submitted",
    );
    assert.equal(itemRequestTrackingStatusLabel("DRAFT"), "Draft");
    assert.equal(itemRequestTrackingStatusLabel("ISSUED"), "Fully Issued");
    assert.equal(
      itemRequestTrackingStatusLabel("PARTIALLY_ISSUED"),
      "Partially Issued",
    );
  });

  it("offers Recommended as the tracking name for the stored recommended status", () => {
    const recommended = ITEM_REQUEST_LIST_STATUS_FILTER_OPTIONS.find(
      (option) => option.value === "RECOMMENDED",
    );
    assert.equal(recommended?.label, "Recommended");
    const filterValues: readonly string[] =
      ITEM_REQUEST_LIST_STATUS_FILTER_OPTIONS.map((option) => option.value);
    assert.equal(filterValues.includes("PENDING_CORPORATE_MAKER"), false);
    assert.equal(
      itemRequestTrackingStatusLabel("PENDING_CORPORATE_MAKER"),
      "Recommended",
    );
  });
});

describe("pending with label", () => {
  it("shows the assigned user and role", () => {
    assert.equal(
      itemRequestPendingWithLabel("PENDING_CORPORATE_MAKER", {
        id: "33333333-3333-4333-8333-333333333333",
        username: "corp.maker",
        isActive: true,
        employee: {
          id: "44444444-4444-4444-8444-444444444444",
          employeeCode: "501",
          employeeName: "Sita Sharma",
          isActive: true,
        },
      }),
      "Sita Sharma (501) (Corporate Maker)",
    );
  });
});

describe("item request action labels", () => {
  it("uses Return to Corporate Maker on the approval queue", () => {
    assert.equal(
      getItemRequestActionLabel("RETURN", { queue: "approve" }),
      "Return to Corporate Maker",
    );
    assert.equal(
      getItemRequestActionLabel("RETURN", {
        status: "PENDING_CORPORATE_CHECKER",
      }),
      "Return to Corporate Maker",
    );
    assert.equal(
      getItemRequestActionLabel("APPROVE", { queue: "approve" }),
      "Approve",
    );
  });
});
