import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  INACTIVE_REQUESTED_BY_MESSAGE,
  REQUESTED_BY_REQUIRED_MESSAGE,
  UNAUTHORIZED_REQUESTED_BY_MESSAGE,
  UNLINKED_EMPLOYEE_MESSAGE,
  canSelectRequestedByEmployee,
  resolveRequestedByEmployeeId,
  toRequestedByEmployeeSummary,
} from "./item-request-requested-by.js";

const ADMIN_EMPLOYEE_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_EMPLOYEE_ID = "22222222-2222-4222-8222-222222222222";

function actor(params: {
  roles: Array<"ADMIN" | "MAKER" | "CHECKER" | "HR">;
  employeeId?: string | null;
}) {
  return {
    roles: params.roles,
    employee:
      params.employeeId === undefined || params.employeeId === null
        ? null
        : {
            id: params.employeeId,
            employeeCode: "247",
            employeeName: "Mukesh Soni",
            branch: {
              id: "33333333-3333-4333-8333-333333333333",
              branchCode: "HO",
              branchName: "Head Office",
            },
          },
  };
}

describe("item request requested by authorization", () => {
  it("lets an admin select another employee", () => {
    const admin = actor({ roles: ["ADMIN"], employeeId: ADMIN_EMPLOYEE_ID });
    assert.equal(canSelectRequestedByEmployee(admin), true);
    assert.deepEqual(
      resolveRequestedByEmployeeId({
        actor: admin,
        requestedByEmployeeId: OTHER_EMPLOYEE_ID,
      }),
      { ok: true, employeeId: OTHER_EMPLOYEE_ID },
    );
  });

  it("requires an admin to provide Requested By", () => {
    const admin = actor({ roles: ["ADMIN"], employeeId: ADMIN_EMPLOYEE_ID });
    assert.deepEqual(
      resolveRequestedByEmployeeId({
        actor: admin,
        requestedByEmployeeId: undefined,
      }),
      { ok: false, status: 400, message: REQUESTED_BY_REQUIRED_MESSAGE },
    );
  });

  it("lets an admin without a linked employee still select another employee", () => {
    const admin = actor({ roles: ["ADMIN"], employeeId: null });
    assert.deepEqual(
      resolveRequestedByEmployeeId({
        actor: admin,
        requestedByEmployeeId: OTHER_EMPLOYEE_ID,
      }),
      { ok: true, employeeId: OTHER_EMPLOYEE_ID },
    );
  });

  it("forces a maker to their linked employee", () => {
    const maker = actor({ roles: ["MAKER"], employeeId: ADMIN_EMPLOYEE_ID });
    assert.equal(canSelectRequestedByEmployee(maker), false);
    assert.deepEqual(
      resolveRequestedByEmployeeId({
        actor: maker,
        requestedByEmployeeId: ADMIN_EMPLOYEE_ID,
      }),
      { ok: true, employeeId: ADMIN_EMPLOYEE_ID },
    );
  });

  it("rejects a maker submitting another employee id", () => {
    const maker = actor({ roles: ["MAKER"], employeeId: ADMIN_EMPLOYEE_ID });
    assert.deepEqual(
      resolveRequestedByEmployeeId({
        actor: maker,
        requestedByEmployeeId: OTHER_EMPLOYEE_ID,
      }),
      { ok: false, status: 403, message: UNAUTHORIZED_REQUESTED_BY_MESSAGE },
    );
  });

  it("rejects a maker whose account is not linked to an employee", () => {
    const maker = actor({ roles: ["MAKER"], employeeId: null });
    assert.deepEqual(
      resolveRequestedByEmployeeId({
        actor: maker,
        requestedByEmployeeId: OTHER_EMPLOYEE_ID,
      }),
      { ok: false, status: 400, message: UNLINKED_EMPLOYEE_MESSAGE },
    );
  });

  it("maps department as null because employees are not assigned to departments", () => {
    const summary = toRequestedByEmployeeSummary(
      {
        id: OTHER_EMPLOYEE_ID,
        employeeCode: "368",
        employeeName: "Anjani Chaudhary",
        isActive: true,
      },
      {
        id: "44444444-4444-4444-8444-444444444444",
        branchCode: "TNK",
        branchName: "Tankisinwari",
        isActive: true,
      },
    );
    assert.equal(summary?.department, null);
    assert.equal(INACTIVE_REQUESTED_BY_MESSAGE.length > 0, true);
  });
});
