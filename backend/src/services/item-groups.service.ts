import { and, asc, count, eq, or, sql, type SQL } from "drizzle-orm";
import type {
  CreateItemGroupInput,
  ItemGroup,
  ItemGroupListQuery,
  PaginatedItemGroupResponse,
  UpdateItemGroupInput,
  UpdateItemGroupStatusInput,
} from "@printing-stationery/shared";
import { getDb } from "../db/client.js";
import { itemGroups, type ItemGroupRow } from "../db/schema/item-groups.js";
import { AppError } from "../utils/errors.js";
import { mapItemGroupDatabaseError } from "../utils/db-errors.js";

function toItemGroup(row: ItemGroupRow): ItemGroup {
  return {
    id: row.id,
    groupCode: row.groupCode,
    groupName: row.groupName,
    groupType: row.groupType,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function escapeIlikePattern(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function buildListFilters(query: ItemGroupListQuery): SQL | undefined {
  const conditions: SQL[] = [];

  if (query.status === "ACTIVE") {
    conditions.push(eq(itemGroups.isActive, true));
  } else if (query.status === "INACTIVE") {
    conditions.push(eq(itemGroups.isActive, false));
  }

  if (query.search) {
    const pattern = `%${escapeIlikePattern(query.search)}%`;
    const searchCondition = or(
      sql`${itemGroups.groupCode} ILIKE ${pattern} ESCAPE '\\'`,
      sql`${itemGroups.groupName} ILIKE ${pattern} ESCAPE '\\'`,
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

async function findItemGroupByCodeInsensitive(
  groupCode: string,
  excludeId?: string,
): Promise<ItemGroupRow | undefined> {
  const conditions: SQL[] = [
    sql`lower(${itemGroups.groupCode}) = ${groupCode.toLowerCase()}`,
  ];

  if (excludeId) {
    conditions.push(sql`${itemGroups.id} <> ${excludeId}`);
  }

  const where =
    conditions.length === 1 ? conditions[0]! : and(...conditions)!;

  try {
    const rows = await getDb()
      .select()
      .from(itemGroups)
      .where(where)
      .limit(1);
    return rows[0];
  } catch (error) {
    mapItemGroupDatabaseError(error);
  }
}

async function findItemGroupByNameInsensitive(
  groupName: string,
  excludeId?: string,
): Promise<ItemGroupRow | undefined> {
  const conditions: SQL[] = [
    sql`lower(${itemGroups.groupName}) = ${groupName.toLowerCase()}`,
  ];

  if (excludeId) {
    conditions.push(sql`${itemGroups.id} <> ${excludeId}`);
  }

  const where =
    conditions.length === 1 ? conditions[0]! : and(...conditions)!;

  try {
    const rows = await getDb()
      .select()
      .from(itemGroups)
      .where(where)
      .limit(1);
    return rows[0];
  } catch (error) {
    mapItemGroupDatabaseError(error);
  }
}

export async function listItemGroups(
  query: ItemGroupListQuery,
): Promise<PaginatedItemGroupResponse> {
  const where = buildListFilters(query);

  try {
    const countQuery = getDb().select({ value: count() }).from(itemGroups);
    const countRows = where ? await countQuery.where(where) : await countQuery;
    const totalItems = countRows[0]?.value ?? 0;

    const totalPages =
      totalItems === 0 ? 0 : Math.ceil(totalItems / query.pageSize);
    const offset = (query.page - 1) * query.pageSize;

    const listQuery = getDb()
      .select()
      .from(itemGroups)
      .orderBy(asc(itemGroups.groupName), asc(itemGroups.id))
      .limit(query.pageSize)
      .offset(offset);

    const rows = where ? await listQuery.where(where) : await listQuery;

    return {
      items: rows.map(toItemGroup),
      page: query.page,
      pageSize: query.pageSize,
      totalItems,
      totalPages,
    };
  } catch (error) {
    mapItemGroupDatabaseError(error);
  }
}

export async function getItemGroupById(id: string): Promise<ItemGroup> {
  try {
    const rows = await getDb()
      .select()
      .from(itemGroups)
      .where(eq(itemGroups.id, id))
      .limit(1);

    const row = rows[0];
    if (!row) {
      throw new AppError("Item group not found", 404);
    }

    return toItemGroup(row);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    mapItemGroupDatabaseError(error);
  }
}

export async function createItemGroup(
  input: CreateItemGroupInput,
): Promise<ItemGroup> {
  const existingCode = await findItemGroupByCodeInsensitive(input.groupCode);
  if (existingCode) {
    throw new AppError("An item group with this code already exists.", 409);
  }

  const existingName = await findItemGroupByNameInsensitive(input.groupName);
  if (existingName) {
    throw new AppError("An item group with this name already exists.", 409);
  }

  try {
    const rows = await getDb()
      .insert(itemGroups)
      .values({
        groupCode: input.groupCode,
        groupName: input.groupName,
        groupType: input.groupType,
        isActive: input.isActive,
      })
      .returning();

    const row = rows[0];
    if (!row) {
      throw new AppError("Failed to create item group", 500);
    }

    return toItemGroup(row);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    mapItemGroupDatabaseError(error);
  }
}

export async function updateItemGroup(
  id: string,
  input: UpdateItemGroupInput,
): Promise<ItemGroup> {
  const existingCode = await findItemGroupByCodeInsensitive(
    input.groupCode,
    id,
  );
  if (existingCode) {
    throw new AppError("An item group with this code already exists.", 409);
  }

  const existingName = await findItemGroupByNameInsensitive(
    input.groupName,
    id,
  );
  if (existingName) {
    throw new AppError("An item group with this name already exists.", 409);
  }

  try {
    const rows = await getDb()
      .update(itemGroups)
      .set({
        groupCode: input.groupCode,
        groupName: input.groupName,
        groupType: input.groupType,
        updatedAt: sql`now()`,
      })
      .where(eq(itemGroups.id, id))
      .returning();

    const row = rows[0];
    if (!row) {
      throw new AppError("Item group not found", 404);
    }

    return toItemGroup(row);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    mapItemGroupDatabaseError(error);
  }
}

export async function updateItemGroupStatus(
  id: string,
  input: UpdateItemGroupStatusInput,
): Promise<ItemGroup> {
  try {
    const rows = await getDb()
      .update(itemGroups)
      .set({
        isActive: input.isActive,
        updatedAt: sql`now()`,
      })
      .where(eq(itemGroups.id, id))
      .returning();

    const row = rows[0];
    if (!row) {
      throw new AppError("Item group not found", 404);
    }

    return toItemGroup(row);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    mapItemGroupDatabaseError(error);
  }
}
