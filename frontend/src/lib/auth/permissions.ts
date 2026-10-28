import {
  userHasAnyRole,
  userHasRole,
  userIsOrganizationHead,
  type AppRole,
  type AuthenticatedUser,
} from "@printing-stationery/shared";

export function isAdmin(user: AuthenticatedUser | null | undefined): boolean {
  if (!user) {
    return false;
  }
  return userHasRole(user.roles, "ADMIN");
}

/** Corporate Checker, or an existing ADMIN role, administers organization data. */
export function isOrganizationHead(
  user: AuthenticatedUser | null | undefined,
): boolean {
  return userIsOrganizationHead(user);
}

export function canReadMasterData(
  user: AuthenticatedUser | null | undefined,
): boolean {
  if (!user) {
    return false;
  }
  return userHasAnyRole(user.roles, ["ADMIN", "MAKER", "CHECKER"]);
}

export function canMutateMasterData(
  user: AuthenticatedUser | null | undefined,
): boolean {
  return isOrganizationHead(user);
}

export function canAccessOrganizationSetup(
  user: AuthenticatedUser | null | undefined,
): boolean {
  return isOrganizationHead(user);
}

export function canManageApplicationUsers(
  user: AuthenticatedUser | null | undefined,
): boolean {
  return isOrganizationHead(user);
}

export function canManageStoreUsers(
  user: AuthenticatedUser | null | undefined,
): boolean {
  return isOrganizationHead(user);
}

export function canAccessItemRequests(
  user: AuthenticatedUser | null | undefined,
): boolean {
  if (!user) {
    return false;
  }
  return userHasAnyRole(user.roles, ["ADMIN", "MAKER", "CHECKER"]);
}

export function canAccessOpeningStock(
  user: AuthenticatedUser | null | undefined,
): boolean {
  return isOrganizationHead(user);
}

export function canAccessStockBalance(
  user: AuthenticatedUser | null | undefined,
): boolean {
  if (!user) {
    return false;
  }
  return userHasAnyRole(user.roles, ["ADMIN", "MAKER", "CHECKER"]);
}

export function canAccessPurchases(
  user: AuthenticatedUser | null | undefined,
): boolean {
  if (!user) {
    return false;
  }
  return userHasAnyRole(user.roles, ["ADMIN", "MAKER", "CHECKER"]);
}

export function canMutatePurchases(
  user: AuthenticatedUser | null | undefined,
): boolean {
  if (!user) {
    return false;
  }
  return isOrganizationHead(user) || userHasRole(user.roles, "MAKER");
}

export function hasRole(
  user: AuthenticatedUser | null | undefined,
  role: AppRole,
): boolean {
  if (!user) {
    return false;
  }
  return userHasRole(user.roles, role);
}
