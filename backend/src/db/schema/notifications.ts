import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  pgEnum,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { applicationUsers } from "./auth.js";

export const notificationTypeEnum = pgEnum("notification_type", [
  "ITEM_REQUEST_SUBMITTED",
  "ITEM_REQUEST_RECOMMENDED",
  "ITEM_REQUEST_FORWARDED",
  "ITEM_REQUEST_APPROVED",
  "ITEM_REQUEST_RETURNED",
  "ITEM_REQUEST_REJECTED",
]);

export const notificationEntityTypeEnum = pgEnum("notification_entity_type", [
  "ITEM_REQUEST",
]);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    recipientUserId: uuid("recipient_user_id").notNull(),
    type: notificationTypeEnum("type").notNull(),
    title: varchar("title", { length: 200 }).notNull(),
    message: varchar("message", { length: 500 }).notNull(),
    relatedEntityType: notificationEntityTypeEnum(
      "related_entity_type",
    ).notNull(),
    relatedEntityId: uuid("related_entity_id").notNull(),
    requestNumber: varchar("request_number", { length: 40 }),
    actorUserId: uuid("actor_user_id"),
    isRead: boolean("is_read").notNull().default(false),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("notifications_recipient_user_id_created_at_idx").on(
      table.recipientUserId,
      table.createdAt,
    ),
    index("notifications_recipient_unread_idx")
      .on(table.recipientUserId)
      .where(sql`${table.isRead} = false`),
    index("notifications_related_entity_idx").on(
      table.relatedEntityType,
      table.relatedEntityId,
    ),
    foreignKey({
      columns: [table.recipientUserId],
      foreignColumns: [applicationUsers.id],
      name: "notifications_recipient_user_id_fk",
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({
      columns: [table.actorUserId],
      foreignColumns: [applicationUsers.id],
      name: "notifications_actor_user_id_fk",
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    check(
      "notifications_read_state",
      sql`(${table.isRead} = false AND ${table.readAt} IS NULL) OR (${table.isRead} = true AND ${table.readAt} IS NOT NULL)`,
    ),
  ],
);

export type NotificationRow = typeof notifications.$inferSelect;
export type NewNotificationRow = typeof notifications.$inferInsert;
