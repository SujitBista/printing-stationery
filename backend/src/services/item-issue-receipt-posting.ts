import { and, eq, inArray } from "drizzle-orm";
import type { AuthenticatedUser } from "@printing-stationery/shared";
import {
  destinationReceiptRoleLabel,
  remainingInTransitQuantity,
} from "@printing-stationery/shared";
import { getDb } from "../db/client.js";
import {
  itemIssueDiscrepancies,
  itemIssueReceiptActions,
  itemIssueReceiptLines,
  itemIssueReceipts,
  itemIssueShipmentLines,
  itemIssueShipments,
} from "../db/schema/item-issue-delivery.js";
import { itemIssues } from "../db/schema/item-issues.js";
import { itemRequests } from "../db/schema/item-requests.js";
import { stockLedger } from "../db/schema/opening-stocks.js";
import { stores } from "../db/schema/stores.js";
import { AppError } from "../utils/errors.js";
import { insertItemIssueWorkflowNotifications } from "./item-issue-notifications.js";
import { lockStoreStockForUpdate } from "./opening-stocks.service.js";
import {
  fifoAllocationsForReceiptSlice,
  stockLedgerSourceKey,
  type FifoAllocation,
} from "./stock-ledger.js";

const STALE_RECEIPT_MESSAGE = "This receipt has changed. Refresh and try again.";
const OPEN_RECEIPT_STATUSES = ["DRAFT", "PENDING_VERIFICATION", "RETURNED"] as const;

type ReceiptDb = Pick<
  ReturnType<typeof getDb>,
  "select" | "insert" | "update" | "execute"
>;

function parseQuantityToScaled(value: string): bigint {
  const trimmed = value.trim();
  if (!/^\d+(?:\.\d{1,4})?$/.test(trimmed)) {
    throw new AppError("Invalid quantity format", 400);
  }
  const [wholePart = "0", fractionPart = ""] = trimmed.split(".");
  const normalizedWhole = wholePart.replace(/^0+(?=\d)/, "") || "0";
  const normalizedFraction = fractionPart.padEnd(4, "0");
  return BigInt(normalizedWhole) * 10_000n + BigInt(normalizedFraction);
}

function scaledToQuantity(value: bigint): string {
  const sign = value < 0n ? "-" : "";
  const absolute = value < 0n ? -value : value;
  const whole = absolute / 10_000n;
  const fraction = (absolute % 10_000n).toString().padStart(4, "0");
  const trimmedFraction = fraction.replace(/0+$/, "");
  return trimmedFraction.length > 0
    ? `${sign}${whole.toString()}.${trimmedFraction}`
    : `${sign}${whole.toString()}`;
}

function actorDisplayName(actor: AuthenticatedUser): string {
  return actor.employee?.employeeName ?? actor.username;
}

function confirmationOutcome(params: {
  remainingTotal: bigint;
  damagedTotal: bigint;
  missingTotal: bigint;
}): string {
  const hadDiscrepancy = params.damagedTotal > 0n || params.missingTotal > 0n;
  if (params.remainingTotal > 0n && hadDiscrepancy) {
    return "a partial receipt with a discrepancy";
  }
  if (params.remainingTotal > 0n) {
    return "a partial receipt";
  }
  if (hadDiscrepancy) {
    return "a full receipt with a discrepancy";
  }
  return "a full receipt";
}

/**
 * Post one receipt confirmation. Caller must already have authorized the actor.
 * Shipment is locked before the receipt so concurrent confirmations cannot
 * over-receive. Any thrown error rolls back ledger, FIFO, receipt, status,
 * and notification writes in the surrounding transaction.
 */
