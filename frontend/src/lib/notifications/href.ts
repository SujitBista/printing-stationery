import type { Notification } from "@printing-stationery/shared";

export function itemRequestNotificationHref(
  notification: Pick<Notification, "relatedEntityType" | "relatedEntityId">,
): string | null {
  if (notification.relatedEntityType === "ITEM_REQUEST") {
    return `/requests/item-requests/${notification.relatedEntityId}`;
  }
  return null;
}
