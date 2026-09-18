import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canAccessOrganizationSetup,
  canAccessPurchases,
  canAccessStockBalance,
  canMutateMasterData,
  canMutatePurchases,
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

describe("purchase access", () => {
  it("lets inventory operators open purchase records", () => {
    assert.equal(canAccessPurchases(userWithRoles(["ADMIN"])), true);
    assert.equal(canAccessPurchases(userWithRoles(["MAKER"])), true);
    assert.equal(canAccessPurchases(userWithRoles(["CHECKER"])), true);
    assert.equal(canAccessPurchases(userWithRoles(["HR"])), false);
    assert.equal(canMutatePurchases(userWithRoles(["CHECKER"])), false);
    assert.equal(canMutatePurchases(userWithRoles(["MAKER"])), true);
  });
});

describe("stock balance access", () => {
  it("lets inventory operators view stock balances and excludes HR", () => {
    assert.equal(canAccessStockBalance(userWithRoles(["ADMIN"])), true);
    assert.equal(canAccessStockBalance(userWithRoles(["MAKER"])), true);
    assert.equal(canAccessStockBalance(userWithRoles(["CHECKER"])), true);
    assert.equal(canAccessStockBalance(userWithRoles(["HR"])), false);
    assert.equal(canAccessStockBalance(null), false);
  });
});
