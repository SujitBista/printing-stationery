import type {
  ItemIssueLineAvailability,
  ItemIssueStatus,
  ItemRequestPersonSummary,
} from "@printing-stationery/shared";

export const ITEM_ISSUE_STATUS_LABELS: Record<ItemIssueStatus, string> = {
  DRAFT: "Draft",
  PENDING_VERIFICATION: "Pending Verification",
  RETURNED: "Returned",
  REJECTED: "Rejected",
  POSTED: "Posted",
};

export function itemIssueStatusTone(
  status: ItemIssueStatus,
): "success" | "warning" | "danger" | "neutral" | "info" {
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
  return status === "POSTED" ? "Qty Issued Now" : "Issue Qty";
}

export function itemIssueDisplayedRemainingQuantity(
  line: ItemIssueLineAvailability,
  status: ItemIssueStatus | undefined,
): string {
  if (status === "POSTED") {
    return line.remainingAfterIssue ?? line.remainingQuantity;
  }
  return line.outstandingBeforeThisIssue ?? line.remainingQuantity;
}
