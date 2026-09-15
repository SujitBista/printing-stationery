import {
  markNotificationsReadResponseSchema,
  notificationIdSchema,
  notificationListQuerySchema,
  notificationSchema,
  notificationUnreadCountSchema,
  paginatedNotificationResponseSchema,
  type MarkNotificationsReadResponse,
  type Notification,
  type NotificationListQuery,
  type NotificationUnreadCount,
  type PaginatedNotificationResponse,
} from "@printing-stationery/shared";
import { requestJson, type ApiResult } from "./client";

function buildQueryString(query: NotificationListQuery): string {
  const params = new URLSearchParams();
  params.set("page", String(query.page));
  params.set("pageSize", String(query.pageSize));
  if (query.unreadOnly) {
    params.set("unreadOnly", "true");
  }
  return params.toString();
}

export async function fetchNotifications(
  rawQuery: Partial<NotificationListQuery> = {},
): Promise<ApiResult<PaginatedNotificationResponse>> {
  const parsedQuery = notificationListQuerySchema.safeParse(rawQuery);
  if (!parsedQuery.success) {
    return { ok: false, error: "Invalid notification list query", status: 400 };
  }

  const queryString = buildQueryString(parsedQuery.data);

  return requestJson(
    `/api/notifications?${queryString}`,
    { method: "GET" },
    (json) => {
      const parsed = paginatedNotificationResponseSchema.safeParse(json);
      if (!parsed.success) {
        return {
          success: false,
          error:
            "Notification list response did not match the expected schema",
        };
      }
      return { success: true, data: parsed.data };
    },
    "Failed to load notifications",
  );
}

export async function fetchNotificationUnreadCount(): Promise<
  ApiResult<NotificationUnreadCount>
> {
  return requestJson(
    "/api/notifications/unread-count",
    { method: "GET" },
    (json) => {
      const parsed = notificationUnreadCountSchema.safeParse(json);
      if (!parsed.success) {
        return {
          success: false,
          error: "Unread count response did not match the expected schema",
        };
      }
      return { success: true, data: parsed.data };
    },
    "Failed to load unread notification count",
  );
}

export async function markNotificationRead(
  id: string,
): Promise<ApiResult<Notification>> {
  const parsedId = notificationIdSchema.safeParse(id);
  if (!parsedId.success) {
    return { ok: false, error: "Invalid notification id", status: 400 };
  }

  return requestJson(
    `/api/notifications/${parsedId.data}/read`,
    { method: "PATCH", body: "{}" },
    (json) => {
      const parsed = notificationSchema.safeParse(json);
      if (!parsed.success) {
        return {
          success: false,
          error: "Notification response did not match the expected schema",
        };
      }
      return { success: true, data: parsed.data };
    },
    "Failed to mark notification as read",
  );
}

export async function markAllNotificationsRead(): Promise<
  ApiResult<MarkNotificationsReadResponse>
> {
  return requestJson(
    "/api/notifications/mark-all-read",
    { method: "POST", body: "{}" },
    (json) => {
      const parsed = markNotificationsReadResponseSchema.safeParse(json);
      if (!parsed.success) {
        return {
          success: false,
          error:
            "Mark-all-read response did not match the expected schema",
        };
      }
      return { success: true, data: parsed.data };
    },
    "Failed to mark notifications as read",
  );
}
