import { and, asc, count, eq, or, sql, type SQL } from "drizzle-orm";
import type {
  CreateEmployeeInput,
  Employee,
  EmployeeListQuery,
  PaginatedEmployeeResponse,
  UpdateEmployeeInput,
  UpdateEmployeeStatusInput,
} from "@printing-stationery/shared";
import { getDb } from "../db/client.js";
import { branches } from "../db/schema/branches.js";
import { employees, type EmployeeRow } from "../db/schema/employees.js";
import { AppError } from "../utils/errors.js";
import { mapEmployeeDatabaseError } from "../utils/db-errors.js";

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

export async function updateEmployee(
  id: string,
  input: UpdateEmployeeInput,
): Promise<Employee> {
  const existing = await getEmployeeById(id);

  await assertBranchForSave(input.branchId, existing.branchId);

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
        branchId: input.branchId,
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
