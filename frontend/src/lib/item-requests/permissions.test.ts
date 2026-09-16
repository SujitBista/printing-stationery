import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canCreateItemRequests,
  canSelectRequestedByEmployee,
  defaultRequestedByEmployeeId,
  shouldShowItemRequestCorporateMakerCreateNote,
  shouldShowItemRequestCreateAction,
  shouldShowItemRequestCreateAssignmentWarning,
} from "./permissions.js";

function userWithRoles(
  roles: Array<"ADMIN" | "HR" | "MAKER" | "CHECKER">,
  employeeId?: string,
) {
  return {
    roles,
    employee: employeeId
      ? {
          id: employeeId,
          employeeCode: "247",
          employeeName: "Mukesh Soni",
          branch: {
            id: "11111111-1111-4111-8111-111111111111",
            branchCode: "HO",
            branchName: "Head Office",
          },
        }
      : null,
  } as never;
}

describe("item request create role visibility", () => {
  it("allows MAKER to create requests and shows the assignment warning when they cannot yet", () => {
    const maker = userWithRoles(["MAKER"]);

    assert.equal(canCreateItemRequests(maker), true);
    assert.equal(
      shouldShowItemRequestCreateAction({
        queueShowsCreate: true,
        canCreate: true,
        user: maker,
      }),
      true,
    );
    assert.equal(
      shouldShowItemRequestCreateAssignmentWarning({
        queueShowsCreate: true,
        canCreate: false,
        isAdmin: false,
        user: maker,
      }),
      true,
    );
  });

  it("hides New Request and the assignment warning from CHECKER users", () => {
    const checker = userWithRoles(["CHECKER"]);

    assert.equal(canCreateItemRequests(checker), false);
    assert.equal(
      shouldShowItemRequestCreateAction({
        queueShowsCreate: true,
        canCreate: false,
        user: checker,
      }),
      false,
    );
    assert.equal(
      shouldShowItemRequestCreateAction({
        queueShowsCreate: true,
        canCreate: true,
        user: checker,
      }),
      false,
    );
    assert.equal(
      shouldShowItemRequestCreateAssignmentWarning({
        queueShowsCreate: true,
        canCreate: false,
        isAdmin: false,
        user: checker,
      }),
      false,
    );
  });

  it("does not show the assignment warning to admins and shows New Request when they can create", () => {
    const admin = userWithRoles(["ADMIN"]);

    assert.equal(canCreateItemRequests(admin), true);
    assert.equal(
      shouldShowItemRequestCreateAssignmentWarning({
        queueShowsCreate: true,
        canCreate: false,
        isAdmin: true,
        user: admin,
      }),
      false,
    );
    assert.equal(
      shouldShowItemRequestCreateAction({
        queueShowsCreate: true,
        canCreate: false,
        user: admin,
      }),
      false,
    );
    assert.equal(
      shouldShowItemRequestCreateAction({
        queueShowsCreate: true,
        canCreate: true,
        user: admin,
      }),
      true,
    );
  });

  it("still treats a MAKER+CHECKER user as allowed to create", () => {
    const makerAndChecker = userWithRoles(["MAKER", "CHECKER"]);

    assert.equal(canCreateItemRequests(makerAndChecker), true);
    assert.equal(
      shouldShowItemRequestCreateAssignmentWarning({
        queueShowsCreate: true,
        canCreate: false,
        isAdmin: false,
        user: makerAndChecker,
      }),
      true,
    );
  });

  it("hides create on queues that are not the maker request list", () => {
    const maker = userWithRoles(["MAKER"]);

    assert.equal(
      shouldShowItemRequestCreateAction({
        queueShowsCreate: false,
        canCreate: true,
        user: maker,
      }),
      false,
    );
    assert.equal(
      shouldShowItemRequestCreateAssignmentWarning({
        queueShowsCreate: false,
        canCreate: false,
        isAdmin: false,
        user: maker,
      }),
      false,
    );
  });

  it("hides New Request and the assignment warning from Corporate Maker", () => {
    const maker = userWithRoles(["MAKER"]);

    assert.equal(canCreateItemRequests(maker, ["CORPORATE_MAKER"]), false);
    assert.equal(
      shouldShowItemRequestCreateAction({
        queueShowsCreate: true,
        canCreate: false,
        user: maker,
        workflowRoles: ["CORPORATE_MAKER"],
      }),
      false,
    );
    assert.equal(
      shouldShowItemRequestCreateAction({
        queueShowsCreate: true,
        canCreate: true,
        user: maker,
        workflowRoles: ["CORPORATE_MAKER"],
      }),
      false,
    );
    assert.equal(
      shouldShowItemRequestCreateAssignmentWarning({
        queueShowsCreate: true,
        canCreate: false,
        isAdmin: false,
        user: maker,
        workflowRoles: ["CORPORATE_MAKER"],
      }),
      false,
    );
    assert.equal(
      shouldShowItemRequestCorporateMakerCreateNote({
        queue: "request-list",
        workflowRoles: ["CORPORATE_MAKER"],
      }),
      true,
    );
    assert.equal(
      shouldShowItemRequestCorporateMakerCreateNote({
        queue: "review",
        workflowRoles: ["CORPORATE_MAKER"],
      }),
      false,
    );
  });
});

describe("item request requested by defaults", () => {
  it("defaults Requested By to the logged-in Admin's linked employee, not the Admin role", () => {
    const adminEmployeeId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const admin = userWithRoles(["ADMIN"], adminEmployeeId);

    assert.equal(canSelectRequestedByEmployee(admin), true);
    assert.equal(
      defaultRequestedByEmployeeId({
        user: admin,
        contextEmployeeId: adminEmployeeId,
      }),
      adminEmployeeId,
    );
  });

  it("keeps Requested By read-only for a normal maker using their own employee", () => {
    const makerEmployeeId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const maker = userWithRoles(["MAKER"], makerEmployeeId);

    assert.equal(canSelectRequestedByEmployee(maker), false);
    assert.equal(
      defaultRequestedByEmployeeId({
        user: maker,
        contextEmployeeId: makerEmployeeId,
      }),
      makerEmployeeId,
    );
  });
});
