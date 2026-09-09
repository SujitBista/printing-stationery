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
    return employeeDisplayName(person.employee);
  }

  return person.username;
}

export function employeeDisplayName(employee: {
  employeeName: string;
  employeeCode: string;
} | null | undefined): string {
  if (!employee) {
    return "—";
  }
  return `${employee.employeeName} (${employee.employeeCode})`;
}

export function departmentDisplayName(department: {
  departmentName: string;
  departmentCode: string;
} | null | undefined): string {
  if (!department) {
    return "No department assigned";
  }
  return `${department.departmentName} (${department.departmentCode})`;
}

export function requestedByDisplayName(
  requestedBy: {
    employeeName: string;
    employeeCode: string;
  } | null | undefined,
  createdBy?: ItemRequestPersonSummary | null,
): string {
  if (requestedBy) {
    return employeeDisplayName(requestedBy);
  }
  return personDisplayName(createdBy);
}

export function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

export function storeDisplayName(store: {
  storeCode: string;
  storeName: string;
} | null | undefined): string {
  if (!store) {
    return "Not assigned";
  }
  return `${store.storeCode} — ${store.storeName}`;
}

export function storeOptionLabel(store: {
  storeCode: string;
  storeName: string;
  branch: { branchName: string };
}): string {
  return `${store.storeCode} — ${store.storeName} (${store.branch.branchName})`;
}

export function formatStoreTransferDirection(
  sourceStore: { storeName: string } | null | undefined,
  destinationStore: { storeName: string } | null | undefined,
): string {
  const from = sourceStore?.storeName ?? "Supplying store not set";
  const to = destinationStore?.storeName ?? "Receiving store not set";
  return `${from} → ${to}`;
}