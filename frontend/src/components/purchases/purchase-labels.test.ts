import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createdByDisplayName,
  formatIsoDate,
  formatPurchaseAmount,
} from "./purchase-labels.js";

describe("purchase labels", () => {
  it("formats ISO dates as DD/MM/YYYY", () => {
    assert.equal(formatIsoDate("2026-09-08"), "08/09/2026");
  });

  it("formats amounts to four decimal places", () => {
    assert.equal(formatPurchaseAmount("33600"), "33600.0000");
  });

  it("prefers the employee name for Created By", () => {
    assert.equal(
      createdByDisplayName({
        id: "1",
        username: "msoni",
        isActive: true,
        employee: {
          id: "2",
          employeeCode: "E1",
          employeeName: "Mukesh Soni",
          isActive: true,
        },
      }),
      "Mukesh Soni",
    );
  });
});
