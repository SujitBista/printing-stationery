import {
  requestStatusAllowsItemIssue,
  userHasRole,
  type AuthenticatedUser,
  type ItemRequestStatus,
} from "@printing-stationery/shared";

export const ITEM_ISSUE_OPERATOR_FORBIDDEN_MESSAGE =
  "Only a maker assigned to the supplying store can create this item issue.";

export const ADMIN_ITEM_ISSUE_OPERATOR_FORBIDDEN_MESSAGE =
  "Administrators cannot create or submit item issues.";

export const ITEM_ISSUE_CHECKER_CREATE_FORBIDDEN_MESSAGE =
  "Checkers cannot create or edit item issues.";

export const ITEM_ISSUE_VERIFIER_FORBIDDEN_MESSAGE =
  "Only a checker assigned to the supplying store can verify this item issue.";

export const ADMIN_ITEM_ISSUE_VERIFIER_FORBIDDEN_MESSAGE =
  "Administrators cannot verify, return, or reject item issues.";

export const ITEM_ISSUE_SELF_VERIFY_FORBIDDEN_MESSAGE =
  "You cannot verify an item issue that you created.";

export const ITEM_ISSUE_DESTINATION_FORBIDDEN_MESSAGE =
  "You are not assigned to the destination store.";

export const ITEM_ISSUE_RECEIPT_SELF_VERIFY_FORBIDDEN_MESSAGE =
  "You cannot verify your own transaction.";

export const ADMIN_ITEM_ISSUE_RECEIPT_FORBIDDEN_MESSAGE =
  "Administrators cannot confirm item issue receipts.";

export const ITEM_ISSUE_RECEIPT_RETURN_RETIRED_MESSAGE =
  "Receipt confirmation no longer uses return for verification.";

export const ITEM_ISSUE_MAKER_CHECKER_FORBIDDEN_MESSAGE =
  "Maker cannot perform the Checker action.";

export const INELIGIBLE_SUPPLYING_STORE_MESSAGE =
  "The supplying store is not allowed to transfer or issue stock.";

/** @deprecated Use INELIGIBLE_SUPPLYING_STORE_MESSAGE. Kept for existing callers. */
export const NON_CORPORATE_SUPPLYING_STORE_MESSAGE =
  INELIGIBLE_SUPPLYING_STORE_MESSAGE;

export function isCorporateSupplyingStore(params: {
  underStoreId: string | null;
  branchType: string;
}): boolean {
  return params.branchType === "HEAD_OFFICE" && params.underStoreId === null;
}

/**
 * A store may supply stock when it is active and either allows transfers
 * or is the historical corporate/HO root store.
 */
export function isEligibleSupplyingStore(params: {
  isActive: boolean;
  allowTransfer: boolean;
  underStoreId: string | null;
  branchType: string;
}): boolean {
  if (!params.isActive) {
    return false;
  }
  return params.allowTransfer || isCorporateSupplyingStore(params);
}

export function actorMayCreateItemIssue(params: {
  actor: Pick<AuthenticatedUser, "roles">;
  supplyingStoreId: string;
  makerStoreIds: readonly string[];
}): boolean {
  if (userHasRole(params.actor.roles, "ADMIN")) {
    return false;
  }
  if (userHasRole(params.actor.roles, "CHECKER") && !userHasRole(params.actor.roles, "MAKER")) {
    return false;
  }
  if (!userHasRole(params.actor.roles, "MAKER")) {
    return false;
  }
  return params.makerStoreIds.includes(params.supplyingStoreId);
}

export function actorMayVerifyItemIssue(params: {
  actor: Pick<AuthenticatedUser, "roles">;
  supplyingStoreId: string;
  supervisedStoreIds: readonly string[];
  createdByApplicationUserId?: string;
  actorUserId?: string;
}): boolean {
  if (userHasRole(params.actor.roles, "ADMIN")) {
    return false;
  }
  if (!userHasRole(params.actor.roles, "CHECKER")) {
    return false;
  }
  if (
    params.createdByApplicationUserId &&
    params.actorUserId &&
    params.createdByApplicationUserId === params.actorUserId
  ) {
    return false;
  }
  return params.supervisedStoreIds.includes(params.supplyingStoreId);
}

/** @deprecated Use actorMayCreateItemIssue. */
export function actorMayOperateItemIssue(params: {
  actor: Pick<AuthenticatedUser, "roles">;
  supplyingStoreId: string;
  supervisedStoreIds: readonly string[];
}): boolean {
  return actorMayCreateItemIssue({
    actor: params.actor,
    supplyingStoreId: params.supplyingStoreId,
    makerStoreIds: params.supervisedStoreIds,
  });
}

/**
 * Destination-store receipt confirmation. Admin stays view-only.
 * Either the active Maker or the active Checker assigned to the exact
 * destination store may confirm. There is no separate verifier.
 */
export function actorMayConfirmDestinationReceipt(params: {
  actor: Pick<AuthenticatedUser, "roles">;
  destinationStoreId: string;
  makerStoreIds: readonly string[];
  checkerStoreIds: readonly string[];
}): boolean {
  if (userHasRole(params.actor.roles, "ADMIN")) {
    return false;
  }
  return (
    params.makerStoreIds.includes(params.destinationStoreId) ||
    params.checkerStoreIds.includes(params.destinationStoreId)
  );
}

export function requestAllowsItemIssueCreation(params: {
  requestStatus: string;
  supplyingStoreId: string | null | undefined;
  supplyingStore: {
    id: string;
    isActive: boolean;
    allowTransfer: boolean;
    underStoreId: string | null;
    branchType: string;
  } | null;
}): boolean {
  if (
    !requestStatusAllowsItemIssue(params.requestStatus as ItemRequestStatus)
  ) {
    return false;
  }
  if (!params.supplyingStoreId || !params.supplyingStore) {
    return false;
  }
  if (params.supplyingStoreId !== params.supplyingStore.id) {
    return false;
  }
  return isEligibleSupplyingStore(params.supplyingStore);
}
