import { and, asc, count, eq, or, sql, type SQL } from "drizzle-orm";
import type {
  CreateDepartmentInput,
  Department,
  DepartmentListQuery,
  PaginatedDepartmentResponse,
  UpdateDepartmentInput,
  UpdateDepartmentStatusInput,
} from "@printing-stationery/shared";
import { getDb } from "../db/client.js";
import { departments, type DepartmentRow } from "../db/schema/departments.js";
import { AppError } from "../utils/errors.js";
import { mapDepartmentDatabaseError } from "../utils/db-errors.js";

function toDepartment(row: DepartmentRow): Department {
  return {
    id: row.id,
    departmentCode: row.departmentCode,
    departmentName: row.departmentName,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function escapeIlikePattern(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function buildListFilters(query: DepartmentListQuery): SQL | undefined {
  const conditions: SQL[] = [];

  if (query.status === "ACTIVE") {
    conditions.push(eq(departments.isActive, true));
  } else if (query.status === "INACTIVE") {
    conditions.push(eq(departments.isActive, false));
  }

  if (query.search) {
    const pattern = `%${escapeIlikePattern(query.search)}%`;
    const searchCondition = or(
      sql`${departments.departmentCode} ILIKE ${pattern} ESCAPE '\\'`,
      sql`${departments.departmentName} ILIKE ${pattern} ESCAPE '\\'`,
    );

    if (searchCondition) {
      conditions.push(searchCondition);
    }
  }

  if (conditions.length === 0) {
    return undefined;
  }

  return conditions.length === 1 ? conditions[0] : and(...conditions);
}

async function findDepartmentByCodeInsensitive(
  departmentCode: string,
  excludeId?: string,
): Promise<DepartmentRow | undefined> {
  const conditions: SQL[] = [
    sql`lower(${departments.departmentCode}) = ${departmentCode.toLowerCase()}`,
  ];

  if (excludeId) {
    conditions.push(sql`${departments.id} <> ${excludeId}`);
  }

  const where =
    conditions.length === 1 ? conditions[0]! : and(...conditions)!;

  try {
    const rows = await getDb()
      .select()
      .from(departments)
      .where(where)
      .limit(1);
    return rows[0];
  } catch (error) {
    mapDepartmentDatabaseError(error);
  }
}

export async function listDepartments(
  query: DepartmentListQuery,
): Promise<PaginatedDepartmentResponse> {
  const where = buildListFilters(query);

  try {
    const countQuery = getDb().select({ value: count() }).from(departments);
    const countRows = where
      ? await countQuery.where(where)
      : await countQuery;
    const totalItems = countRows[0]?.value ?? 0;

    const totalPages =
      totalItems === 0 ? 0 : Math.ceil(totalItems / query.pageSize);
    const offset = (query.page - 1) * query.pageSize;

    const listQuery = getDb()
      .select()
      .from(departments)
      .orderBy(asc(departments.departmentName), asc(departments.id))
      .limit(query.pageSize)
      .offset(offset);

    const rows = where ? await listQuery.where(where) : await listQuery;

    return {
      items: rows.map(toDepartment),
      page: query.page,
      pageSize: query.pageSize,
      totalItems,
      totalPages,
    };
  } catch (error) {
    mapDepartmentDatabaseError(error);
  }
}

export async function getDepartmentById(id: string): Promise<Department> {
  try {
    const rows = await getDb()
      .select()
      .from(departments)
      .where(eq(departments.id, id))
      .limit(1);

    const row = rows[0];
    if (!row) {
      throw new AppError("Department not found", 404);
    }

    return toDepartment(row);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    mapDepartmentDatabaseError(error);
  }
}

export async function createDepartment(
  input: CreateDepartmentInput,
): Promise<Department> {
  const existing = await findDepartmentByCodeInsensitive(input.departmentCode);
  if (existing) {
    throw new AppError(
      "A department with this department code already exists",
      409,
    );
  }

  try {
    const rows = await getDb()
      .insert(departments)
      .values({
        departmentCode: input.departmentCode,
        departmentName: input.departmentName,
        isActive: input.isActive,
      })
      .returning();

    const row = rows[0];
    if (!row) {
      throw new AppError("Failed to create department", 500);
    }

    return toDepartment(row);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    mapDepartmentDatabaseError(error);
  }
}

export async function updateDepartment(
  id: string,
  input: UpdateDepartmentInput,
): Promise<Department> {
  if (input.departmentCode !== undefined) {
    const existing = await findDepartmentByCodeInsensitive(
      input.departmentCode,
      id,
    );
    if (existing) {
      throw new AppError(
        "A department with this department code already exists",
        409,
      );
    }
  }

  const updates: {
    departmentCode?: string;
    departmentName?: string;
    updatedAt: SQL;
  } = {
    updatedAt: sql`now()`,
  };

  if (input.departmentCode !== undefined) {
    updates.departmentCode = input.departmentCode;
  }
  if (input.departmentName !== undefined) {
    updates.departmentName = input.departmentName;
  }

  try {
    const rows = await getDb()
      .update(departments)
      .set(updates)
      .where(eq(departments.id, id))
      .returning();

    const row = rows[0];
    if (!row) {
      throw new AppError("Department not found", 404);
    }

    return toDepartment(row);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    mapDepartmentDatabaseError(error);
  }
}

export async function updateDepartmentStatus(
  id: string,
  input: UpdateDepartmentStatusInput,
): Promise<Department> {
  try {
    const rows = await getDb()
      .update(departments)
      .set({
        isActive: input.isActive,
        updatedAt: sql`now()`,
      })
      .where(eq(departments.id, id))
      .returning();

    const row = rows[0];
    if (!row) {
      throw new AppError("Department not found", 404);
    }

    return toDepartment(row);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    mapDepartmentDatabaseError(error);
  }
}
