import type { Notification } from "@printing-stationery/shared";

export function itemRequestNotificationHref(
  notification: Pick<
    Notification,
    "relatedEntityType" | "relatedEntityId" | "type"
  >,
): string | null {
  if (notification.relatedEntityType === "ITEM_ISSUE") {
    if (
      notification.type === "ITEM_ISSUE_DISPATCHED" ||
      notification.type === "ITEM_ISSUE_RECEIPT_RECORDED" ||
      notification.type === "ITEM_ISSUE_RECEIPT_RETURNED"
    ) {
      return "/requests/incoming-items";
    }
    if (notification.type === "ITEM_ISSUE_DEPARTMENT_ISSUED") {
      return `/requests/item-issues/${notification.relatedEntityId}`;
    }
    return `/requests/item-issues/${notification.relatedEntityId}`;
  }
  if (notification.relatedEntityType === "ITEM_REQUEST") {
    return `/requests/item-requests/${notification.relatedEntityId}`;
  }
  return null;
}
