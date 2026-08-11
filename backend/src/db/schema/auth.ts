import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { employees } from "./employees.js";

export const appRoleEnum = pgEnum("app_role", ["ADMIN", "MAKER", "CHECKER"]);

export const applicationUsers = pgTable(
  "application_users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** Null only for the independently bootstrapped system Admin. Ordinary users must link an Employee. */
    employeeId: uuid("employee_id"),
    username: varchar("username", { length: 100 }).notNull(),
    passwordHash: text("password_hash").notNull(),
    mustChangePassword: boolean("must_change_password").notNull().default(true),
    isActive: boolean("is_active").notNull().default(true),
    failedLoginAttempts: integer("failed_login_attempts").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    passwordChangedAt: timestamp("password_changed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("application_users_employee_id_uidx").on(table.employeeId),
    uniqueIndex("application_users_username_lower_uidx").on(
      sql`lower(${table.username})`,
    ),
    index("application_users_is_active_idx").on(table.isActive),
    foreignKey({
      columns: [table.employeeId],
      foreignColumns: [employees.id],
      name: "application_users_employee_id_employees_id_fk",
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    check(
      "application_users_failed_login_attempts_nonnegative",
      sql`${table.failedLoginAttempts} >= 0`,
    ),
  ],
);

export const userRoles = pgTable(
  "user_roles",
  {
    userId: uuid("user_id").notNull(),
    role: appRoleEnum("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      columns: [table.userId, table.role],
      name: "user_roles_pkey",
    }),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [applicationUsers.id],
      name: "user_roles_user_id_application_users_id_fk",
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    index("user_roles_role_idx").on(table.role),
  ],
);

export const authSessions = pgTable(
  "auth_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull(),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    userAgent: text("user_agent"),
    ipAddress: varchar("ip_address", { length: 45 }),
  },
  (table) => [
    uniqueIndex("auth_sessions_token_hash_uidx").on(table.tokenHash),
    index("auth_sessions_user_id_idx").on(table.userId),
    index("auth_sessions_expires_at_idx").on(table.expiresAt),
    index("auth_sessions_user_id_revoked_at_idx").on(
      table.userId,
      table.revokedAt,
    ),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [applicationUsers.id],
      name: "auth_sessions_user_id_application_users_id_fk",
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
  ],
);

export type ApplicationUserRow = typeof applicationUsers.$inferSelect;
export type NewApplicationUserRow = typeof applicationUsers.$inferInsert;
export type UserRoleRow = typeof userRoles.$inferSelect;
export type AuthSessionRow = typeof authSessions.$inferSelect;
export type NewAuthSessionRow = typeof authSessions.$inferInsert;
