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

export function isItemIssueAccessDenied(status: number | undefined): boolean {
  return status === 401 || status === 403;
}
