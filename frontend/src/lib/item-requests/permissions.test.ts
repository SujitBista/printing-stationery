import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canCreateItemRequests,
  shouldShowItemRequestCreateAction,
  shouldShowItemRequestCreateAssignmentWarning,
} from "./permissions.js";

function userWithRoles(
  roles: Array<"ADMIN" | "HR" | "MAKER" | "CHECKER">,
) {
  return { roles } as never;
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

  it("does not show the assignment warning to admins", () => {
    const admin = userWithRoles(["ADMIN"]);

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
});
