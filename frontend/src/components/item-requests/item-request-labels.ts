import type {
  ItemRequestActionType,
  ItemRequestPersonSummary,
  ItemRequestStatus,
} from "@printing-stationery/shared";

export const ITEM_REQUEST_STATUS_LABELS: Record<ItemRequestStatus, string> = {
  DRAFT: "Draft",
  PENDING_BRANCH_CHECKER: "Pending Branch Checker",
  RETURNED_TO_BRANCH_MAKER: "Returned to Branch Maker",
  PENDING_CORPORATE_MAKER: "Pending Corporate Maker",
  PENDING_CORPORATE_CHECKER: "Pending Corporate Checker",
  RETURNED_TO_CORPORATE_MAKER: "Returned to Corporate Maker",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
};

export const ITEM_REQUEST_ACTION_LABELS: Record<ItemRequestActionType, string> =
  {
    SUBMIT: "Submit Request",
    RESUBMIT: "Resubmit Request",
    RECOMMEND: "Recommend",
    FORWARD: "Forward",
    APPROVE: "Approve",
    RETURN: "Return",
    REJECT: "Reject",
    CANCEL: "Cancel Request",
  };

export type ItemRequestStatusTone =
  | "success"
  | "warning"
  | "danger"
  | "neutral"
  | "info";

export function itemRequestStatusTone(
  status: ItemRequestStatus,
): ItemRequestStatusTone {
  switch (status) {
    case "APPROVED":
      return "success";
    case "REJECTED":
    case "CANCELLED":
      return "danger";
    case "RETURNED_TO_BRANCH_MAKER":
    case "RETURNED_TO_CORPORATE_MAKER":
      return "warning";
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