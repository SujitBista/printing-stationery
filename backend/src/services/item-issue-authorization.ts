import { userHasRole, type AuthenticatedUser } from "@printing-stationery/shared";

export const ITEM_ISSUE_OPERATOR_FORBIDDEN_MESSAGE =
  "Only a checker assigned to the supplying store can create this item issue.";

export const ADMIN_ITEM_ISSUE_OPERATOR_FORBIDDEN_MESSAGE =
  "Administrators cannot create or submit item issues.";

export const NON_CORPORATE_SUPPLYING_STORE_MESSAGE =
  "An item issue can be created only from a request supplied by the corporate store.";

export function isCorporateSupplyingStore(params: {
  underStoreId: string | null;
  branchType: string;
}): boolean {
  return params.branchType === "HEAD_OFFICE" && params.underStoreId === null;
}

export function actorMayOperateItemIssue(params: {
  actor: Pick<AuthenticatedUser, "roles">;
  supplyingStoreId: string;
  supervisedStoreIds: readonly string[];
}): boolean {
  if (userHasRole(params.actor.roles, "ADMIN")) {
    return false;
  }
  if (!userHasRole(params.actor.roles, "CHECKER")) {
    return false;
  }
  return params.supervisedStoreIds.includes(params.supplyingStoreId);
}

export function requestAllowsItemIssueCreation(params: {
  requestStatus: string;
  supplyingStoreId: string | null | undefined;
  supplyingStore: {
    id: string;
    underStoreId: string | null;
    branchType: string;
  } | null;
}): boolean {
  if (params.requestStatus !== "APPROVED") {
    return false;
  }
  if (!params.supplyingStoreId || !params.supplyingStore) {
    return false;
  }
  if (params.supplyingStoreId !== params.supplyingStore.id) {
    return false;
  }
  return isCorporateSupplyingStore(params.supplyingStore);
}
