import {
  itemRequestWorkflowCanCreate,
  itemRequestWorkflowIsCorporateMaker,
  userHasRole,
  userIsOrganizationHead,
  type AuthenticatedUser,
  type ItemRequestQueue,
  type ItemRequestWorkflowRole,
} from "@printing-stationery/shared";

/**
 * Branch makers and the Corporate Checker can open the create form. Corporate
 * Maker reviews branch requests and must not create them. Backend `canCreate`
 * remains the authorization source for whether a request can actually be saved.
 */
export function canCreateItemRequests(
  user: AuthenticatedUser | null | undefined,
  workflowRoles: readonly ItemRequestWorkflowRole[] = [],
): boolean {
  if (!user) {
    return false;
  }
  if (itemRequestWorkflowIsCorporateMaker(workflowRoles)) {
    return false;
  }
  if (itemRequestWorkflowCanCreate(workflowRoles)) {
    return true;
  }
  return userIsOrganizationHead(user) || userHasRole(user.roles, "MAKER");
}

export function canSelectRequestedByEmployee(
  user: AuthenticatedUser | null | undefined,
): boolean {
  return userIsOrganizationHead(user);
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
  workflowRoles?: readonly ItemRequestWorkflowRole[];
}): boolean {
  return (
    params.queueShowsCreate &&
    params.canCreate &&
    canCreateItemRequests(params.user, params.workflowRoles)
  );
}

export function shouldShowItemRequestCreateAssignmentWarning(params: {
  queueShowsCreate: boolean;
  canCreate: boolean;
  isOrganizationHead: boolean;
  user: AuthenticatedUser | null | undefined;
  workflowRoles?: readonly ItemRequestWorkflowRole[];
}): boolean {
  const workflowRoles = params.workflowRoles ?? [];
  if (itemRequestWorkflowIsCorporateMaker(workflowRoles)) {
    return false;
  }
  return (
    params.queueShowsCreate &&
    !params.canCreate &&
    !params.isOrganizationHead &&
    canCreateItemRequests(params.user, workflowRoles)
  );
}

export function shouldShowItemRequestCorporateMakerCreateNote(params: {
  queue: ItemRequestQueue;
  workflowRoles: readonly ItemRequestWorkflowRole[];
}): boolean {
  return (
    params.queue === "request-list" &&
    itemRequestWorkflowIsCorporateMaker(params.workflowRoles)
  );
}
