import { and, asc, count, eq, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm";
import type {
  AppRole,
  ApplicationUser,
  ApplicationUserListQuery,
  CreateApplicationUserInput,
  EligibleEmployeeListQuery,
  Employee,
  PaginatedApplicationUserResponse,
  PaginatedEligibleEmployeeResponse,
  ResetApplicationUserPasswordInput,
  UpdateApplicationUserInput,
  UpdateApplicationUserStatusInput,
} from "@printing-stationery/shared";
import { getDb } from "../db/client.js";
import {
  applicationUsers,
  userRoles,
  authSessions,
  type ApplicationUserRow,
} from "../db/schema/auth.js";
import { branches } from "../db/schema/branches.js";
import { employees, type EmployeeRow } from "../db/schema/employees.js";
import { AppError } from "../utils/errors.js";
import { mapApplicationUserDatabaseError } from "../utils/db-errors.js";
import { hashPassword } from "../utils/password.js";

type ApplicationUserJoinedRow = {
  user: ApplicationUserRow;
  role: AppRole;
  employee: EmployeeRow;
  branchId: string;
  branchCode: string;
  branchName: string;
  branchIsActive: boolean;
};

type EmployeeJoinedRow = {
  employee: EmployeeRow;
  branchId: string;
  branchCode: string;
  branchName: string;
  branchIsActive: boolean;
};

function toApplicationUser(row: ApplicationUserJoinedRow): ApplicationUser {
  if (!row.user.employeeId) {
    throw new AppError("Application user is not linked to an employee", 500);
  }

  return {
    id: row.user.id,
    employeeId: row.user.employeeId,
    username: row.user.username,
    role: row.role,
    isActive: row.user.isActive,
    mustChangePassword: row.user.mustChangePassword,
    createdAt: row.user.createdAt.toISOString(),
    updatedAt: row.user.updatedAt.toISOString(),
    employee: {
      id: row.employee.id,
      employeeCode: row.employee.employeeCode,
      employeeName: row.employee.employeeName,
      branchId: row.employee.branchId,
      isActive: row.employee.isActive,
      branch: {
        id: row.branchId,
        branchCode: row.branchCode,
        branchName: row.branchName,
        isActive: row.branchIsActive,
      },
    },
  };
}

function toEmployee(row: EmployeeJoinedRow): Employee {
  return {
    id: row.employee.id,
    employeeCode: row.employee.employeeCode,
    employeeName: row.employee.employeeName,
    branchId: row.employee.branchId,
    isActive: row.employee.isActive,
    createdAt: row.employee.createdAt.toISOString(),
    updatedAt: row.employee.updatedAt.toISOString(),
    branch: {
      id: row.branchId,
      branchCode: row.branchCode,
      branchName: row.branchName,
      isActive: row.branchIsActive,
    },
  };
}

function escapeIlikePattern(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function buildListFilters(query: ApplicationUserListQuery): SQL | undefined {
  const conditions: SQL[] = [isNotNull(applicationUsers.employeeId)];

  if (query.status === "ACTIVE") {
    conditions.push(eq(applicationUsers.isActive, true));
  } else if (query.status === "INACTIVE") {
    conditions.push(eq(applicationUsers.isActive, false));
  }

  if (query.role) {
    conditions.push(eq(userRoles.role, query.role));
  }

  if (query.branchId) {
    conditions.push(eq(employees.branchId, query.branchId));
  }

  if (query.search) {
    const pattern = `%${escapeIlikePattern(query.search)}%`;
    const searchCondition = or(
      sql`${applicationUsers.username} ILIKE ${pattern} ESCAPE '\\'`,
      sql`${employees.employeeCode} ILIKE ${pattern} ESCAPE '\\'`,
      sql`${employees.employeeName} ILIKE ${pattern} ESCAPE '\\'`,
    );

    if (searchCondition) {
      conditions.push(searchCondition);
    }
  }

  return conditions.length === 1 ? conditions[0] : and(...conditions);
}

const applicationUserSelect = {
  user: applicationUsers,
  role: userRoles.role,
  employee: employees,
  branchId: branches.id,
  branchCode: branches.branchCode,
  branchName: branches.branchName,
  branchIsActive: branches.isActive,
};

const employeeSelect = {
  employee: employees,
  branchId: branches.id,
  branchCode: branches.branchCode,
  branchName: branches.branchName,
  branchIsActive: branches.isActive,
};

async function findUserByUsernameInsensitive(
  username: string,
  excludeId?: string,
): Promise<ApplicationUserRow | undefined> {
  const conditions: SQL[] = [
    sql`lower(${applicationUsers.username}) = ${username.toLowerCase()}`,
  ];

  if (excludeId) {
    conditions.push(sql`${applicationUsers.id} <> ${excludeId}`);
  }

  const where =
    conditions.length === 1 ? conditions[0]! : and(...conditions)!;

  try {
    const rows = await getDb()
      .select()
      .from(applicationUsers)
      .where(where)
      .limit(1);
    return rows[0];
  } catch (error) {
    mapApplicationUserDatabaseError(error);
  }
}

async function getJoinedApplicationUserById(
  id: string,
): Promise<ApplicationUserJoinedRow | undefined> {
  const rows = await getDb()
    .select(applicationUserSelect)
    .from(applicationUsers)
    .innerJoin(userRoles, eq(userRoles.userId, applicationUsers.id))
    .innerJoin(employees, eq(applicationUsers.employeeId, employees.id))
    .innerJoin(branches, eq(employees.branchId, branches.id))
    .where(
      and(eq(applicationUsers.id, id), isNotNull(applicationUsers.employeeId)),
    )
    .limit(1);

  return rows[0];
}

async function revokeAllSessions(userId: string): Promise<void> {
  await getDb()
    .update(authSessions)
    .set({ revokedAt: sql`now()` })
    .where(
      and(eq(authSessions.userId, userId), isNull(authSessions.revokedAt)),
    );
}

export async function listApplicationUsers(
  query: ApplicationUserListQuery,
): Promise<PaginatedApplicationUserResponse> {
  const where = buildListFilters(query);

  try {
    const countBase = getDb()
      .select({ value: count() })
      .from(applicationUsers)
      .innerJoin(userRoles, eq(userRoles.userId, applicationUsers.id))
      .innerJoin(employees, eq(applicationUsers.employeeId, employees.id))
      .innerJoin(branches, eq(employees.branchId, branches.id));

    const countRows = where ? await countBase.where(where) : await countBase;
    const totalItems = countRows[0]?.value ?? 0;

    const totalPages =
      totalItems === 0 ? 0 : Math.ceil(totalItems / query.pageSize);
    const offset = (query.page - 1) * query.pageSize;

    const listBase = getDb()
      .select(applicationUserSelect)
      .from(applicationUsers)
      .innerJoin(userRoles, eq(userRoles.userId, applicationUsers.id))
      .innerJoin(employees, eq(applicationUsers.employeeId, employees.id))
      .innerJoin(branches, eq(employees.branchId, branches.id))
      .orderBy(
        asc(employees.employeeName),
        asc(applicationUsers.username),
        asc(applicationUsers.id),
      )
      .limit(query.pageSize)
      .offset(offset);

    const rows = where ? await listBase.where(where) : await listBase;

    return {
      items: rows.map(toApplicationUser),
      page: query.page,
      pageSize: query.pageSize,
      totalItems,
      totalPages,
    };
  } catch (error) {
    mapApplicationUserDatabaseError(error);
  }
}

export async function getApplicationUserById(
  id: string,
): Promise<ApplicationUser> {
  try {
    const row = await getJoinedApplicationUserById(id);
    if (!row) {
      throw new AppError("Application user not found", 404);
    }

    return toApplicationUser(row);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    mapApplicationUserDatabaseError(error);
  }
}

export async function listEligibleEmployees(
  query: EligibleEmployeeListQuery,
): Promise<PaginatedEligibleEmployeeResponse> {
  const conditions: SQL[] = [
    eq(employees.isActive, true),
    isNull(applicationUsers.id),
  ];

  if (query.search) {
    const pattern = `%${escapeIlikePattern(query.search)}%`;
    const searchCondition = or(
      sql`${employees.employeeCode} ILIKE ${pattern} ESCAPE '\\'`,
      sql`${employees.employeeName} ILIKE ${pattern} ESCAPE '\\'`,
    );
    if (searchCondition) {
      conditions.push(searchCondition);
    }
  }

  const where = conditions.length === 1 ? conditions[0] : and(...conditions);

  try {
    const countRows = await getDb()
      .select({ value: count() })
      .from(employees)
      .innerJoin(branches, eq(employees.branchId, branches.id))
      .leftJoin(
        applicationUsers,
        eq(applicationUsers.employeeId, employees.id),
      )
      .where(where);

    const totalItems = countRows[0]?.value ?? 0;
    const totalPages =
      totalItems === 0 ? 0 : Math.ceil(totalItems / query.pageSize);
    const offset = (query.page - 1) * query.pageSize;

    const rows = await getDb()
      .select(employeeSelect)
      .from(employees)
      .innerJoin(branches, eq(employees.branchId, branches.id))
      .leftJoin(
        applicationUsers,
        eq(applicationUsers.employeeId, employees.id),
      )
      .where(where)
      .orderBy(
        asc(employees.employeeName),
        asc(employees.employeeCode),
        asc(employees.id),
      )
      .limit(query.pageSize)
      .offset(offset);

    return {
      items: rows.map(toEmployee),
      page: query.page,
      pageSize: query.pageSize,
      totalItems,
      totalPages,
    };
  } catch (error) {
    mapApplicationUserDatabaseError(error);
  }
}

export async function createApplicationUser(
  input: CreateApplicationUserInput,
): Promise<ApplicationUser> {
  const employeeRows = await getDb()
    .select()
    .from(employees)
    .where(eq(employees.id, input.employeeId))
    .limit(1);

  const employee = employeeRows[0];
  if (!employee) {
    throw new AppError("Selected employee was not found.", 400);
  }

  if (!employee.isActive) {
    throw new AppError(
      "Inactive employees cannot receive an application account.",
      400,
    );
  }

  const existingEmployeeAccount = await getDb()
    .select({ id: applicationUsers.id })
    .from(applicationUsers)
    .where(eq(applicationUsers.employeeId, input.employeeId))
    .limit(1);

  if (existingEmployeeAccount[0]) {
    throw new AppError("This employee already has an application account.", 409);
  }

  const existingUsername = await findUserByUsernameInsensitive(input.username);
  if (existingUsername) {
    throw new AppError("A user with this username already exists.", 409);
  }

  const passwordHash = await hashPassword(input.temporaryPassword);

  try {
    const createdId = await getDb().transaction(async (tx) => {
      const inserted = await tx
        .insert(applicationUsers)
        .values({
          employeeId: input.employeeId,
          username: input.username,
          passwordHash,
          mustChangePassword: true,
          isActive: true,
        })
        .returning({ id: applicationUsers.id });

      const created = inserted[0];
      if (!created) {
        throw new AppError("Failed to create application user", 500);
      }

      await tx.insert(userRoles).values({
        userId: created.id,
        role: input.role,
      });

      return created.id;
    });

    return getApplicationUserById(createdId);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    mapApplicationUserDatabaseError(error);
  }
}

export async function updateApplicationUser(
  id: string,
  input: UpdateApplicationUserInput,
  actorUserId: string,
): Promise<ApplicationUser> {
  await getApplicationUserById(id);

  if (id === actorUserId && input.role !== "ADMIN") {
    throw new AppError("You cannot change your own application role.", 400);
  }

  const existingUsername = await findUserByUsernameInsensitive(
    input.username,
    id,
  );
  if (existingUsername) {
    throw new AppError("A user with this username already exists.", 409);
  }

  try {
    await getDb().transaction(async (tx) => {
      const updated = await tx
        .update(applicationUsers)
        .set({
          username: input.username,
          updatedAt: sql`now()`,
        })
        .where(
          and(
            eq(applicationUsers.id, id),
            isNotNull(applicationUsers.employeeId),
          ),
        )
        .returning({ id: applicationUsers.id });

      if (!updated[0]) {
        throw new AppError("Application user not found", 404);
      }

      await tx.delete(userRoles).where(eq(userRoles.userId, id));
      await tx.insert(userRoles).values({
        userId: id,
        role: input.role,
      });
    });

    return getApplicationUserById(id);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    mapApplicationUserDatabaseError(error);
  }
}

export async function updateApplicationUserStatus(
  id: string,
  input: UpdateApplicationUserStatusInput,
  actorUserId: string,
): Promise<ApplicationUser> {
  const existing = await getApplicationUserById(id);

  if (id === actorUserId && !input.isActive) {
    throw new AppError("You cannot deactivate your own account.", 400);
  }

  if (input.isActive && !existing.employee.isActive) {
    throw new AppError(
      "Cannot activate an account whose employee is inactive.",
      400,
    );
  }

  try {
    const rows = await getDb()
      .update(applicationUsers)
      .set({
        isActive: input.isActive,
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(applicationUsers.id, id),
          isNotNull(applicationUsers.employeeId),
        ),
      )
      .returning({ id: applicationUsers.id });

    const updated = rows[0];
    if (!updated) {
      throw new AppError("Application user not found", 404);
    }

    if (!input.isActive) {
      await revokeAllSessions(id);
    }

    return getApplicationUserById(updated.id);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    mapApplicationUserDatabaseError(error);
  }
}

export async function resetApplicationUserPassword(
  id: string,
  input: ResetApplicationUserPasswordInput,
): Promise<ApplicationUser> {
  await getApplicationUserById(id);

  const passwordHash = await hashPassword(input.temporaryPassword);

  try {
    const rows = await getDb()
      .update(applicationUsers)
      .set({
        passwordHash,
        mustChangePassword: true,
        passwordChangedAt: null,
        failedLoginAttempts: 0,
        lockedUntil: null,
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(applicationUsers.id, id),
          isNotNull(applicationUsers.employeeId),
        ),
      )
      .returning({ id: applicationUsers.id });

    const updated = rows[0];
    if (!updated) {
      throw new AppError("Application user not found", 404);
    }

    await revokeAllSessions(id);

    return getApplicationUserById(updated.id);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    mapApplicationUserDatabaseError(error);
  }
}
