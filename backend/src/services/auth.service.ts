import { and, eq, gt, isNull, lt, ne, or, sql } from "drizzle-orm";
import type {
  AppRole,
  AuthenticatedUser,
  ChangeInitialPasswordInput,
  LoginInput,
} from "@printing-stationery/shared";
import type { Env } from "../config/env.js";
import { getDb } from "../db/client.js";
import { branches } from "../db/schema/branches.js";
import { employees } from "../db/schema/employees.js";
import {
  applicationUsers,
  authSessions,
  userRoles,
  type ApplicationUserRow,
} from "../db/schema/auth.js";
import { AppError } from "../utils/errors.js";
import {
  generateSessionToken,
  hashPassword,
  hashSessionToken,
  verifyPassword,
  verifyPasswordOrDummy,
} from "../utils/password.js";

/** Failed attempts before temporary lockout. */
export const LOGIN_MAX_FAILED_ATTEMPTS = 5;
/** Lockout duration after too many failed attempts. */
export const LOGIN_LOCKOUT_MINUTES = 15;

/** Advisory lock key for first-Admin bootstrap (transaction-scoped). */
const BOOTSTRAP_ADMIN_ADVISORY_LOCK_KEY = 874_201_033;

const INVALID_CREDENTIALS_MESSAGE = "Invalid username or password.";

export type AuthContext = {
  sessionId: string;
  user: AuthenticatedUser;
};

type AuthenticatedUserJoinedRow = {
  user: ApplicationUserRow;
  employeeId: string | null;
  employeeCode: string | null;
  employeeName: string | null;
  employeeIsActive: boolean | null;
  branchId: string | null;
  branchCode: string | null;
  branchName: string | null;
};

function toAuthenticatedUser(
  row: AuthenticatedUserJoinedRow,
  roles: AppRole[],
): AuthenticatedUser {
  const employee =
    row.employeeId &&
    row.employeeCode &&
    row.employeeName &&
    row.branchId &&
    row.branchCode &&
    row.branchName
      ? {
          id: row.employeeId,
          employeeCode: row.employeeCode,
          employeeName: row.employeeName,
          branch: {
            id: row.branchId,
            branchCode: row.branchCode,
            branchName: row.branchName,
          },
        }
      : null;

  return {
    id: row.user.id,
    username: row.user.username,
    mustChangePassword: row.user.mustChangePassword,
    roles,
    employee,
  };
}

function isLinkedEmployeeInactive(row: AuthenticatedUserJoinedRow): boolean {
  return row.employeeId !== null && row.employeeIsActive === false;
}

async function loadRolesForUser(userId: string): Promise<AppRole[]> {
  const db = getDb();
  const rows = await db
    .select({ role: userRoles.role })
    .from(userRoles)
    .where(eq(userRoles.userId, userId));

  return rows.map((row) => row.role);
}

async function loadAuthenticatedUserById(
  userId: string,
): Promise<AuthenticatedUserJoinedRow | null> {
  const db = getDb();
  const rows = await db
    .select({
      user: applicationUsers,
      employeeId: employees.id,
      employeeCode: employees.employeeCode,
      employeeName: employees.employeeName,
      employeeIsActive: employees.isActive,
      branchId: branches.id,
      branchCode: branches.branchCode,
      branchName: branches.branchName,
    })
    .from(applicationUsers)
    .leftJoin(employees, eq(applicationUsers.employeeId, employees.id))
    .leftJoin(branches, eq(employees.branchId, branches.id))
    .where(eq(applicationUsers.id, userId))
    .limit(1);

  return rows[0] ?? null;
}

function sessionDurationMs(env: Env): number {
  return env.SESSION_DURATION_HOURS * 60 * 60 * 1000;
}

async function recordFailedLogin(userId: string): Promise<void> {
  const db = getDb();
  const lockedUntil = sql`CASE
    WHEN ${applicationUsers.failedLoginAttempts} + 1 >= ${LOGIN_MAX_FAILED_ATTEMPTS}
    THEN NOW() + (${LOGIN_LOCKOUT_MINUTES} * INTERVAL '1 minute')
    ELSE ${applicationUsers.lockedUntil}
  END`;

  await db
    .update(applicationUsers)
    .set({
      failedLoginAttempts: sql`${applicationUsers.failedLoginAttempts} + 1`,
      lockedUntil,
      updatedAt: sql`NOW()`,
    })
    .where(eq(applicationUsers.id, userId));
}

async function resetLoginFailures(userId: string): Promise<void> {
  const db = getDb();
  await db
    .update(applicationUsers)
    .set({
      failedLoginAttempts: 0,
      lockedUntil: null,
      lastLoginAt: sql`NOW()`,
      updatedAt: sql`NOW()`,
    })
    .where(eq(applicationUsers.id, userId));
}

