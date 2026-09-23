import type {
  ItemRequestActionType,
  ItemRequestPersonSummary,
  ItemRequestQueue,
  ItemRequestStatus,
  ItemRequestWorkflowRole,
} from "@printing-stationery/shared";

/** Status choices on All Requests. Submitted is the tracking name. */
export const ITEM_REQUEST_LIST_STATUS_FILTER_OPTIONS = [
  { value: "ALL", label: "All statuses" },
  { value: "DRAFT", label: "Draft" },
  { value: "SUBMITTED", label: "Submitted" },
  { value: "RETURNED_TO_BRANCH_MAKER", label: "Returned" },
  { value: "REJECTED", label: "Rejected" },
  { value: "PENDING_CORPORATE_MAKER", label: "Recommended" },
  { value: "PENDING_CORPORATE_CHECKER", label: "Pending Corporate Checker" },
  { value: "RETURNED_TO_CORPORATE_MAKER", label: "Returned to Corporate Maker" },
  { value: "APPROVED", label: "Approved" },
  { value: "PARTIALLY_ISSUED", label: "Partially Issued" },
  { value: "ISSUED", label: "Fully Issued" },
  { value: "CANCELLED", label: "Cancelled" },
] as const;

export function itemRequestTrackingStatusLabel(
  status: ItemRequestStatus,
): string {
  switch (status) {
    case "PENDING_BRANCH_CHECKER":
      return "Submitted";
    case "RETURNED_TO_BRANCH_MAKER":
      return "Returned";
    case "PENDING_CORPORATE_MAKER":
      return "Recommended";
    case "PARTIALLY_ISSUED":
      return "Partially Issued";
    case "ISSUED":
      return "Fully Issued";
    default:
      return ITEM_REQUEST_STATUS_LABELS[status];
  }
}

export const ITEM_REQUEST_STATUS_LABELS: Record<ItemRequestStatus, string> = {
  DRAFT: "Draft",
  PENDING_BRANCH_CHECKER: "Pending Branch Checker",
  RETURNED_TO_BRANCH_MAKER: "Returned to Branch Maker",
  PENDING_CORPORATE_MAKER: "Pending Corporate Maker",
  PENDING_CORPORATE_CHECKER: "Pending Corporate Checker",
  RETURNED_TO_CORPORATE_MAKER: "Returned to Corporate Maker",
  APPROVED: "Approved",
  PARTIALLY_ISSUED: "Partially Issued",
  ISSUED: "Issued",
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

export const ITEM_REQUEST_WORKFLOW_ROLE_LABELS: Record<
  ItemRequestWorkflowRole,
  string
> = {
  ADMIN: "Admin",
  BRANCH_MAKER: "Branch Maker",
  BRANCH_CHECKER: "Branch Checker",
  CORPORATE_MAKER: "Corporate Maker",
  CORPORATE_CHECKER: "Corporate Checker",
};

export function getItemRequestActionLabel(
  action: ItemRequestActionType,
  context?: {
    queue?: ItemRequestQueue;
    status?: ItemRequestStatus;
  },
): string {
  if (action !== "RETURN") {
    return ITEM_REQUEST_ACTION_LABELS[action];
  }

  if (
    context?.queue === "approve" ||
    context?.status === "PENDING_CORPORATE_CHECKER"
  ) {
    return "Return to Corporate Maker";
  }
  if (
    context?.queue === "recommend" ||
    context?.queue === "review" ||
    context?.status === "PENDING_BRANCH_CHECKER" ||
    context?.status === "PENDING_CORPORATE_MAKER" ||
    context?.status === "RETURNED_TO_CORPORATE_MAKER"
  ) {
    return "Return to Branch Maker";
  }
  return "Return";
}

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
    case "ISSUED":
      return "success";
    case "PARTIALLY_ISSUED":
      return "info";
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
  const from = sourceStore?.storeName ?? "Requesting store not set";
  const to = destinationStore?.storeName ?? "Processing store not set";
  return `${from} → ${to}`;
}