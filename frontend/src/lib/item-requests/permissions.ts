import {
  userHasRole,
  type AuthenticatedUser,
} from "@printing-stationery/shared";

/**
 * Branch makers create item requests. Checkers recommend, review, or approve
 * instead and should never be prompted to create.
 */
export function canCreateItemRequests(
  user: AuthenticatedUser | null | undefined,
): boolean {
  if (!user) {
    return false;
  }
  return userHasRole(user.roles, "MAKER");
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
