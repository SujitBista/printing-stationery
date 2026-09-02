import type {
  ItemIssueStatus,
  ItemRequestPersonSummary,
} from "@printing-stationery/shared";

export const ITEM_ISSUE_STATUS_LABELS: Record<ItemIssueStatus, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
};

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
