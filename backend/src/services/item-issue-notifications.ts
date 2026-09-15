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
>;

const TITLE_BY_TYPE: Record<IssueNotificationType, string> = {
  ITEM_ISSUE_SUBMITTED: "Item issue submitted for verification",
  ITEM_ISSUE_RETURNED: "Item issue returned",
  ITEM_ISSUE_REJECTED: "Item issue rejected",
  ITEM_ISSUE_POSTED: "Item issue verified and posted",
};

const VERB_BY_TYPE: Record<IssueNotificationType, string> = {
  ITEM_ISSUE_SUBMITTED: "submitted",
  ITEM_ISSUE_RETURNED: "returned",
  ITEM_ISSUE_REJECTED: "rejected",
  ITEM_ISSUE_POSTED: "verified and posted",
};

const MESSAGE_MAX_LENGTH = 500;

export function buildItemIssueNotificationMessage(params: {
  type: IssueNotificationType;
  actorName: string;
  requestNumber: string;
  issueNumber: string;
  remarks: string | null;
}): string {
  const verb = VERB_BY_TYPE[params.type];
  const base = `${params.actorName} ${verb} issue ${params.issueNumber} for request ${params.requestNumber}.`;
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
}): string[] {
  const ids = new Set<string>();

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
      if (params.branchMakerApplicationUserId) {
        ids.add(params.branchMakerApplicationUserId);
      }
      if (params.branchCheckerApplicationUserId) {
        ids.add(params.branchCheckerApplicationUserId);
      }
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
}): NewNotificationRow[] {
  const recipientIds = itemIssueNotificationRecipientIds(params);
  const title = TITLE_BY_TYPE[params.type];
  const message = buildItemIssueNotificationMessage({
    type: params.type,
    actorName: params.actorName,
    requestNumber: params.requestNumber,
    issueNumber: params.issueNumber,
    remarks: params.remarks,
  });

  return recipientIds.map((recipientUserId) => ({
    recipientUserId,
    type: params.type,
    title,
    message,
    relatedEntityType: "ITEM_ISSUE" as const,
    relatedEntityId: params.issueId,
    requestNumber: params.requestNumber,
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
