import {
  userHasRole,
  type AuthenticatedUser,
} from "@printing-stationery/shared";

/**
 * Admins and branch makers can open the create form. Backend `canCreate`
 * is the authorization source for whether a request can actually be saved.
 */
export function canCreateItemRequests(
  user: AuthenticatedUser | null | undefined,
): boolean {
  if (!user) {
    return false;
  }
  return (
    userHasRole(user.roles, "ADMIN") || userHasRole(user.roles, "MAKER")
  );
}

export function canSelectRequestedByEmployee(
  user: AuthenticatedUser | null | undefined,
): boolean {
  return Boolean(user && userHasRole(user.roles, "ADMIN"));
}

export function defaultRequestedByEmployeeId(params: {
  user: AuthenticatedUser | null | undefined;
  contextEmployeeId?: string | null;
}): string {
  return params.contextEmployeeId ?? params.user?.employee?.id ?? "";
}

export function shouldShowItemRequestCreateAction(params: {
  queueShowsCreate: boolean;
  canCreate: boolean;
  user: AuthenticatedUser | null | undefined;
}): boolean {
  return (
    params.queueShowsCreate &&
    params.canCreate &&
    canCreateItemRequests(params.user)
  );
}

export function shouldShowItemRequestCreateAssignmentWarning(params: {
  queueShowsCreate: boolean;
  canCreate: boolean;
  isAdmin: boolean;
  user: AuthenticatedUser | null | undefined;
}): boolean {
  return (
    params.queueShowsCreate &&
    !params.canCreate &&
    !params.isAdmin &&
    canCreateItemRequests(params.user)
  );
}