export async function login(
  input: LoginInput,
  env: Env,
  meta: { userAgent?: string; ipAddress?: string },
): Promise<{ user: AuthenticatedUser; sessionToken: string }> {
  const db = getDb();
  const usernameLower = input.username.toLowerCase();

  const rows = await db
    .select({
      user: applicationUsers,
      employeeId: employees.id,
      employeeCode: employees.employeeCode,
      employeeName: employees.employeeName,
      employeeIsActive: employees.isActive,
      branchId: branches.id,
      branchCode: branches.branchCode,
      branchName: branches.branchName,
    })
    .from(applicationUsers)
    .leftJoin(employees, eq(applicationUsers.employeeId, employees.id))
    .leftJoin(branches, eq(employees.branchId, branches.id))
    .where(sql`lower(${applicationUsers.username}) = ${usernameLower}`)
    .limit(1);

  const row = rows[0];
  const passwordOk = await verifyPasswordOrDummy(
    row?.user.passwordHash,
    input.password,
  );

  if (!row) {
    throw new AppError(INVALID_CREDENTIALS_MESSAGE, 401);
  }

  const now = new Date();
  if (row.user.lockedUntil && row.user.lockedUntil > now) {
    throw new AppError(INVALID_CREDENTIALS_MESSAGE, 401);
  }

  if (!passwordOk) {
    await recordFailedLogin(row.user.id);
    throw new AppError(INVALID_CREDENTIALS_MESSAGE, 401);
  }

  if (!row.user.isActive || isLinkedEmployeeInactive(row)) {
    throw new AppError(INVALID_CREDENTIALS_MESSAGE, 401);
  }

  const roles = await loadRolesForUser(row.user.id);
  if (roles.length === 0) {
    throw new AppError(INVALID_CREDENTIALS_MESSAGE, 401);
  }

  await resetLoginFailures(row.user.id);

  const sessionToken = generateSessionToken();
  const tokenHash = hashSessionToken(sessionToken);
  const expiresAt = new Date(Date.now() + sessionDurationMs(env));

  await db.insert(authSessions).values({
    userId: row.user.id,
    tokenHash,
    expiresAt,
    userAgent: meta.userAgent?.slice(0, 512) || null,
    ipAddress: meta.ipAddress?.slice(0, 45) || null,
  });

  const refreshed = await loadAuthenticatedUserById(row.user.id);
  if (!refreshed) {
    throw new AppError("Internal server error", 500);
  }

  return {
    user: toAuthenticatedUser(refreshed, roles),
    sessionToken,
  };
}

export async function resolveSession(
  rawToken: string | undefined,
  env: Env,
): Promise<AuthContext | null> {
  if (!rawToken || rawToken.length < 16 || rawToken.length > 256) {
    return null;
  }

  const db = getDb();
  const tokenHash = hashSessionToken(rawToken);
  const now = new Date();

  const rows = await db
    .select({
      sessionId: authSessions.id,
      sessionExpiresAt: authSessions.expiresAt,
      sessionRevokedAt: authSessions.revokedAt,
      sessionLastSeenAt: authSessions.lastSeenAt,
      user: applicationUsers,
      employeeId: employees.id,
      employeeCode: employees.employeeCode,
      employeeName: employees.employeeName,
      employeeIsActive: employees.isActive,
      branchId: branches.id,
      branchCode: branches.branchCode,
      branchName: branches.branchName,
    })
    .from(authSessions)
    .innerJoin(applicationUsers, eq(authSessions.userId, applicationUsers.id))
    .leftJoin(employees, eq(applicationUsers.employeeId, employees.id))
    .leftJoin(branches, eq(employees.branchId, branches.id))
    .where(eq(authSessions.tokenHash, tokenHash))
    .limit(1);

  const row = rows[0];
  if (!row) {
    return null;
  }

  if (row.sessionRevokedAt || row.sessionExpiresAt <= now) {
    return null;
  }

  if (!row.user.isActive || isLinkedEmployeeInactive(row)) {
    return null;
  }

  const roles = await loadRolesForUser(row.user.id);
  if (roles.length === 0) {
    return null;
  }

  const throttleMs = env.SESSION_LAST_SEEN_THROTTLE_SECONDS * 1000;
  const shouldUpdateLastSeen =
    !row.sessionLastSeenAt ||
    now.getTime() - row.sessionLastSeenAt.getTime() >= throttleMs;

  if (shouldUpdateLastSeen) {
    await db
      .update(authSessions)
      .set({ lastSeenAt: now })
      .where(
        and(
          eq(authSessions.id, row.sessionId),
          isNull(authSessions.revokedAt),
          gt(authSessions.expiresAt, now),
        ),
      );
  }

  return {
    sessionId: row.sessionId,
    user: toAuthenticatedUser(
      {
        user: row.user,
        employeeId: row.employeeId,
        employeeCode: row.employeeCode,
        employeeName: row.employeeName,
        employeeIsActive: row.employeeIsActive,
        branchId: row.branchId,
        branchCode: row.branchCode,
        branchName: row.branchName,
      },
      roles,
    ),
  };
}

