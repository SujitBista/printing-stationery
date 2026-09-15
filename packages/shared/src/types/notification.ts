import type { z } from "zod";
import type {
  markNotificationsReadResponseSchema,
  notificationEntityTypeSchema,
  notificationIdSchema,
  notificationListQuerySchema,
  notificationSchema,
  notificationTypeSchema,
  notificationUnreadCountSchema,
  paginatedNotificationResponseSchema,
} from "../schemas/notification.js";

export type NotificationType = z.infer<typeof notificationTypeSchema>;
export type NotificationEntityType = z.infer<
  typeof notificationEntityTypeSchema
>;
export type Notification = z.infer<typeof notificationSchema>;
export type NotificationListQuery = z.infer<typeof notificationListQuerySchema>;
export type PaginatedNotificationResponse = z.infer<
  typeof paginatedNotificationResponseSchema
>;
export type NotificationUnreadCount = z.infer<
  typeof notificationUnreadCountSchema
>;
export type MarkNotificationsReadResponse = z.infer<
  typeof markNotificationsReadResponseSchema
>;
export type NotificationId = z.infer<typeof notificationIdSchema>;
