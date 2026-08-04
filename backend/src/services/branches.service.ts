import { and, asc, count, eq, or, sql, type SQL } from "drizzle-orm";
import type {
  Branch,
  BranchListQuery,
  CreateBranchInput,
  PaginatedBranchResponse,
  UpdateBranchInput,
  UpdateBranchStatusInput,
} from "@printing-stationery/shared";
import { getDb } from "../db/client.js";
import { branches, type BranchRow } from "../db/schema/branches.js";
import { AppError } from "../utils/errors.js";
import { mapBranchDatabaseError } from "../utils/db-errors.js";

function toBranch(row: BranchRow): Branch {
  return {
    id: row.id,
    branchCode: row.branchCode,
    branchName: row.branchName,
    branchType: row.branchType,
    address: row.address ?? null,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function escapeIlikePattern(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function buildListFilters(query: BranchListQuery): SQL | undefined {
  const conditions: SQL[] = [];

  if (query.status === "ACTIVE") {
    conditions.push(eq(branches.isActive, true));
  } else if (query.status === "INACTIVE") {
    conditions.push(eq(branches.isActive, false));
  }

  if (query.search) {
    const pattern = `%${escapeIlikePattern(query.search)}%`;
    const searchCondition = or(
      sql`${branches.branchCode} ILIKE ${pattern} ESCAPE '\\'`,
      sql`${branches.branchName} ILIKE ${pattern} ESCAPE '\\'`,
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

async function findBranchByCodeInsensitive(
  branchCode: string,
  excludeId?: string,
): Promise<BranchRow | undefined> {
  const conditions: SQL[] = [
    sql`lower(${branches.branchCode}) = ${branchCode.toLowerCase()}`,
  ];

  if (excludeId) {
    conditions.push(sql`${branches.id} <> ${excludeId}`);
  }

  const where =
    conditions.length === 1 ? conditions[0]! : and(...conditions)!;

  try {
    const rows = await getDb()
      .select()
      .from(branches)
      .where(where)
      .limit(1);
    return rows[0];
  } catch (error) {
    mapBranchDatabaseError(error);
  }
}

export async function listBranches(
  query: BranchListQuery,
): Promise<PaginatedBranchResponse> {
  const where = buildListFilters(query);

  try {
    const countQuery = getDb().select({ value: count() }).from(branches);
    const countRows = where
      ? await countQuery.where(where)
      : await countQuery;
    const totalItems = countRows[0]?.value ?? 0;

    const totalPages =
      totalItems === 0 ? 0 : Math.ceil(totalItems / query.pageSize);
    const offset = (query.page - 1) * query.pageSize;

    const listQuery = getDb()
      .select()
      .from(branches)
      .orderBy(asc(branches.branchName), asc(branches.id))
      .limit(query.pageSize)
      .offset(offset);

    const rows = where ? await listQuery.where(where) : await listQuery;

    return {
      items: rows.map(toBranch),
      page: query.page,
      pageSize: query.pageSize,
      totalItems,
      totalPages,
    };
  } catch (error) {
    mapBranchDatabaseError(error);
  }
}

export async function getBranchById(id: string): Promise<Branch> {
  try {
    const rows = await getDb()
      .select()
      .from(branches)
      .where(eq(branches.id, id))
      .limit(1);

    const row = rows[0];
    if (!row) {
      throw new AppError("Branch not found", 404);
    }

    return toBranch(row);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    mapBranchDatabaseError(error);
  }
}

export async function createBranch(
  input: CreateBranchInput,
): Promise<Branch> {
  const existing = await findBranchByCodeInsensitive(input.branchCode);
  if (existing) {
    throw new AppError("A branch with this branch code already exists", 409);
  }

  try {
    const rows = await getDb()
      .insert(branches)
      .values({
        branchCode: input.branchCode,
        branchName: input.branchName,
        branchType: input.branchType,
        address: input.address ?? null,
        isActive: input.isActive,
      })
      .returning();

    const row = rows[0];
    if (!row) {
      throw new AppError("Failed to create branch", 500);
    }

    return toBranch(row);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    mapBranchDatabaseError(error);
  }
}

export async function updateBranch(
  id: string,
  input: UpdateBranchInput,
): Promise<Branch> {
  if (input.branchCode !== undefined) {
    const existing = await findBranchByCodeInsensitive(input.branchCode, id);
    if (existing) {
      throw new AppError("A branch with this branch code already exists", 409);
    }
  }

  const updates: {
    branchCode?: string;
    branchName?: string;
    branchType?: CreateBranchInput["branchType"];
    address?: string | null;
    updatedAt: SQL;
  } = {
    updatedAt: sql`now()`,
  };

  if (input.branchCode !== undefined) {
    updates.branchCode = input.branchCode;
  }
  if (input.branchName !== undefined) {
    updates.branchName = input.branchName;
  }
  if (input.branchType !== undefined) {
    updates.branchType = input.branchType;
  }
  if (input.address !== undefined) {
    updates.address = input.address;
  }

  try {
    const rows = await getDb()
      .update(branches)
      .set(updates)
      .where(eq(branches.id, id))
      .returning();

    const row = rows[0];
    if (!row) {
      throw new AppError("Branch not found", 404);
    }

    return toBranch(row);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    mapBranchDatabaseError(error);
  }
}

export async function updateBranchStatus(
  id: string,
  input: UpdateBranchStatusInput,
): Promise<Branch> {
  try {
    const rows = await getDb()
      .update(branches)
      .set({
        isActive: input.isActive,
        updatedAt: sql`now()`,
      })
      .where(eq(branches.id, id))
      .returning();

    const row = rows[0];
    if (!row) {
      throw new AppError("Branch not found", 404);
    }

    return toBranch(row);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    mapBranchDatabaseError(error);
  }
}