export async function logout(rawToken: string | undefined): Promise<void> {
  if (!rawToken) {
    return;
  }

  const tokenHash = hashSessionToken(rawToken);
  const db = getDb();
  await db
    .update(authSessions)
    .set({ revokedAt: sql`NOW()` })
    .where(
      and(eq(authSessions.tokenHash, tokenHash), isNull(authSessions.revokedAt)),
    );
}

export async function getCurrentUser(
  rawToken: string | undefined,
  env: Env,
): Promise<AuthenticatedUser> {
  const auth = await resolveSession(rawToken, env);
  if (!auth) {
    throw new AppError("Unauthorized", 401);
  }
  return auth.user;
}

/**
 * Changes the initial password for the authenticated user.
 * Policy: the current session remains active; all other sessions are revoked.
 */
export async function changeInitialPassword(
  auth: AuthContext,
  input: ChangeInitialPasswordInput,
): Promise<AuthenticatedUser> {
  const db = getDb();

  const userRows = await db
    .select()
    .from(applicationUsers)
    .where(eq(applicationUsers.id, auth.user.id))
    .limit(1);

  const user = userRows[0];
  if (!user || !user.isActive) {
    throw new AppError("Unauthorized", 401);
  }

  const currentOk = await verifyPassword(user.passwordHash, input.currentPassword);
  if (!currentOk) {
    throw new AppError("Current password is incorrect", 400);
  }

  if (input.newPassword === input.currentPassword) {
    throw new AppError("New password must be different from the current password", 400);
  }

  const newHash = await hashPassword(input.newPassword);

  await db.transaction(async (tx) => {
    await tx
      .update(applicationUsers)
      .set({
        passwordHash: newHash,
        mustChangePassword: false,
        passwordChangedAt: sql`NOW()`,
        updatedAt: sql`NOW()`,
        failedLoginAttempts: 0,
        lockedUntil: null,
      })
      .where(eq(applicationUsers.id, auth.user.id));

    await tx
      .update(authSessions)
      .set({ revokedAt: sql`NOW()` })
      .where(
        and(
          eq(authSessions.userId, auth.user.id),
          isNull(authSessions.revokedAt),
          ne(authSessions.id, auth.sessionId),
        ),
      );
  });

  const refreshed = await loadAuthenticatedUserById(auth.user.id);
  if (!refreshed) {
    throw new AppError("Unauthorized", 401);
  }

  const roles = await loadRolesForUser(auth.user.id);
  return toAuthenticatedUser(refreshed, roles);
}

export async function cleanupExpiredSessions(): Promise<number> {
  const db = getDb();
  const result = await db
    .delete(authSessions)
    .where(
      or(
        lt(authSessions.expiresAt, sql`NOW()`),
        and(
          sql`${authSessions.revokedAt} IS NOT NULL`,
          lt(authSessions.revokedAt, sql`NOW() - INTERVAL '30 days'`),
        ),
      ),
    )
    .returning({ id: authSessions.id });

  return result.length;
}

/**
 * Creates the first independent system Admin (`employee_id = NULL`).
 * Refuses if any application user already exists.
 * Not a general Admin-creation API.
 */
export async function createBootstrapAdmin(input: {
  username: string;
  password: string;
}): Promise<{ userId: string; username: string }> {
  const db = getDb();
  const username = input.username.trim();

  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(${BOOTSTRAP_ADMIN_ADVISORY_LOCK_KEY})`,
    );

    const existingUsers = await tx
      .select({ id: applicationUsers.id })
      .from(applicationUsers)
      .limit(1);

    if (existingUsers[0]) {
      throw new AppError(
        "Bootstrap Admin refused: an application user already exists",
        409,
      );
    }

    const passwordHash = await hashPassword(input.password);

    const inserted = await tx
      .insert(applicationUsers)
      .values({
        employeeId: null,
        username,
        passwordHash,
        mustChangePassword: true,
        isActive: true,
      })
      .returning({ id: applicationUsers.id, username: applicationUsers.username });

    const created = inserted[0];
    if (!created) {
      throw new AppError("Failed to create application user", 500);
    }

    await tx.insert(userRoles).values({
      userId: created.id,
      role: "ADMIN",
    });

    return {
      userId: created.id,
      username: created.username,
    };
  });
}
