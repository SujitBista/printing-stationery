import {
  userHasAnyRole,
  userHasRole,
  type AppRole,
  type AuthenticatedUser,
} from "@printing-stationery/shared";

export function isAdmin(user: AuthenticatedUser | null | undefined): boolean {
  if (!user) {
    return false;
  }
  return userHasRole(user.roles, "ADMIN");
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
  return isAdmin(user);
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
