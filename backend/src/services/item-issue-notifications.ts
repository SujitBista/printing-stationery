import type { NotificationType } from "@printing-stationery/shared";
import { getDb } from "../db/client.js";
import type { NewNotificationRow } from "../db/schema/notifications.js";
import { insertNotifications } from "./notifications.service.js";

type IssueNotificationType = Extract<
  NotificationType,
  | "ITEM_ISSUE_SUBMITTED"
  | "ITEM_ISSUE_RETURNED"
  | "ITEM_ISSUE_REJECTED"
  | "ITEM_ISSUE_POSTED"
  | "ITEM_ISSUE_DISPATCHED"
  | "ITEM_ISSUE_RECEIPT_RECORDED"
  | "ITEM_ISSUE_RECEIPT_RETURNED"
  | "ITEM_ISSUE_RECEIPT_CONFIRMED"
  | "ITEM_ISSUE_DISCREPANCY_REPORTED"
  | "ITEM_ISSUE_DEPARTMENT_ISSUED"
>;

const TITLE_BY_TYPE: Record<IssueNotificationType, string> = {
  ITEM_ISSUE_SUBMITTED: "Item issue submitted for verification",
  ITEM_ISSUE_RETURNED: "Item issue returned",
  ITEM_ISSUE_REJECTED: "Item issue rejected",
  ITEM_ISSUE_POSTED: "Item issue dispatched",
  ITEM_ISSUE_DISPATCHED: "Incoming items dispatched",
  ITEM_ISSUE_RECEIPT_RECORDED: "Receipt recorded for verification",
  ITEM_ISSUE_RECEIPT_RETURNED: "Receipt returned for correction",
  ITEM_ISSUE_RECEIPT_CONFIRMED: "Receipt confirmed",
  ITEM_ISSUE_DISCREPANCY_REPORTED: "Receipt completed with discrepancy",
  ITEM_ISSUE_DEPARTMENT_ISSUED: "Issued to department",
};

const VERB_BY_TYPE: Record<IssueNotificationType, string> = {
  ITEM_ISSUE_SUBMITTED: "submitted",
  ITEM_ISSUE_RETURNED: "returned",
  ITEM_ISSUE_REJECTED: "rejected",
  ITEM_ISSUE_POSTED: "dispatched",
  ITEM_ISSUE_DISPATCHED: "dispatched",
  ITEM_ISSUE_RECEIPT_RECORDED: "recorded a receipt for",
  ITEM_ISSUE_RECEIPT_RETURNED: "returned a receipt for",
  ITEM_ISSUE_RECEIPT_CONFIRMED: "confirmed receipt of",
  ITEM_ISSUE_DISCREPANCY_REPORTED: "reported a discrepancy on",
  ITEM_ISSUE_DEPARTMENT_ISSUED: "issued to department for",
};

const MESSAGE_MAX_LENGTH = 500;

export function buildItemIssueNotificationMessage(params: {
  type: IssueNotificationType;
  actorName: string;
  requestNumber: string;
  issueNumber: string;
  remarks: string | null;
  customMessage?: string | null;
}): string {
  if (params.customMessage && params.customMessage.trim().length > 0) {
    return params.customMessage.trim().slice(0, MESSAGE_MAX_LENGTH);
  }

  const verb = VERB_BY_TYPE[params.type];
  const requestPart =
    params.requestNumber.length > 0
      ? ` for request ${params.requestNumber}`
      : "";
  const base = `${params.actorName} ${verb} issue ${params.issueNumber}${requestPart}.`;
  if (!params.remarks) {
    return base.slice(0, MESSAGE_MAX_LENGTH);
  }

  const remaining = MESSAGE_MAX_LENGTH - base.length - 1;
  if (remaining <= 0) {
    return base.slice(0, MESSAGE_MAX_LENGTH);
  }

  const remarks =
    params.remarks.length > remaining
      ? `${params.remarks.slice(0, Math.max(0, remaining - 1))}…`
      : params.remarks;
  return `${base} ${remarks}`;
}

export function itemIssueNotificationRecipientIds(params: {
  type: IssueNotificationType;
  actorUserId: string;
  createdByApplicationUserId: string;
  corporateCheckerApplicationUserId: string | null;
  branchMakerApplicationUserId: string | null;
  branchCheckerApplicationUserId: string | null;
  extraRecipientIds?: readonly string[];
}): string[] {
  const ids = new Set<string>(params.extraRecipientIds ?? []);

  switch (params.type) {
    case "ITEM_ISSUE_SUBMITTED":
      if (params.corporateCheckerApplicationUserId) {
        ids.add(params.corporateCheckerApplicationUserId);
      }
      break;
    case "ITEM_ISSUE_RETURNED":
    case "ITEM_ISSUE_REJECTED":
      ids.add(params.createdByApplicationUserId);
      break;
    case "ITEM_ISSUE_POSTED":
    case "ITEM_ISSUE_DISPATCHED":
      if (params.branchMakerApplicationUserId) {
        ids.add(params.branchMakerApplicationUserId);
      }
      if (params.branchCheckerApplicationUserId) {
        ids.add(params.branchCheckerApplicationUserId);
      }
      break;
    case "ITEM_ISSUE_RECEIPT_CONFIRMED":
    case "ITEM_ISSUE_DISCREPANCY_REPORTED":
      if (params.corporateCheckerApplicationUserId) {
        ids.add(params.corporateCheckerApplicationUserId);
      }
      break;
    case "ITEM_ISSUE_RECEIPT_RECORDED":
      if (params.branchCheckerApplicationUserId) {
        ids.add(params.branchCheckerApplicationUserId);
      }
      break;
    case "ITEM_ISSUE_RECEIPT_RETURNED":
      ids.add(params.createdByApplicationUserId);
      break;
    case "ITEM_ISSUE_DEPARTMENT_ISSUED":
      ids.add(params.createdByApplicationUserId);
      break;
    default:
      break;
  }

  ids.delete(params.actorUserId);
  return [...ids];
}

export function buildItemIssueNotificationRows(params: {
  type: IssueNotificationType;
  issueId: string;
  issueNumber: string;
  requestNumber: string;
  actorUserId: string;
  actorName: string;
  remarks: string | null;
  createdByApplicationUserId: string;
  corporateCheckerApplicationUserId: string | null;
  branchMakerApplicationUserId: string | null;
  branchCheckerApplicationUserId: string | null;
  extraRecipientIds?: readonly string[];
  customMessage?: string | null;
}): NewNotificationRow[] {
  const recipientIds = itemIssueNotificationRecipientIds(params);
  const title = TITLE_BY_TYPE[params.type];
  const message = buildItemIssueNotificationMessage({
    type: params.type,
    actorName: params.actorName,
    requestNumber: params.requestNumber,
    issueNumber: params.issueNumber,
    remarks: params.remarks,
    customMessage: params.customMessage,
  });

  return recipientIds.map((recipientUserId) => ({
    recipientUserId,
    type: params.type,
    title,
    message,
    relatedEntityType: "ITEM_ISSUE" as const,
    relatedEntityId: params.issueId,
    requestNumber: params.requestNumber || null,
    issueNumber: params.issueNumber,
    actorUserId: params.actorUserId,
    isRead: false,
    readAt: null,
  }));
}

export async function insertItemIssueWorkflowNotifications(
  tx: Pick<ReturnType<typeof getDb>, "insert">,
  params: Parameters<typeof buildItemIssueNotificationRows>[0],
): Promise<void> {
  await insertNotifications(tx, buildItemIssueNotificationRows(params));
}
