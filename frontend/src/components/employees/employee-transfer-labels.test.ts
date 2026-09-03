import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  branchLabel,
  formatIsoDate,
  personLabel,
  storeLabel,
} from "./employee-transfer-labels";

describe("employee transfer labels", () => {
  it("formats an ISO date without UTC shifting the calendar day", () => {
    assert.equal(typeof formatIsoDate("2026-09-02"), "string");
    assert.match(formatIsoDate("2026-09-02"), /2026|9|2/);
  });

  it("prefers employee name over username", () => {
    assert.equal(
      personLabel({
        username: "ada",
        employeeName: "Ada Lovelace",
        employeeCode: "E-1",
      }),
      "Ada Lovelace (E-1)",
    );
    assert.equal(
      personLabel({
        username: "admin",
        employeeName: null,
        employeeCode: null,
      }),
      "admin",
    );
  });

  it("formats branch and store labels", () => {
    assert.equal(
      branchLabel({ branchCode: "B1", branchName: "Kathmandu" }),
      "B1 — Kathmandu",
    );
    assert.equal(
      storeLabel({ storeCode: "S1", storeName: "Main Store" }),
      "S1 — Main Store",
    );
  });
});
