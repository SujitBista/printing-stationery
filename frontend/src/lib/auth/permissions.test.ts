import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canAccessOrganizationSetup,
  canMutateMasterData,
  canReadMasterData,
} from "./permissions.js";

function userWithRoles(
  roles: Array<"ADMIN" | "HR" | "MAKER" | "CHECKER">,
) {
  return { roles } as never;
}

describe("organization setup access", () => {
  it("allows only ADMIN to open organization setup", () => {
    assert.equal(canAccessOrganizationSetup(userWithRoles(["ADMIN"])), true);
    assert.equal(canAccessOrganizationSetup(userWithRoles(["MAKER"])), false);
    assert.equal(canAccessOrganizationSetup(userWithRoles(["CHECKER"])), false);
    assert.equal(canAccessOrganizationSetup(userWithRoles(["HR"])), false);
    assert.equal(canAccessOrganizationSetup(null), false);
  });

  it("does not treat branch maker or checker as able to set up organization", () => {
    assert.equal(canMutateMasterData(userWithRoles(["MAKER"])), false);
    assert.equal(canMutateMasterData(userWithRoles(["CHECKER"])), false);
    assert.equal(canMutateMasterData(userWithRoles(["ADMIN"])), true);
  });

  it("still lets makers and checkers read master data for operational screens", () => {
    assert.equal(canReadMasterData(userWithRoles(["MAKER"])), true);
    assert.equal(canReadMasterData(userWithRoles(["CHECKER"])), true);
    assert.equal(canReadMasterData(userWithRoles(["ADMIN"])), true);
    assert.equal(canReadMasterData(userWithRoles(["HR"])), false);
  });
});