export async function postDestinationReceiptConfirmation(
  tx: ReceiptDb,
  params: {
    receiptId: string;
    expectedVersion: number;
    actor: AuthenticatedUser;
    workflowRole: "BRANCH_MAKER" | "BRANCH_CHECKER";
    resolution: "KEEP_IN_TRANSIT" | "COMPLETE_WITH_DISCREPANCY";
    remarks: string | null;
  },
): Promise<void> {
  const receiptPreview = await tx
    .select({ shipmentId: itemIssueReceipts.shipmentId })
    .from(itemIssueReceipts)
    .where(eq(itemIssueReceipts.id, params.receiptId))
    .limit(1);
  const shipmentId = receiptPreview[0]?.shipmentId;
  if (!shipmentId) {
    throw new AppError("Receipt not found", 404);
  }

  const shipmentRows = await tx
    .select()
    .from(itemIssueShipments)
    .where(eq(itemIssueShipments.id, shipmentId))
    .for("update");
  const shipment = shipmentRows[0];
  if (!shipment) {
    throw new AppError("Shipment is not awaiting receipt.", 404);
  }

  const receiptRows = await tx
    .select()
    .from(itemIssueReceipts)
    .where(eq(itemIssueReceipts.id, params.receiptId))
    .for("update");
  const receipt = receiptRows[0];
  if (!receipt) {
    throw new AppError("Receipt not found", 404);
  }
  if (receipt.status === "CONFIRMED") {
    throw new AppError("Receipt has already been confirmed.", 409);
  }
  if (
    shipment.deliveryStatus !== "IN_TRANSIT" &&
    shipment.deliveryStatus !== "PARTIALLY_RECEIVED"
  ) {
    throw new AppError("Shipment is not awaiting receipt.", 409);
  }
  if (!(OPEN_RECEIPT_STATUSES as readonly string[]).includes(receipt.status)) {
    throw new AppError("Shipment is not awaiting receipt.", 409);
  }
  if (receipt.version !== params.expectedVersion) {
    throw new AppError(STALE_RECEIPT_MESSAGE, 409);
  }

  const issueRows = await tx
    .select()
    .from(itemIssues)
    .where(eq(itemIssues.id, shipment.itemIssueId))
    .for("update");
  const issue = issueRows[0];
  if (!issue) {
    throw new AppError("Item issue not found", 404);
  }

  await lockStoreStockForUpdate(tx, shipment.toStoreId, []);

  const receiptLines = await tx
    .select()
    .from(itemIssueReceiptLines)
    .where(eq(itemIssueReceiptLines.receiptId, params.receiptId));
  const shipmentLines = await tx
    .select()
    .from(itemIssueShipmentLines)
    .where(eq(itemIssueShipmentLines.shipmentId, shipment.id))
    .for("update");
  const shipmentLineById = new Map(shipmentLines.map((line) => [line.id, line]));

  const confirmedAt = new Date();
  const resolution = params.resolution;
  let damagedTotal = 0n;
  let missingTotal = 0n;

  for (const line of receiptLines) {
    const shipmentLine = shipmentLineById.get(line.shipmentLineId);
    if (!shipmentLine) {
      throw new AppError("Receipt quantity exceeds remaining in-transit quantity.", 409);
    }
    const received = parseQuantityToScaled(String(line.receivedQuantityNow));
    const damaged = parseQuantityToScaled(String(line.damagedQuantity ?? "0"));
    const remaining = parseQuantityToScaled(String(shipmentLine.remainingInTransitQuantity));
    if (received <= 0n || received + damaged > remaining) {
      throw new AppError("Receipt quantity exceeds remaining in-transit quantity.", 409);
    }

    const unreceived = remaining - received - damaged;
    const missingFinalized =
      resolution === "COMPLETE_WITH_DISCREPANCY" ? unreceived : 0n;
    const newlyFinalizedDiscrepancy = damaged + missingFinalized;
    const nextConfirmed =
      parseQuantityToScaled(String(shipmentLine.confirmedReceivedQuantity)) + received;
    const nextDiscrepancy =
      parseQuantityToScaled(String(shipmentLine.discrepancyQuantity)) +
      newlyFinalizedDiscrepancy;
    const nextRemaining = parseQuantityToScaled(
      remainingInTransitQuantity(
        String(shipmentLine.dispatchedQuantity),
        scaledToQuantity(nextConfirmed),
        scaledToQuantity(nextDiscrepancy),
      ),
    );
    const dispatched = parseQuantityToScaled(String(shipmentLine.dispatchedQuantity));
    if (nextConfirmed + nextRemaining + nextDiscrepancy !== dispatched) {
      throw new AppError("Receipt confirmation could not be posted.", 409);
    }

    damagedTotal += damaged;
    missingTotal += missingFinalized;

    await tx
      .update(itemIssueShipmentLines)
      .set({
        confirmedReceivedQuantity: scaledToQuantity(nextConfirmed),
        remainingInTransitQuantity: scaledToQuantity(nextRemaining),
        discrepancyQuantity: scaledToQuantity(nextDiscrepancy),
        updatedAt: confirmedAt,
      })
      .where(eq(itemIssueShipmentLines.id, shipmentLine.id));

    const dispatchLayers = await tx
      .select({
        rate: stockLedger.rate,
        quantityOut: stockLedger.quantityOut,
        amountOut: stockLedger.amountOut,
      })
      .from(stockLedger)
      .where(
        and(
          eq(stockLedger.referenceLineId, shipmentLine.itemIssueLineId),
          eq(stockLedger.movementType, "ITEM_ISSUE"),
          eq(stockLedger.stockCategory, "AVAILABLE"),
        ),
      );
    const fifoSource: FifoAllocation[] = dispatchLayers.map((layer) => ({
      rate: String(layer.rate),
      quantity: String(layer.quantityOut),
      amount: String(layer.amountOut),
    }));
    const previouslyConsumed = scaledToQuantity(
      parseQuantityToScaled(String(shipmentLine.confirmedReceivedQuantity)) +
        parseQuantityToScaled(String(shipmentLine.discrepancyQuantity)),
    );
    const receiptAllocations = fifoAllocationsForReceiptSlice({
      dispatchLayers: fifoSource,
      previouslyConsumedQuantity: previouslyConsumed,
      receivedQuantity: String(line.receivedQuantityNow),
    });

    for (const allocation of receiptAllocations) {
      await tx.insert(stockLedger).values({
        storeId: shipment.toStoreId,
        itemId: shipmentLine.itemId,
        unitId: shipmentLine.unitId,
        rate: allocation.rate,
        movementType: "ITEM_ISSUE_RECEIPT",
        stockCategory: "AVAILABLE",
        quantityIn: allocation.quantity,
        quantityOut: "0",
        amountIn: allocation.amount,
        amountOut: "0",
        transactionDate: confirmedAt,
        referenceType: "ITEM_ISSUE_RECEIPT",
        referenceId: receipt.id,
        referenceLineId: line.id,
        sourceKey: stockLedgerSourceKey({
          referenceType: "ITEM_ISSUE_RECEIPT",
          referenceLineId: line.id,
          storeId: shipment.toStoreId,
          movementType: "ITEM_ISSUE_RECEIPT",
          stockCategory: "AVAILABLE",
          rate: allocation.rate,
        }),
        postedByApplicationUserId: params.actor.id,
        postedAt: confirmedAt,
      });
    }

    const inTransitOut = received + newlyFinalizedDiscrepancy;
    if (inTransitOut > 0n) {
      await tx.insert(stockLedger).values({
        storeId: shipment.toStoreId,
        itemId: shipmentLine.itemId,
        unitId: shipmentLine.unitId,
        rate: "0",
        movementType: "ITEM_ISSUE_IN_TRANSIT",
        stockCategory: "IN_TRANSIT",
        quantityIn: "0",
        quantityOut: scaledToQuantity(inTransitOut),
        amountIn: "0",
        amountOut: "0",
        transactionDate: confirmedAt,
        referenceType: "ITEM_ISSUE_IN_TRANSIT",
        referenceId: receipt.id,
        referenceLineId: line.id,
        sourceKey: stockLedgerSourceKey({
          referenceType: "ITEM_ISSUE_IN_TRANSIT",
          referenceLineId: line.id,
          storeId: shipment.toStoreId,
          movementType: "ITEM_ISSUE_IN_TRANSIT",
          stockCategory: "IN_TRANSIT",
          rate: "0",
        }),
        postedByApplicationUserId: params.actor.id,
        postedAt: confirmedAt,
      });
    }

    if (damaged > 0n) {
      await tx.insert(stockLedger).values({
        storeId: shipment.toStoreId,
        itemId: shipmentLine.itemId,
        unitId: shipmentLine.unitId,
        rate: "0",
        movementType: "ITEM_ISSUE_DISCREPANCY",
        stockCategory: "DAMAGED",
        quantityIn: scaledToQuantity(damaged),
        quantityOut: "0",
        amountIn: "0",
        amountOut: "0",
        transactionDate: confirmedAt,
        referenceType: "ITEM_ISSUE_DISCREPANCY",
        referenceId: receipt.id,
        referenceLineId: line.id,
        sourceKey: stockLedgerSourceKey({
          referenceType: "ITEM_ISSUE_DISCREPANCY",
          referenceLineId: line.id,
          storeId: shipment.toStoreId,
          movementType: "ITEM_ISSUE_DISCREPANCY",
          stockCategory: "DAMAGED",
          rate: "0",
        }),
        postedByApplicationUserId: params.actor.id,
        postedAt: confirmedAt,
      });
    }

    if (missingFinalized > 0n) {
      const reason =
        line.discrepancyReason === "WRONG_ITEM" ||
        line.discrepancyReason === "OTHER" ||
        line.discrepancyReason === "EXCESS" ||
        line.discrepancyReason === "MISSING"
          ? line.discrepancyReason
          : "MISSING";
      await tx.insert(itemIssueDiscrepancies).values({
        shipmentLineId: shipmentLine.id,
        receiptId: receipt.id,
        itemIssueId: issue.id,
        quantity: scaledToQuantity(missingFinalized),
        reason,
        status: "OPEN",
        remarks: line.remarks,
      });
      await tx.insert(stockLedger).values({
        storeId: shipment.toStoreId,
        itemId: shipmentLine.itemId,
        unitId: shipmentLine.unitId,
        rate: "0",
        movementType: "ITEM_ISSUE_DISCREPANCY",
        stockCategory: "DISCREPANCY",
        quantityIn: scaledToQuantity(missingFinalized),
        quantityOut: "0",
        amountIn: "0",
        amountOut: "0",
        transactionDate: confirmedAt,
        referenceType: "ITEM_ISSUE_DISCREPANCY",
        referenceId: receipt.id,
        referenceLineId: line.id,
        sourceKey: stockLedgerSourceKey({
          referenceType: "ITEM_ISSUE_DISCREPANCY",
          referenceLineId: line.id,
          storeId: shipment.toStoreId,
          movementType: "ITEM_ISSUE_DISCREPANCY",
          stockCategory: "DISCREPANCY",
          rate: "0",
        }),
        postedByApplicationUserId: params.actor.id,
        postedAt: confirmedAt,
      });
    }

    shipmentLineById.set(shipmentLine.id, {
      ...shipmentLine,
      confirmedReceivedQuantity: scaledToQuantity(nextConfirmed),
      remainingInTransitQuantity: scaledToQuantity(nextRemaining),
      discrepancyQuantity: scaledToQuantity(nextDiscrepancy),
    });
  }

  const refreshed = await tx
    .select()
    .from(itemIssueShipmentLines)
    .where(eq(itemIssueShipmentLines.shipmentId, shipment.id));
  const remainingTotal = refreshed.reduce(
    (sum, line) => sum + parseQuantityToScaled(String(line.remainingInTransitQuantity)),
    0n,
  );
  const discrepancyTotal = refreshed.reduce(
    (sum, line) => sum + parseQuantityToScaled(String(line.discrepancyQuantity)),
    0n,
  );
  const nextStatus =
    remainingTotal > 0n
      ? "PARTIALLY_RECEIVED"
      : discrepancyTotal > 0n
        ? "RECEIVED_WITH_DISCREPANCY"
        : "RECEIVED";

  await tx
    .update(itemIssueShipments)
    .set({
      deliveryStatus: nextStatus,
      receivedAt: remainingTotal > 0n ? shipment.receivedAt : confirmedAt,
      updatedAt: confirmedAt,
    })
    .where(eq(itemIssueShipments.id, shipment.id));
  await tx
    .update(itemIssues)
    .set({
      deliveryStatus: nextStatus,
      updatedAt: confirmedAt,
    })
    .where(eq(itemIssues.id, issue.id));

  const confirmed = await tx
    .update(itemIssueReceipts)
    .set({
      status: "CONFIRMED",
      verifiedByApplicationUserId: params.actor.id,
      verifiedAt: confirmedAt,
      confirmedWorkflowRole: params.workflowRole,
      discrepancyResolution: resolution,
      remarks: params.remarks ?? receipt.remarks,
      version: receipt.version + 1,
      updatedAt: confirmedAt,
    })
    .where(
      and(
        eq(itemIssueReceipts.id, params.receiptId),
        inArray(itemIssueReceipts.status, [...OPEN_RECEIPT_STATUSES]),
        eq(itemIssueReceipts.version, params.expectedVersion),
      ),
    )
    .returning({ id: itemIssueReceipts.id });
  if (!confirmed[0]) {
    throw new AppError("Receipt has already been confirmed.", 409);
  }

  await tx.insert(itemIssueReceiptActions).values({
    receiptId: params.receiptId,
    action:
      resolution === "COMPLETE_WITH_DISCREPANCY"
        ? "COMPLETE_WITH_DISCREPANCY"
        : "CONFIRM",
    fromStatus: receipt.status,
    toStatus: "CONFIRMED",
    actorApplicationUserId: params.actor.id,
    actorWorkflowRole: params.workflowRole,
    remarks: params.remarks,
  });

  const toStoreName = (
    await tx
      .select({ storeName: stores.storeName })
      .from(stores)
      .where(eq(stores.id, shipment.toStoreId))
      .limit(1)
  )[0]?.storeName;
  const requestNumber = issue.requestId
    ? (
        await tx
          .select({ requestNumber: itemRequests.requestNumber })
          .from(itemRequests)
          .where(eq(itemRequests.id, issue.requestId))
          .limit(1)
      )[0]?.requestNumber ?? ""
    : "";
  const roleLabel = destinationReceiptRoleLabel(params.workflowRole);
  const outcome = confirmationOutcome({
    remainingTotal,
    damagedTotal,
    missingTotal,
  });
  const customMessage = `${actorDisplayName(params.actor)} (${roleLabel}) at ${toStoreName ?? "the destination store"} confirmed ${outcome} of issue ${issue.issueNumber}.`;
  const dispatchRecipientIds = [
    issue.verifiedByApplicationUserId,
    issue.createdByApplicationUserId,
  ].filter((id): id is string => Boolean(id));

  await insertItemIssueWorkflowNotifications(tx, {
    type:
      damagedTotal > 0n || missingTotal > 0n || nextStatus === "RECEIVED_WITH_DISCREPANCY"
        ? "ITEM_ISSUE_DISCREPANCY_REPORTED"
        : "ITEM_ISSUE_RECEIPT_CONFIRMED",
    issueId: issue.id,
    issueNumber: issue.issueNumber,
    requestNumber,
    actorUserId: params.actor.id,
    actorName: actorDisplayName(params.actor),
    remarks: params.remarks,
    createdByApplicationUserId: issue.createdByApplicationUserId,
    corporateCheckerApplicationUserId: issue.verifiedByApplicationUserId,
    branchMakerApplicationUserId: null,
    branchCheckerApplicationUserId: null,
    extraRecipientIds: dispatchRecipientIds,
    customMessage,
  });
}
