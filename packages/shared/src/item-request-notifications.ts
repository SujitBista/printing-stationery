import { itemRequestPendingAssignee } from "./item-request-workflow.js";
import type { NotificationType } from "./types/notification.js";
import type {
  ItemRequestActionType,
  ItemRequestStatus,
} from "./types/item-request.js";

export function notificationTypeForItemRequestAction(
  action: ItemRequestActionType,
): NotificationType | null {
  switch (action) {
    case "SUBMIT":
    case "RESUBMIT":
      return "ITEM_REQUEST_SUBMITTED";
    case "RECOMMEND":
      return "ITEM_REQUEST_RECOMMENDED";
    case "FORWARD":
      return "ITEM_REQUEST_FORWARDED";
    case "APPROVE":
      return "ITEM_REQUEST_APPROVED";
    case "RETURN":
      return "ITEM_REQUEST_RETURNED";
    case "REJECT":
      return "ITEM_REQUEST_REJECTED";
    case "CANCEL":
      return null;
    default:
      return null;
  }
}

type ItemRequestNotificationAssignees = {
  createdByApplicationUserId: string;
  branchCheckerApplicationUserId: string | null;
  corporateMakerApplicationUserId: string | null;
  corporateCheckerApplicationUserId: string | null;
};

function assigneeUserId(
  key: ReturnType<typeof itemRequestPendingAssignee>,
  assignees: ItemRequestNotificationAssignees,
): string | null {
  if (!key) {
    return null;
  }

  switch (key) {
    case "createdBy":
      return assignees.createdByApplicationUserId;
    case "branchChecker":
      return assignees.branchCheckerApplicationUserId;
    case "corporateMaker":
      return assignees.corporateMakerApplicationUserId;
    case "corporateChecker":
      return assignees.corporateCheckerApplicationUserId;
    default:
      return null;
  }
}

/**
 * Recipients for an item-request workflow event. Notifies the person the
 * request is now pending with, and on approve/reject also notifies the other
 * recorded participants. The actor is never notified of their own action.
 */
export function itemRequestNotificationRecipientIds(params: {
  toStatus: ItemRequestStatus;
  actorUserId: string;
  createdByApplicationUserId: string;
  branchCheckerApplicationUserId: string | null;
  corporateMakerApplicationUserId: string | null;
  corporateCheckerApplicationUserId: string | null;
}): string[] {
  const ids = new Set<string>();
  const assignees: ItemRequestNotificationAssignees = {
    createdByApplicationUserId: params.createdByApplicationUserId,
    branchCheckerApplicationUserId: params.branchCheckerApplicationUserId,
    corporateMakerApplicationUserId: params.corporateMakerApplicationUserId,
    corporateCheckerApplicationUserId: params.corporateCheckerApplicationUserId,
  };

  const pendingId = assigneeUserId(
    itemRequestPendingAssignee(params.toStatus),
    assignees,
  );
  if (pendingId) {
    ids.add(pendingId);
  }

  if (params.toStatus === "APPROVED" || params.toStatus === "REJECTED") {
    ids.add(params.createdByApplicationUserId);
    if (params.branchCheckerApplicationUserId) {
      ids.add(params.branchCheckerApplicationUserId);
    }
    if (params.corporateMakerApplicationUserId) {
      ids.add(params.corporateMakerApplicationUserId);
    }
    if (params.corporateCheckerApplicationUserId) {
      ids.add(params.corporateCheckerApplicationUserId);
    }
  }

  ids.delete(params.actorUserId);
  return [...ids];
}
