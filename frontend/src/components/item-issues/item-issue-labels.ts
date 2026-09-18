import type {
  ItemIssueDeliveryStatus,
  ItemIssueDestinationType,
  ItemIssueLineAvailability,
  ItemIssueStatus,
  ItemRequestPersonSummary,
} from "@printing-stationery/shared";
import { itemIssueBusinessStatusLabel } from "@printing-stationery/shared";

export const ITEM_ISSUE_STATUS_LABELS: Record<ItemIssueStatus, string> = {
  DRAFT: "Draft",
  PENDING_VERIFICATION: "Submitted",
  RETURNED: "Returned",
  REJECTED: "Rejected",
  POSTED: "Dispatched",
};

export const ITEM_ISSUE_DELIVERY_STATUS_LABELS: Record<
  ItemIssueDeliveryStatus,
  string
> = {
  IN_TRANSIT: "In Transit",
  PARTIALLY_RECEIVED: "Partially Received",
  RECEIVED: "Received",
  RECEIVED_WITH_DISCREPANCY: "Received with Discrepancy",
};

export function itemIssueStatusDisplayLabel(params: {
  status: ItemIssueStatus;
  destinationType?: ItemIssueDestinationType | null;
  deliveryStatus?: ItemIssueDeliveryStatus | null;
}): string {
  return itemIssueBusinessStatusLabel(params);
}

export function itemIssueStatusTone(
  status: ItemIssueStatus,
  deliveryStatus?: ItemIssueDeliveryStatus | null,
): "success" | "warning" | "danger" | "neutral" | "info" {
  if (status === "POSTED" && deliveryStatus === "RECEIVED_WITH_DISCREPANCY") {
    return "warning";
  }
  switch (status) {
    case "POSTED":
      return "success";
    case "RETURNED":
      return "warning";
    case "REJECTED":
      return "danger";
    case "DRAFT":
      return "neutral";
    default:
      return "info";
  }
}

export function personDisplayName(
  person: ItemRequestPersonSummary | null | undefined,
): string {
  if (!person) {
    return "—";
  }

  if (person.employee) {
    return `${person.employee.employeeName} (${person.employee.employeeCode})`;
  }

  return person.username;
}

export function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

export function formatAvailableStockQuantity(
  quantity: string | null | undefined,
  unitName: string,
): string {
  const raw = quantity?.trim() || "0";
  const sign = raw.startsWith("-") ? "-" : "";
  const unsigned = sign ? raw.slice(1) : raw;
  const [wholePart = "0", fractionPart] = unsigned.split(".");
  const groupedWhole = wholePart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const formatted = fractionPart
    ? `${sign}${groupedWhole}.${fractionPart}`
    : `${sign}${groupedWhole}`;
  return `${formatted} ${unitName}`;
}

export function itemIssueRemainingColumnLabel(
  status: ItemIssueStatus | undefined,
): string {
  return status === "POSTED"
    ? "Remaining After Issue"
    : "Outstanding Before This Issue";
}

export function itemIssueQtyColumnLabel(
  status: ItemIssueStatus | undefined,
): string {
  void status;
  return "Quantity Issued Now";
}

export function itemIssueDisplayedRemainingQuantity(
  line: ItemIssueLineAvailability,
  status: ItemIssueStatus | undefined,
): string {
  if (status === "POSTED") {
    return line.remainingAfterIssue ?? line.remainingQuantity ?? "—";
  }
  return line.outstandingBeforeThisIssue ?? line.remainingQuantity ?? "—";
}
