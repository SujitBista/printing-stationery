import { and, asc, count, eq, sql, type SQL } from "drizzle-orm";
import type {
  CreateUnitInput,
  PaginatedUnitResponse,
  Unit,
  UnitListQuery,
  UpdateUnitInput,
  UpdateUnitStatusInput,
} from "@printing-stationery/shared";
import { getDb } from "../db/client.js";
import { units, type UnitRow } from "../db/schema/units.js";
import { AppError } from "../utils/errors.js";
import { mapUnitDatabaseError } from "../utils/db-errors.js";

function toUnit(row: UnitRow): Unit {
  return {
    id: row.id,
    unitName: row.unitName,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function escapeIlikePattern(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function buildListFilters(query: UnitListQuery): SQL | undefined {
  const conditions: SQL[] = [];

  if (query.status === "ACTIVE") {
    conditions.push(eq(units.isActive, true));
  } else if (query.status === "INACTIVE") {
    conditions.push(eq(units.isActive, false));
  }

  if (query.search) {
    const pattern = `%${escapeIlikePattern(query.search)}%`;
    conditions.push(sql`${units.unitName} ILIKE ${pattern} ESCAPE '\\'`);
  }

  if (conditions.length === 0) {
    return undefined;
  }

  return conditions.length === 1 ? conditions[0] : and(...conditions);
}

async function findUnitByNameInsensitive(
  unitName: string,
  excludeId?: string,
): Promise<UnitRow | undefined> {
  const conditions: SQL[] = [
    sql`lower(${units.unitName}) = ${unitName.toLowerCase()}`,
  ];

  if (excludeId) {
    conditions.push(sql`${units.id} <> ${excludeId}`);
  }

  const where =
    conditions.length === 1 ? conditions[0]! : and(...conditions)!;

  try {
    const rows = await getDb().select().from(units).where(where).limit(1);
    return rows[0];
  } catch (error) {
    mapUnitDatabaseError(error);
  }
}

export async function listUnits(
  query: UnitListQuery,
): Promise<PaginatedUnitResponse> {
  const where = buildListFilters(query);

  try {
    const countQuery = getDb().select({ value: count() }).from(units);
    const countRows = where ? await countQuery.where(where) : await countQuery;
    const totalItems = countRows[0]?.value ?? 0;

    const totalPages =
      totalItems === 0 ? 0 : Math.ceil(totalItems / query.pageSize);
    const offset = (query.page - 1) * query.pageSize;

    const listQuery = getDb()
      .select()
      .from(units)
      .orderBy(asc(units.unitName), asc(units.id))
      .limit(query.pageSize)
      .offset(offset);

    const rows = where ? await listQuery.where(where) : await listQuery;

    return {
      items: rows.map(toUnit),
      page: query.page,
      pageSize: query.pageSize,
      totalItems,
      totalPages,
    };
  } catch (error) {
    mapUnitDatabaseError(error);
  }
}

export async function getUnitById(id: string): Promise<Unit> {
  try {
    const rows = await getDb()
      .select()
      .from(units)
      .where(eq(units.id, id))
      .limit(1);

    const row = rows[0];
    if (!row) {
      throw new AppError("Unit not found", 404);
    }

    return toUnit(row);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    mapUnitDatabaseError(error);
  }
}

export async function createUnit(input: CreateUnitInput): Promise<Unit> {
  const existing = await findUnitByNameInsensitive(input.unitName);
  if (existing) {
    throw new AppError("A unit with this unit name already exists", 409);
  }

  try {
    const rows = await getDb()
      .insert(units)
      .values({
        unitName: input.unitName,
        isActive: input.isActive,
      })
      .returning();

    const row = rows[0];
    if (!row) {
      throw new AppError("Failed to create unit", 500);
    }

    return toUnit(row);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    mapUnitDatabaseError(error);
  }
}

export async function updateUnit(
  id: string,
  input: UpdateUnitInput,
): Promise<Unit> {
  const existing = await findUnitByNameInsensitive(input.unitName, id);
  if (existing) {
    throw new AppError("A unit with this unit name already exists", 409);
  }

  try {
    const rows = await getDb()
      .update(units)
      .set({
        unitName: input.unitName,
        updatedAt: sql`now()`,
      })
      .where(eq(units.id, id))
      .returning();

    const row = rows[0];
    if (!row) {
      throw new AppError("Unit not found", 404);
    }

    return toUnit(row);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    mapUnitDatabaseError(error);
  }
}

export async function updateUnitStatus(
  id: string,
  input: UpdateUnitStatusInput,
): Promise<Unit> {
  try {
    const rows = await getDb()
      .update(units)
      .set({
        isActive: input.isActive,
        updatedAt: sql`now()`,
      })
      .where(eq(units.id, id))
      .returning();

    const row = rows[0];
    if (!row) {
      throw new AppError("Unit not found", 404);
    }

    return toUnit(row);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    mapUnitDatabaseError(error);
  }
}
