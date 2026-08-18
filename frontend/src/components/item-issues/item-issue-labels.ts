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
