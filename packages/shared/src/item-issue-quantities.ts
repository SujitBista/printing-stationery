import {
  remainingNonNegativeDecimalString,
  sumDecimalStrings,
} from "./decimal-amount.js";

/**
 * Remaining Qty = Requested Qty − Total Posted Issue Qty.
 * Draft, submitted, and returned issue quantities are not posted and must not
 * be included in `totalPostedIssueQuantity`.
 */
export function remainingRequestedQuantity(
  requestedQuantity: string,
  totalPostedIssueQuantity: string,
): string {
  return remainingNonNegativeDecimalString(
    requestedQuantity,
    totalPostedIssueQuantity,
  );
}

/**
 * Remaining in-transit quantity is dispatched minus confirmed usable receipts.
 * Pending, returned, rejected, or unverified receipts must not be included in
 * `totalConfirmedReceivedQuantity`.
 */
export function remainingInTransitQuantity(
  dispatchedQuantity: string,
  totalConfirmedReceivedQuantity: string,
): string {
  return remainingNonNegativeDecimalString(
    dispatchedQuantity,
    totalConfirmedReceivedQuantity,
  );
}

export type ItemIssueLineQuantities = {
  requestedQuantity: string;
  previouslyIssuedQuantity: string;
  thisIssueQuantity: string;
  outstandingBeforeThisIssue: string;
  remainingAfterIssue: string | null;
  remainingQuantity: string;
  postedIssuedQuantity: string;
};

/**
 * Issue-line quantities for display and request remaining.
 *
 * - Previously Issued Qty includes earlier posted issues only.
 * - Remaining After Issue is set only when the current issue is posted:
 *   Requested − Previously Posted − Current Posted Issue Qty.
 * - Remaining Qty is always Requested − Total Posted Issue Qty. A draft,
 *   submitted, or returned current issue does not reduce it.
 */
export function itemIssueLineQuantities(params: {
  requestedQuantity: string;
  previouslyIssuedQuantity: string;
  thisIssueQuantity: string;
  currentIssuePosted: boolean;
}): ItemIssueLineQuantities {
  const thisIssueQuantity = params.thisIssueQuantity.trim() || "0";
  const outstandingBeforeThisIssue = remainingRequestedQuantity(
    params.requestedQuantity,
    params.previouslyIssuedQuantity,
  );
  const postedIssuedQuantity = params.currentIssuePosted
    ? sumDecimalStrings([params.previouslyIssuedQuantity, thisIssueQuantity])
    : params.previouslyIssuedQuantity;
  const remainingQuantity = remainingRequestedQuantity(
    params.requestedQuantity,
    postedIssuedQuantity,
  );

  return {
    requestedQuantity: params.requestedQuantity,
    previouslyIssuedQuantity: params.previouslyIssuedQuantity,
    thisIssueQuantity,
    outstandingBeforeThisIssue,
    remainingAfterIssue: params.currentIssuePosted ? remainingQuantity : null,
    remainingQuantity,
    postedIssuedQuantity,
  };
}
