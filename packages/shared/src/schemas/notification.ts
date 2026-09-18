import { z } from "zod";

export const NOTIFICATION_TYPES = [
  "ITEM_REQUEST_SUBMITTED",
  "ITEM_REQUEST_RECOMMENDED",
  "ITEM_REQUEST_FORWARDED",
  "ITEM_REQUEST_APPROVED",
  "ITEM_REQUEST_RETURNED",
  "ITEM_REQUEST_REJECTED",
  "ITEM_ISSUE_SUBMITTED",
  "ITEM_ISSUE_RETURNED",
  "ITEM_ISSUE_REJECTED",
  "ITEM_ISSUE_POSTED",
  "ITEM_ISSUE_DISPATCHED",
  "ITEM_ISSUE_RECEIPT_RECORDED",
  "ITEM_ISSUE_RECEIPT_RETURNED",
  "ITEM_ISSUE_RECEIPT_CONFIRMED",
  "ITEM_ISSUE_DISCREPANCY_REPORTED",
  "ITEM_ISSUE_DEPARTMENT_ISSUED",
] as const;

export const notificationTypeSchema = z.enum(NOTIFICATION_TYPES);

export const NOTIFICATION_ENTITY_TYPES = ["ITEM_REQUEST", "ITEM_ISSUE"] as const;

export const notificationEntityTypeSchema = z.enum(NOTIFICATION_ENTITY_TYPES);

export const notificationSchema = z.object({
  id: z.string().uuid(),
  recipientUserId: z.string().uuid(),
  type: notificationTypeSchema,
  title: z.string(),
  message: z.string(),
  relatedEntityType: notificationEntityTypeSchema,
  relatedEntityId: z.string().uuid(),
  requestNumber: z.string().nullable(),
  issueNumber: z.string().nullable(),
  actorUserId: z.string().uuid().nullable(),
  isRead: z.boolean(),
  readAt: z.string().nullable(),
  createdAt: z.string(),
});

const optionalBooleanQuerySchema = z.preprocess((value) => {
  if (value === "" || value === null || value === undefined) {
    return undefined;
  }
  if (value === true || value === "true") {
    return true;
  }
  if (value === false || value === "false") {
    return false;
  }
  return value;
}, z.boolean().optional());

export const notificationListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(50).default(20),
  unreadOnly: optionalBooleanQuerySchema,
});

export const paginatedNotificationResponseSchema = z.object({
  items: z.array(notificationSchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
  unreadCount: z.number().int().nonnegative(),
});

export const notificationUnreadCountSchema = z.object({
  unreadCount: z.number().int().nonnegative(),
});

export const markNotificationsReadResponseSchema = z.object({
  markedCount: z.number().int().nonnegative(),
  unreadCount: z.number().int().nonnegative(),
});

export const notificationIdSchema = z.string().uuid("Invalid notification id");
