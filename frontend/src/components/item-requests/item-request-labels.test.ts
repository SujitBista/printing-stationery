import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  departmentDisplayName,
  employeeDisplayName,
  formatStoreTransferDirection,
  getItemRequestActionLabel,
  ITEM_REQUEST_LIST_STATUS_FILTER_OPTIONS,
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
