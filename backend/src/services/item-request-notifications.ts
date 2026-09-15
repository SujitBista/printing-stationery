import type {
  ItemRequestActionType,
  ItemRequestStatus,
  NotificationType,
} from "@printing-stationery/shared";
import {
  itemRequestNotificationRecipientIds,
  notificationTypeForItemRequestAction,
} from "@printing-stationery/shared";
import { getDb } from "../db/client.js";
import type { NewNotificationRow } from "../db/schema/notifications.js";
import { insertNotifications } from "./notifications.service.js";

const TITLE_BY_TYPE: Record<NotificationType, string> = {
  ITEM_REQUEST_SUBMITTED: "Item request submitted",
  ITEM_REQUEST_RECOMMENDED: "Item request recommended",
  ITEM_REQUEST_FORWARDED: "Item request forwarded",
  ITEM_REQUEST_APPROVED: "Item request approved",
  ITEM_REQUEST_RETURNED: "Item request returned",
  ITEM_REQUEST_REJECTED: "Item request rejected",
};

const VERB_BY_TYPE: Record<NotificationType, string> = {
  ITEM_REQUEST_SUBMITTED: "submitted",
  ITEM_REQUEST_RECOMMENDED: "recommended",
  ITEM_REQUEST_FORWARDED: "forwarded",
  ITEM_REQUEST_APPROVED: "approved",
  ITEM_REQUEST_RETURNED: "returned",
  ITEM_REQUEST_REJECTED: "rejected",
};

const MESSAGE_MAX_LENGTH = 500;

export function itemRequestNotificationVerb(
  type: NotificationType,
  action: ItemRequestActionType,
): string {
  if (action === "RESUBMIT") {
    return "resubmitted";
  }
  return VERB_BY_TYPE[type];
}

export function buildItemRequestNotificationMessage(params: {
  type: NotificationType;
  action: ItemRequestActionType;
  actorName: string;
  requestNumber: string;
  remarks: string | null;
}): string {
  const verb = itemRequestNotificationVerb(params.type, params.action);
  const base = `${params.actorName} ${verb} request ${params.requestNumber}.`;
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

export function buildItemRequestNotificationRows(params: {
  action: ItemRequestActionType;
  toStatus: ItemRequestStatus;
  requestId: string;
  requestNumber: string;
  actorUserId: string;
  actorName: string;
  remarks: string | null;
  createdByApplicationUserId: string;
  branchCheckerApplicationUserId: string | null;
  corporateMakerApplicationUserId: string | null;
  corporateCheckerApplicationUserId: string | null;
}): NewNotificationRow[] {
  const type = notificationTypeForItemRequestAction(params.action);
  if (!type) {
    return [];
  }

  const recipientIds = itemRequestNotificationRecipientIds({
    toStatus: params.toStatus,
    actorUserId: params.actorUserId,
    createdByApplicationUserId: params.createdByApplicationUserId,
    branchCheckerApplicationUserId: params.branchCheckerApplicationUserId,
    corporateMakerApplicationUserId: params.corporateMakerApplicationUserId,
    corporateCheckerApplicationUserId: params.corporateCheckerApplicationUserId,
  });

  const title = TITLE_BY_TYPE[type];
  const message = buildItemRequestNotificationMessage({
    type,
    action: params.action,
    actorName: params.actorName,
    requestNumber: params.requestNumber,
    remarks: params.remarks,
  });

  return recipientIds.map((recipientUserId) => ({
    recipientUserId,
    type,
    title,
    message,
    relatedEntityType: "ITEM_REQUEST" as const,
    relatedEntityId: params.requestId,
    requestNumber: params.requestNumber,
    actorUserId: params.actorUserId,
    isRead: false,
    readAt: null,
  }));
}

export async function insertItemRequestWorkflowNotifications(
  tx: Pick<ReturnType<typeof getDb>, "insert">,
  params: Parameters<typeof buildItemRequestNotificationRows>[0],
): Promise<void> {
  await insertNotifications(tx, buildItemRequestNotificationRows(params));
}
