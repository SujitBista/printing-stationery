import { and, asc, count, desc, eq, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type {
  AppRole,
  CreateEmployeeInput,
  Employee,
  EmployeeListQuery,
  EmployeeTransfer,
  EmployeeTransferAssignment,
  EmployeeTransferBlocker,
  EmployeeTransferContext,
  EmployeeTransferListResponse,
  PaginatedEmployeeResponse,
  TransferEmployeeInput,
  UpdateEmployeeInput,
  UpdateEmployeeStatusInput,
} from "@printing-stationery/shared";
import { isStoreManagingRole } from "@printing-stationery/shared";
import { getDb } from "../db/client.js";
import { applicationUsers, userRoles } from "../db/schema/auth.js";
import { branches } from "../db/schema/branches.js";
import { employees, type EmployeeRow } from "../db/schema/employees.js";
import { employeeTransfers } from "../db/schema/employee-transfers.js";
import { stores } from "../db/schema/stores.js";
import { storeUsers } from "../db/schema/store-users.js";
import { AppError } from "../utils/errors.js";
import { mapEmployeeDatabaseError } from "../utils/db-errors.js";
import {
  removeUserFromStoreAssignments,
  setStoreAssignmentSupervisor,
  syncApplicationUserStoreAssignment,
} from "./store-users.assignment.js";

const fromBranches = alias(branches, "transfer_from_branches");
const toBranches = alias(branches, "transfer_to_branches");
const fromStores = alias(stores, "transfer_from_stores");
const toStores = alias(stores, "transfer_to_stores");
const fromSupervisors = alias(applicationUsers, "transfer_from_supervisors");
const toSupervisors = alias(applicationUsers, "transfer_to_supervisors");
const fromSupervisorEmployees = alias(
  employees,
  "transfer_from_supervisor_employees",
);
const toSupervisorEmployees = alias(
  employees,
  "transfer_to_supervisor_employees",
);
const transferredByUsers = alias(applicationUsers, "transfer_transferred_by_users");
const transferredByEmployees = alias(
  employees,
  "transfer_transferred_by_employees",
);
const assignmentSupervisors = alias(applicationUsers, "assignment_supervisors");
const assignmentSupervisorEmployees = alias(
  employees,
  "assignment_supervisor_employees",
);

type EmployeeJoinedRow = {
  employee: EmployeeRow;
  branchId: string;
  branchCode: string;
  branchName: string;
  branchIsActive: boolean;
};

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

function buildListFilters(query: EmployeeListQuery): SQL | undefined {
  const conditions: SQL[] = [];

  if (query.status === "ACTIVE") {
    conditions.push(eq(employees.isActive, true));
  } else if (query.status === "INACTIVE") {
    conditions.push(eq(employees.isActive, false));
  }

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

  if (query.branchId) {
    conditions.push(eq(employees.branchId, query.branchId));
  }

  if (conditions.length === 0) {
    return undefined;
  }

  return conditions.length === 1 ? conditions[0] : and(...conditions);
}

const employeeSelect = {
  employee: employees,
  branchId: branches.id,
  branchCode: branches.branchCode,
  branchName: branches.branchName,
  branchIsActive: branches.isActive,
};

async function findEmployeeByCodeInsensitive(
  employeeCode: string,
  excludeId?: string,
): Promise<EmployeeRow | undefined> {
  const conditions: SQL[] = [
    sql`lower(${employees.employeeCode}) = ${employeeCode.toLowerCase()}`,
  ];

  if (excludeId) {
    conditions.push(sql`${employees.id} <> ${excludeId}`);
  }

  const where =
    conditions.length === 1 ? conditions[0]! : and(...conditions)!;

  try {
    const rows = await getDb().select().from(employees).where(where).limit(1);
    return rows[0];
  } catch (error) {
    mapEmployeeDatabaseError(error);
  }
}

async function getJoinedEmployeeById(
  id: string,
): Promise<EmployeeJoinedRow | undefined> {
  const rows = await getDb()
    .select(employeeSelect)
    .from(employees)
    .innerJoin(branches, eq(employees.branchId, branches.id))
    .where(eq(employees.id, id))
    .limit(1);

  return rows[0];
}

async function assertBranchForSave(
  branchId: string,
  previousBranchId?: string,
): Promise<void> {
  const rows = await getDb()
    .select()
    .from(branches)
    .where(eq(branches.id, branchId))
    .limit(1);

  const branch = rows[0];
  if (!branch) {
    throw new AppError("Selected branch was not found.", 400);
  }

  const isUnchanged =
    previousBranchId !== undefined && previousBranchId === branchId;
  if (!isUnchanged && !branch.isActive) {
    throw new AppError("Selected branch is inactive.", 400);
  }
}

export async function listEmployees(
  query: EmployeeListQuery,
): Promise<PaginatedEmployeeResponse> {
  const where = buildListFilters(query);

  try {
    const countBase = getDb()
      .select({ value: count() })
      .from(employees)
      .innerJoin(branches, eq(employees.branchId, branches.id));

    const countRows = where ? await countBase.where(where) : await countBase;
    const totalItems = countRows[0]?.value ?? 0;

    const totalPages =
      totalItems === 0 ? 0 : Math.ceil(totalItems / query.pageSize);
    const offset = (query.page - 1) * query.pageSize;

    const listBase = getDb()
      .select(employeeSelect)
      .from(employees)
      .innerJoin(branches, eq(employees.branchId, branches.id))
      .orderBy(
        asc(employees.employeeName),
        asc(employees.employeeCode),
        asc(employees.id),
      )
      .limit(query.pageSize)
      .offset(offset);

    const rows = where ? await listBase.where(where) : await listBase;

    return {
      items: rows.map(toEmployee),
      page: query.page,
      pageSize: query.pageSize,
      totalItems,
      totalPages,
    };
  } catch (error) {
    mapEmployeeDatabaseError(error);
  }
}

export async function getEmployeeById(id: string): Promise<Employee> {
  try {
    const row = await getJoinedEmployeeById(id);
    if (!row) {
      throw new AppError("Employee not found", 404);
    }

    return toEmployee(row);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    mapEmployeeDatabaseError(error);
  }
}

export async function createEmployee(
  input: CreateEmployeeInput,
): Promise<Employee> {
  await assertBranchForSave(input.branchId);

  const existingCode = await findEmployeeByCodeInsensitive(input.employeeCode);
  if (existingCode) {
    throw new AppError("An employee with this code already exists.", 409);
  }

  try {
    const rows = await getDb()
      .insert(employees)
      .values({
        employeeCode: input.employeeCode,
        employeeName: input.employeeName,
        branchId: input.branchId,
        isActive: input.isActive,
      })
      .returning({ id: employees.id });

    const created = rows[0];
    if (!created) {
      throw new AppError("Failed to create employee", 500);
    }

    return getEmployeeById(created.id);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    mapEmployeeDatabaseError(error);
  }
}

function localIsoDate(value = new Date()): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toTransferPerson(params: {
  id: string;
  username: string;
  employeeName?: string | null;
  employeeCode?: string | null;
}) {
  return {
    id: params.id,
    username: params.username,
    employeeName: params.employeeName ?? null,
    employeeCode: params.employeeCode ?? null,
  };
}

function toTransferStore(params: {
  id: string;
  storeCode: string;
  storeName: string;
  isActive: boolean;
}) {
  return {
    id: params.id,
    storeCode: params.storeCode,
    storeName: params.storeName,
    isActive: params.isActive,
  };
}

async function getApplicationUserForEmployee(employeeId: string): Promise<{
  id: string;
  username: string;
  roles: AppRole[];
} | null> {
  const rows = await getDb()
    .select({
      id: applicationUsers.id,
      username: applicationUsers.username,
    })
    .from(applicationUsers)
    .where(eq(applicationUsers.employeeId, employeeId))
    .limit(1);

  const user = rows[0];
  if (!user) {
    return null;
  }

  const roleRows = await getDb()
    .select({ role: userRoles.role })
    .from(userRoles)
    .where(eq(userRoles.userId, user.id));

  return {
    id: user.id,
    username: user.username,
    roles: roleRows.map((row) => row.role),
  };
}

async function loadActiveAssignments(applicationUserId: string) {
  return getDb()
    .select({
      assignment: storeUsers,
      store: stores,
      supervisor: assignmentSupervisors,
      supervisorEmployee: assignmentSupervisorEmployees,
    })
    .from(storeUsers)
    .innerJoin(stores, eq(storeUsers.storeId, stores.id))
    .leftJoin(
      assignmentSupervisors,
      eq(storeUsers.supervisorApplicationUserId, assignmentSupervisors.id),
    )
    .leftJoin(
      assignmentSupervisorEmployees,
      eq(assignmentSupervisors.employeeId, assignmentSupervisorEmployees.id),
    )
    .where(
      and(
        eq(storeUsers.isActive, true),
        or(
          eq(storeUsers.makerApplicationUserId, applicationUserId),
          eq(storeUsers.supervisorApplicationUserId, applicationUserId),
        ),
      ),
    );
}

function toCurrentAssignment(
  rows: Awaited<ReturnType<typeof loadActiveAssignments>>,
  applicationUserId: string,
): EmployeeTransferAssignment | null {
  if (rows.length === 0) {
    return null;
  }

  const preferred =
    rows.find(
      (row) => row.assignment.makerApplicationUserId === applicationUserId,
    ) ?? rows[0]!;

  return {
    role:
      preferred.assignment.makerApplicationUserId === applicationUserId
        ? "MAKER"
        : "SUPERVISOR",
    store: toTransferStore(preferred.store),
    supervisor: preferred.supervisor
      ? toTransferPerson({
          id: preferred.supervisor.id,
          username: preferred.supervisor.username,
          employeeName: preferred.supervisorEmployee?.employeeName,
          employeeCode: preferred.supervisorEmployee?.employeeCode,
        })
      : null,
  };
}

export async function getEmployeeTransferContext(
  id: string,
): Promise<EmployeeTransferContext> {
  const employee = await getEmployeeById(id);
  const blockers: EmployeeTransferBlocker[] = [];

  if (!employee.isActive) {
    blockers.push({
      code: "EMPLOYEE_INACTIVE",
      message:
        "Activate the employee before transferring them to another branch.",
    });
  }

  const applicationUser = await getApplicationUserForEmployee(id);
  const assignmentRows = applicationUser
    ? await loadActiveAssignments(applicationUser.id)
    : [];

  const latestRows = await getDb()
    .select({ effectiveDate: employeeTransfers.effectiveDate })
    .from(employeeTransfers)
    .where(eq(employeeTransfers.employeeId, id))
    .orderBy(
      desc(employeeTransfers.effectiveDate),
      desc(employeeTransfers.createdAt),
    )
    .limit(1);

  return {
    employee,
    canTransfer: blockers.length === 0,
    blockers,
    currentAssignment: applicationUser
      ? toCurrentAssignment(assignmentRows, applicationUser.id)
      : null,
    applicationUser,
    latestEffectiveDate: latestRows[0]?.effectiveDate ?? null,
  };
}

export async function listEmployeeTransfers(
  employeeId: string,
): Promise<EmployeeTransferListResponse> {
  await getEmployeeById(employeeId);

  try {
    const rows = await getDb()
      .select({
        transfer: employeeTransfers,
        fromBranch: fromBranches,
        toBranch: toBranches,
        fromStore: fromStores,
        toStore: toStores,
        fromSupervisor: fromSupervisors,
        fromSupervisorEmployee: fromSupervisorEmployees,
        toSupervisor: toSupervisors,
        toSupervisorEmployee: toSupervisorEmployees,
        transferredBy: transferredByUsers,
        transferredByEmployee: transferredByEmployees,
      })
      .from(employeeTransfers)
      .innerJoin(
        fromBranches,
        eq(employeeTransfers.fromBranchId, fromBranches.id),
      )
      .innerJoin(toBranches, eq(employeeTransfers.toBranchId, toBranches.id))
      .innerJoin(
        transferredByUsers,
        eq(
          employeeTransfers.transferredByApplicationUserId,
          transferredByUsers.id,
        ),
      )
      .leftJoin(
        transferredByEmployees,
        eq(transferredByUsers.employeeId, transferredByEmployees.id),
      )
      .leftJoin(fromStores, eq(employeeTransfers.fromStoreId, fromStores.id))
      .leftJoin(toStores, eq(employeeTransfers.toStoreId, toStores.id))
      .leftJoin(
        fromSupervisors,
        eq(
          employeeTransfers.fromSupervisorApplicationUserId,
          fromSupervisors.id,
        ),
      )
      .leftJoin(
        fromSupervisorEmployees,
        eq(fromSupervisors.employeeId, fromSupervisorEmployees.id),
      )
      .leftJoin(
        toSupervisors,
        eq(employeeTransfers.toSupervisorApplicationUserId, toSupervisors.id),
      )
      .leftJoin(
        toSupervisorEmployees,
        eq(toSupervisors.employeeId, toSupervisorEmployees.id),
      )
      .where(eq(employeeTransfers.employeeId, employeeId))
      .orderBy(
        desc(employeeTransfers.effectiveDate),
        desc(employeeTransfers.createdAt),
        desc(employeeTransfers.id),
      );

    const items: EmployeeTransfer[] = rows.map((row) => ({
      id: row.transfer.id,
      employeeId: row.transfer.employeeId,
      fromBranch: {
        id: row.fromBranch.id,
        branchCode: row.fromBranch.branchCode,
        branchName: row.fromBranch.branchName,
        isActive: row.fromBranch.isActive,
      },
      toBranch: {
        id: row.toBranch.id,
        branchCode: row.toBranch.branchCode,
        branchName: row.toBranch.branchName,
        isActive: row.toBranch.isActive,
      },
      effectiveDate: row.transfer.effectiveDate,
      reason: row.transfer.reason,
      transferredBy: toTransferPerson({
        id: row.transferredBy.id,
        username: row.transferredBy.username,
        employeeName: row.transferredByEmployee?.employeeName,
        employeeCode: row.transferredByEmployee?.employeeCode,
      }),
      fromStore: row.fromStore ? toTransferStore(row.fromStore) : null,
      toStore: row.toStore ? toTransferStore(row.toStore) : null,
      fromSupervisor: row.fromSupervisor
        ? toTransferPerson({
            id: row.fromSupervisor.id,
            username: row.fromSupervisor.username,
            employeeName: row.fromSupervisorEmployee?.employeeName,
            employeeCode: row.fromSupervisorEmployee?.employeeCode,
          })
        : null,
      toSupervisor: row.toSupervisor
        ? toTransferPerson({
            id: row.toSupervisor.id,
            username: row.toSupervisor.username,
            employeeName: row.toSupervisorEmployee?.employeeName,
            employeeCode: row.toSupervisorEmployee?.employeeCode,
          })
        : null,
      createdAt: row.transfer.createdAt.toISOString(),
    }));

    return { items };
  } catch (error) {
    mapEmployeeDatabaseError(error);
  }
}

async function assertDestinationStore(params: {
  storeId: string;
  toBranchId: string;
}): Promise<void> {
  const rows = await getDb()
    .select({
      store: stores,
      branch: branches,
    })
    .from(stores)
    .innerJoin(branches, eq(stores.branchId, branches.id))
    .where(eq(stores.id, params.storeId))
    .limit(1);

  const row = rows[0];
  if (!row) {
    throw new AppError("Selected store was not found.", 400);
  }
  if (!row.store.isActive) {
    throw new AppError("Selected store is inactive.", 400);
  }
  if (!row.branch.isActive) {
    throw new AppError("The selected store’s branch is inactive.", 400);
  }
  if (row.store.branchId !== params.toBranchId) {
    throw new AppError(
      "The selected store must belong to the new branch.",
      400,
    );
  }
}

async function assertDestinationSupervisor(params: {
  supervisorApplicationUserId: string;
  toBranchId: string;
  makerApplicationUserId: string;
}): Promise<void> {
  if (params.supervisorApplicationUserId === params.makerApplicationUserId) {
    throw new AppError(
      "The new supervisor must be different from the transferred employee.",
      400,
    );
  }

  const rows = await getDb()
    .select({
      user: applicationUsers,
      employee: employees,
    })
    .from(applicationUsers)
    .innerJoin(employees, eq(applicationUsers.employeeId, employees.id))
    .where(eq(applicationUsers.id, params.supervisorApplicationUserId))
    .limit(1);

  const row = rows[0];
  if (!row) {
    throw new AppError("Selected supervisor was not found.", 400);
  }
  if (!row.user.isActive) {
    throw new AppError("Selected supervisor is inactive.", 400);
  }
  if (!row.employee.isActive) {
    throw new AppError(
      "Selected supervisor’s employee record is inactive.",
      400,
    );
  }
  if (row.employee.branchId !== params.toBranchId) {
    throw new AppError(
      "The selected supervisor must belong to the new branch.",
      400,
    );
  }

  const roleRows = await getDb()
    .select({ role: userRoles.role })
    .from(userRoles)
    .where(eq(userRoles.userId, params.supervisorApplicationUserId));
  const roles = roleRows.map((item) => item.role);
  if (roles.includes("ADMIN") || roles.includes("HR")) {
    throw new AppError(
      "ADMIN and HR accounts cannot be assigned as a store supervisor.",
      400,
    );
  }
  if (!roles.includes("CHECKER")) {
    throw new AppError("The supervisor must have role CHECKER.", 400);
  }
}

export async function transferEmployee(
  id: string,
  input: TransferEmployeeInput,
  transferredByApplicationUserId: string,
): Promise<Employee> {
  const context = await getEmployeeTransferContext(id);
  if (!context.canTransfer) {
    const firstBlocker = context.blockers[0];
    throw new AppError(
      firstBlocker?.message ?? "This employee cannot be transferred.",
      409,
    );
  }

  if (input.toBranchId === context.employee.branchId) {
    throw new AppError(
      "Choose a different branch. The employee already belongs to this branch.",
      400,
    );
  }

  await assertBranchForSave(input.toBranchId);

  const today = localIsoDate();
  if (input.effectiveDate > today) {
    throw new AppError("Effective date cannot be in the future.", 400);
  }
  if (
    context.latestEffectiveDate &&
    input.effectiveDate < context.latestEffectiveDate
  ) {
    throw new AppError(
      `Effective date cannot be earlier than the previous transfer on ${context.latestEffectiveDate}.`,
      400,
    );
  }

  const toStoreId = input.toStoreId ?? null;
  const toSupervisorApplicationUserId =
    input.toSupervisorApplicationUserId ?? null;

  if (toStoreId) {
    await assertDestinationStore({
      storeId: toStoreId,
      toBranchId: input.toBranchId,
    });
  }

  const managingRole = context.applicationUser?.roles.find((role) =>
    isStoreManagingRole(role),
  );
  const canManageStores = Boolean(
    context.applicationUser &&
      managingRole &&
      !context.applicationUser.roles.includes("ADMIN") &&
      !context.applicationUser.roles.includes("HR"),
  );

  if (toSupervisorApplicationUserId) {
    if (!context.applicationUser || !canManageStores) {
      throw new AppError(
        "This employee has no store-managing application account, so a new supervisor cannot be assigned.",
        400,
      );
    }
    await assertDestinationSupervisor({
      supervisorApplicationUserId: toSupervisorApplicationUserId,
      toBranchId: input.toBranchId,
      makerApplicationUserId: context.applicationUser.id,
    });
  }

  try {
    await getDb().transaction(async (tx) => {
      const lockedRows = await tx
        .select()
        .from(employees)
        .where(eq(employees.id, id))
        .for("update")
        .limit(1);
      const locked = lockedRows[0];
      if (!locked) {
        throw new AppError("Employee not found", 404);
      }
      if (locked.branchId !== context.employee.branchId) {
        throw new AppError(
          "This employee’s branch changed before the transfer could be saved. Refresh and try again.",
          409,
        );
      }

      const duplicate = await tx
        .select({ id: employeeTransfers.id })
        .from(employeeTransfers)
        .where(
          and(
            eq(employeeTransfers.employeeId, id),
            eq(employeeTransfers.fromBranchId, locked.branchId),
            eq(employeeTransfers.toBranchId, input.toBranchId),
            eq(employeeTransfers.effectiveDate, input.effectiveDate),
          ),
        )
        .limit(1);
      if (duplicate[0]) {
        throw new AppError(
          "A transfer for this employee, branches, and effective date already exists.",
          409,
        );
      }

      const fromStoreId = context.currentAssignment?.store.id ?? null;
      const fromSupervisorApplicationUserId =
        context.currentAssignment?.supervisor?.id ?? null;

      const updated = await tx
        .update(employees)
        .set({
          branchId: input.toBranchId,
          updatedAt: sql`now()`,
        })
        .where(eq(employees.id, id))
        .returning({ id: employees.id });

      if (!updated[0]) {
        throw new AppError("Employee not found", 404);
      }

      let resolvedToStoreId = toStoreId;
      let resolvedToSupervisorApplicationUserId =
        toSupervisorApplicationUserId;

      if (context.applicationUser && canManageStores && managingRole) {
        const syncResult = await syncApplicationUserStoreAssignment({
          applicationUserId: context.applicationUser.id,
          role: managingRole,
          selectedStoreId: toStoreId,
          mode: "transfer",
          db: tx,
        });
        resolvedToStoreId = syncResult.assignedStore?.id ?? null;

        if (
          toSupervisorApplicationUserId &&
          resolvedToStoreId &&
          managingRole === "MAKER"
        ) {
          await setStoreAssignmentSupervisor({
            storeId: resolvedToStoreId,
            supervisorApplicationUserId: toSupervisorApplicationUserId,
            makerApplicationUserId: context.applicationUser.id,
            db: tx,
          });
          resolvedToSupervisorApplicationUserId =
            toSupervisorApplicationUserId;
        }
      } else if (context.applicationUser) {
        await removeUserFromStoreAssignments({
          applicationUserId: context.applicationUser.id,
          db: tx,
        });
        resolvedToStoreId = null;
        resolvedToSupervisorApplicationUserId = null;
      }

      await tx.insert(employeeTransfers).values({
        employeeId: id,
        fromBranchId: locked.branchId,
        toBranchId: input.toBranchId,
        effectiveDate: input.effectiveDate,
        reason: input.reason,
        transferredByApplicationUserId,
        fromStoreId,
        toStoreId: resolvedToStoreId,
        fromSupervisorApplicationUserId,
        toSupervisorApplicationUserId: resolvedToSupervisorApplicationUserId,
      });
    });

    return getEmployeeById(id);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    mapEmployeeDatabaseError(error);
  }
}

export async function updateEmployee(
  id: string,
  input: UpdateEmployeeInput,
): Promise<Employee> {
  await getEmployeeById(id);

  const existingCode = await findEmployeeByCodeInsensitive(
    input.employeeCode,
    id,
  );
  if (existingCode) {
    throw new AppError("An employee with this code already exists.", 409);
  }

  try {
    const rows = await getDb()
      .update(employees)
      .set({
        employeeCode: input.employeeCode,
        employeeName: input.employeeName,
        updatedAt: sql`now()`,
      })
      .where(eq(employees.id, id))
      .returning({ id: employees.id });

    const updated = rows[0];
    if (!updated) {
      throw new AppError("Employee not found", 404);
    }

    return getEmployeeById(updated.id);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    mapEmployeeDatabaseError(error);
  }
}

export async function updateEmployeeStatus(
  id: string,
  input: UpdateEmployeeStatusInput,
): Promise<Employee> {
  try {
    const rows = await getDb()
      .update(employees)
      .set({
        isActive: input.isActive,
        updatedAt: sql`now()`,
      })
      .where(eq(employees.id, id))
      .returning({ id: employees.id });

    const updated = rows[0];
    if (!updated) {
      throw new AppError("Employee not found", 404);
    }

    return getEmployeeById(updated.id);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    mapEmployeeDatabaseError(error);
  }
}
