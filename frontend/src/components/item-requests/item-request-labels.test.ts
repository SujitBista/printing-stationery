import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  departmentDisplayName,
  employeeDisplayName,
  formatStoreTransferDirection,
  requestedByDisplayName,
  storeOptionLabel,
} from "./item-request-labels.js";

describe("formatStoreTransferDirection", () => {
  it("renders supplying store then receiving store", () => {
    assert.equal(
      formatStoreTransferDirection(
        { storeName: "Corporate Store" },
        { storeName: "Tankisinwari Store" },
      ),
      "Corporate Store → Tankisinwari Store",
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
