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
 * Remaining in-transit quantity is dispatched minus confirmed usable receipts
 * minus discrepancies that have been finalized.
 *
 * A discrepancy is finalized only when the receipt is confirmed and the
 * shipment is explicitly completed with discrepancy. Pending, returned,
 * rejected, or reported-but-unverified discrepancies must not be included in
 * `finalizedDiscrepancyQuantity`.
 *
 * Invariant for every shipment line:
 * dispatched = confirmed usable received + remaining in transit + finalized discrepancy.
 */
export function remainingInTransitQuantity(
  dispatchedQuantity: string,
  confirmedUsableReceivedQuantity: string,
  finalizedDiscrepancyQuantity = "0",
): string {
  return remainingNonNegativeDecimalString(
    dispatchedQuantity,
    sumDecimalStrings([
      confirmedUsableReceivedQuantity,
      finalizedDiscrepancyQuantity,
    ]),
  );
}

/**
 * Client-side guard before Confirm Receipt. The backend repeats this check
 * inside the posting transaction.
 */
export function destinationReceiptQuantityError(params: {
  lines: Array<{
    receivedQuantityNow: string;
    damagedQuantity?: string;
    remainingInTransitQuantity: string;
  }>;
}): string | null {
  const active = params.lines.filter((line) =>
    /[1-9]/.test(line.receivedQuantityNow.trim()),
  );
  if (active.length === 0) {
    return "Enter a received quantity greater than zero.";
  }
  for (const line of active) {
    const received = Number(line.receivedQuantityNow);
    const damaged = Number(line.damagedQuantity?.trim() || "0");
    const remaining = Number(line.remainingInTransitQuantity);
    if (
      !Number.isFinite(received) ||
      !Number.isFinite(damaged) ||
      !Number.isFinite(remaining) ||
      received < 0 ||
      damaged < 0
    ) {
      return "Quantities must be zero or greater.";
    }
    if (received + damaged > remaining + 0.0000001) {
      return "Receipt quantity exceeds remaining in-transit quantity.";
    }
  }
  return null;
}

export function shipmentLineQuantityBalance(params: {
  dispatchedQuantity: string;
  confirmedUsableReceivedQuantity: string;
  remainingInTransitQuantity: string;
  finalizedDiscrepancyQuantity: string;
}): string {
  return sumDecimalStrings([
    params.confirmedUsableReceivedQuantity,
    params.remainingInTransitQuantity,
    params.finalizedDiscrepancyQuantity,
  ]);
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
