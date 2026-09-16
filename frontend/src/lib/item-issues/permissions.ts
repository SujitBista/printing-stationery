import {
  ITEM_REQUEST_ISSUE_ACTION_LABELS,
  itemRequestIssueActionHref,
  resolveItemRequestIssueAction,
  type ItemRequestActiveIssueSummary,
  type ItemRequestIssueActionKind,
  type ItemRequestStatus,
} from "@printing-stationery/shared";

export function shouldShowCreateItemIssueButton(params: {
  requestCanCreateIssue: boolean;
  eligibilityOk: boolean;
  eligibilityCanCreate: boolean;
}): boolean {
  return (
    params.requestCanCreateIssue &&
    params.eligibilityOk &&
    params.eligibilityCanCreate
  );
}

export function resolveVisibleItemRequestIssueAction(params: {
  canCreateNewIssue: boolean;
  requestStatus: ItemRequestStatus;
  activeIssue: ItemRequestActiveIssueSummary | null;
}): ItemRequestIssueActionKind | null {
  return resolveItemRequestIssueAction(params);
}

export function getItemRequestIssueActionLabel(
  action: ItemRequestIssueActionKind,
): string {
  return ITEM_REQUEST_ISSUE_ACTION_LABELS[action];
}

export function getItemRequestIssueActionHref(params: {
  requestId: string;
  action: ItemRequestIssueActionKind;
  activeIssueId?: string | null;
}): string {
  return itemRequestIssueActionHref(params);
}

export function isItemIssueAccessDenied(status: number | undefined): boolean {
  return status === 401 || status === 403;
}
