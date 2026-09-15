import { and, count, desc, eq, sql, type SQL } from "drizzle-orm";
import type {
  MarkNotificationsReadResponse,
  Notification,
  NotificationListQuery,
  NotificationUnreadCount,
  PaginatedNotificationResponse,
} from "@printing-stationery/shared";
import { getDb } from "../db/client.js";
import {
  notifications,
  type NewNotificationRow,
  type NotificationRow,
} from "../db/schema/notifications.js";
import { AppError } from "../utils/errors.js";
import { mapNotificationDatabaseError } from "../utils/db-errors.js";

export function toNotification(row: NotificationRow): Notification {
  return {
    id: row.id,
    recipientUserId: row.recipientUserId,
    type: row.type,
    title: row.title,
    message: row.message,
    relatedEntityType: row.relatedEntityType,
    relatedEntityId: row.relatedEntityId,
    requestNumber: row.requestNumber,
    actorUserId: row.actorUserId,
    isRead: row.isRead,
    readAt: row.readAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function buildListFilters(
  recipientUserId: string,
  query: NotificationListQuery,
): SQL {
  const conditions: SQL[] = [eq(notifications.recipientUserId, recipientUserId)];
  if (query.unreadOnly) {
    conditions.push(eq(notifications.isRead, false));
  }
  return conditions.length === 1 ? conditions[0]! : and(...conditions)!;
}

async function countUnread(recipientUserId: string): Promise<number> {
  const rows = await getDb()
    .select({ value: count() })
    .from(notifications)
    .where(
      and(
        eq(notifications.recipientUserId, recipientUserId),
        eq(notifications.isRead, false),
      ),
    );
  return rows[0]?.value ?? 0;
}

export async function insertNotifications(
  tx: Pick<ReturnType<typeof getDb>, "insert">,
  rows: NewNotificationRow[],
): Promise<void> {
  if (rows.length === 0) {
    return;
  }
  await tx.insert(notifications).values(rows);
}

export async function listNotifications(
  recipientUserId: string,
  query: NotificationListQuery,
): Promise<PaginatedNotificationResponse> {
  const where = buildListFilters(recipientUserId, query);

  try {
    const countRows = await getDb()
      .select({ value: count() })
      .from(notifications)
      .where(where);
    const totalItems = countRows[0]?.value ?? 0;
    const totalPages =
      totalItems === 0 ? 0 : Math.ceil(totalItems / query.pageSize);
    const offset = (query.page - 1) * query.pageSize;
    const unreadCount = await countUnread(recipientUserId);

    const rows = await getDb()
      .select()
      .from(notifications)
      .where(where)
      .orderBy(desc(notifications.createdAt), desc(notifications.id))
      .limit(query.pageSize)
      .offset(offset);

    return {
      items: rows.map(toNotification),
      page: query.page,
      pageSize: query.pageSize,
      totalItems,
      totalPages,
      unreadCount,
    };
  } catch (error) {
    mapNotificationDatabaseError(error);
  }
}

export async function getNotificationUnreadCount(
  recipientUserId: string,
): Promise<NotificationUnreadCount> {
  try {
    return { unreadCount: await countUnread(recipientUserId) };
  } catch (error) {
    mapNotificationDatabaseError(error);
  }
}

export async function markNotificationRead(
  id: string,
  recipientUserId: string,
): Promise<Notification> {
  try {
    const updated = await getDb()
      .update(notifications)
      .set({
        isRead: true,
        readAt: sql`now()`,
      })
      .where(
        and(
          eq(notifications.id, id),
          eq(notifications.recipientUserId, recipientUserId),
        ),
      )
      .returning();

    const row = updated[0];
    if (!row) {
      throw new AppError("Notification not found", 404);
    }

    return toNotification(row);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    mapNotificationDatabaseError(error);
  }
}

export async function markAllNotificationsRead(
  recipientUserId: string,
): Promise<MarkNotificationsReadResponse> {
  try {
    const updated = await getDb()
      .update(notifications)
      .set({
        isRead: true,
        readAt: sql`now()`,
      })
      .where(
        and(
          eq(notifications.recipientUserId, recipientUserId),
          eq(notifications.isRead, false),
        ),
      )
      .returning({ id: notifications.id });

    return {
      markedCount: updated.length,
      unreadCount: 0,
    };
  } catch (error) {
    mapNotificationDatabaseError(error);
  }
}
