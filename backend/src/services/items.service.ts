import { and, asc, count, eq, or, sql, type SQL } from "drizzle-orm";
import type {
  CreateItemInput,
  Item,
  ItemListQuery,
  PaginatedItemResponse,
  UpdateItemInput,
  UpdateItemStatusInput,
} from "@printing-stationery/shared";
import { getDb } from "../db/client.js";
import { itemGroups } from "../db/schema/item-groups.js";
import { items, type ItemRow } from "../db/schema/items.js";
import { units } from "../db/schema/units.js";
import { AppError } from "../utils/errors.js";
import { mapItemDatabaseError } from "../utils/db-errors.js";

type ItemJoinedRow = {
  item: ItemRow;
  unitId: string;
  unitName: string;
  itemGroupId: string;
  groupCode: string;
  groupName: string;
  groupType: Item["itemGroup"]["groupType"];
};

function toItem(row: ItemJoinedRow): Item {
  return {
    id: row.item.id,
    itemCode: row.item.itemCode,
    itemName: row.item.itemName,
    unitId: row.item.unitId,
    itemGroupId: row.item.itemGroupId,
    returnType: row.item.returnType,
    purchaseRate: row.item.purchaseRate,
    remarks: row.item.remarks ?? null,
    isActive: row.item.isActive,
    isRequestable: row.item.isRequestable,
    isIssuable: row.item.isIssuable,
    trackSerialNumber: row.item.trackSerialNumber,
    createdAt: row.item.createdAt.toISOString(),
    updatedAt: row.item.updatedAt.toISOString(),
    unit: {
      id: row.unitId,
      unitName: row.unitName,
    },
    itemGroup: {
      id: row.itemGroupId,
      groupCode: row.groupCode,
      groupName: row.groupName,
      groupType: row.groupType,
    },
  };
}

function escapeIlikePattern(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function buildListFilters(query: ItemListQuery): SQL | undefined {
  const conditions: SQL[] = [];

  if (query.status === "ACTIVE") {
    conditions.push(eq(items.isActive, true));
  } else if (query.status === "INACTIVE") {
    conditions.push(eq(items.isActive, false));
  }

  if (query.search) {
    const pattern = `%${escapeIlikePattern(query.search)}%`;
    const searchCondition = or(
      sql`${items.itemCode} ILIKE ${pattern} ESCAPE '\\'`,
      sql`${items.itemName} ILIKE ${pattern} ESCAPE '\\'`,
      sql`${units.unitName} ILIKE ${pattern} ESCAPE '\\'`,
      sql`${itemGroups.groupCode} ILIKE ${pattern} ESCAPE '\\'`,
      sql`${itemGroups.groupName} ILIKE ${pattern} ESCAPE '\\'`,
    );

    if (searchCondition) {
      conditions.push(searchCondition);
    }
  }

  if (query.unitId) {
    conditions.push(eq(items.unitId, query.unitId));
  }

  if (query.itemGroupId) {
    conditions.push(eq(items.itemGroupId, query.itemGroupId));
  }

  if (query.groupType) {
    conditions.push(eq(itemGroups.groupType, query.groupType));
  }

  if (conditions.length === 0) {
    return undefined;
  }

  return conditions.length === 1 ? conditions[0] : and(...conditions);
}

const itemSelect = {
  item: items,
  unitId: units.id,
  unitName: units.unitName,
  itemGroupId: itemGroups.id,
  groupCode: itemGroups.groupCode,
  groupName: itemGroups.groupName,
  groupType: itemGroups.groupType,
};

async function findItemByCodeInsensitive(
  itemCode: string,
  excludeId?: string,
): Promise<ItemRow | undefined> {
  const conditions: SQL[] = [
    sql`lower(${items.itemCode}) = ${itemCode.toLowerCase()}`,
  ];

  if (excludeId) {
    conditions.push(sql`${items.id} <> ${excludeId}`);
  }

  const where =
    conditions.length === 1 ? conditions[0]! : and(...conditions)!;

  try {
    const rows = await getDb().select().from(items).where(where).limit(1);
    return rows[0];
  } catch (error) {
    mapItemDatabaseError(error);
  }
}

async function findItemByNameInsensitive(
  itemName: string,
  excludeId?: string,
): Promise<ItemRow | undefined> {
  const conditions: SQL[] = [
    sql`lower(${items.itemName}) = ${itemName.toLowerCase()}`,
  ];

  if (excludeId) {
    conditions.push(sql`${items.id} <> ${excludeId}`);
  }

  const where =
    conditions.length === 1 ? conditions[0]! : and(...conditions)!;

  try {
    const rows = await getDb().select().from(items).where(where).limit(1);
    return rows[0];
  } catch (error) {
    mapItemDatabaseError(error);
  }
}

async function getJoinedItemById(id: string): Promise<ItemJoinedRow | undefined> {
  const rows = await getDb()
    .select(itemSelect)
    .from(items)
    .innerJoin(units, eq(items.unitId, units.id))
    .innerJoin(itemGroups, eq(items.itemGroupId, itemGroups.id))
    .where(eq(items.id, id))
    .limit(1);

  return rows[0];
}

async function assertUnitForSave(
  unitId: string,
  previousUnitId?: string,
): Promise<void> {
  const rows = await getDb()
    .select()
    .from(units)
    .where(eq(units.id, unitId))
    .limit(1);

  const unit = rows[0];
  if (!unit) {
    throw new AppError("Selected unit was not found.", 400);
  }

  const isUnchanged = previousUnitId !== undefined && previousUnitId === unitId;
  if (!isUnchanged && !unit.isActive) {
    throw new AppError("Selected unit is inactive.", 400);
  }
}

async function assertItemGroupForSave(
  itemGroupId: string,
  previousItemGroupId?: string,
): Promise<void> {
  const rows = await getDb()
    .select()
    .from(itemGroups)
    .where(eq(itemGroups.id, itemGroupId))
    .limit(1);

  const itemGroup = rows[0];
  if (!itemGroup) {
    throw new AppError("Selected item group was not found.", 400);
  }

  const isUnchanged =
    previousItemGroupId !== undefined && previousItemGroupId === itemGroupId;
  if (!isUnchanged && !itemGroup.isActive) {
    throw new AppError("Selected item group is inactive.", 400);
  }
}

export async function listItems(
  query: ItemListQuery,
): Promise<PaginatedItemResponse> {
  const where = buildListFilters(query);

  try {
    const countBase = getDb()
      .select({ value: count() })
      .from(items)
      .innerJoin(units, eq(items.unitId, units.id))
      .innerJoin(itemGroups, eq(items.itemGroupId, itemGroups.id));

    const countRows = where ? await countBase.where(where) : await countBase;
    const totalItems = countRows[0]?.value ?? 0;

    const totalPages =
      totalItems === 0 ? 0 : Math.ceil(totalItems / query.pageSize);
    const offset = (query.page - 1) * query.pageSize;

    const listQuery = getDb()
      .select(itemSelect)
      .from(items)
      .innerJoin(units, eq(items.unitId, units.id))
      .innerJoin(itemGroups, eq(items.itemGroupId, itemGroups.id));

    const filteredList = where ? listQuery.where(where) : listQuery;
    const rows = await filteredList
      .orderBy(asc(items.itemName), asc(items.id))
      .limit(query.pageSize)
      .offset(offset);

    return {
      items: rows.map(toItem),
      page: query.page,
      pageSize: query.pageSize,
      totalItems,
      totalPages,
    };
  } catch (error) {
    mapItemDatabaseError(error);
  }
}

export async function getItemById(id: string): Promise<Item> {
  try {
    const row = await getJoinedItemById(id);
    if (!row) {
      throw new AppError("Item not found", 404);
    }

    return toItem(row);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    mapItemDatabaseError(error);
  }
}

export async function createItem(input: CreateItemInput): Promise<Item> {
  await assertUnitForSave(input.unitId);
  await assertItemGroupForSave(input.itemGroupId);

  const existingCode = await findItemByCodeInsensitive(input.itemCode);
  if (existingCode) {
    throw new AppError("An item with this code already exists.", 409);
  }

  const existingName = await findItemByNameInsensitive(input.itemName);
  if (existingName) {
    throw new AppError("An item with this name already exists.", 409);
  }

  try {
    const rows = await getDb()
      .insert(items)
      .values({
        itemCode: input.itemCode,
        itemName: input.itemName,
        unitId: input.unitId,
        itemGroupId: input.itemGroupId,
        returnType: input.returnType,
        purchaseRate: input.purchaseRate,
        remarks: input.remarks,
        isActive: input.isActive,
        isRequestable: input.isRequestable,
        isIssuable: input.isIssuable,
        trackSerialNumber: input.trackSerialNumber,
      })
      .returning({ id: items.id });

    const created = rows[0];
    if (!created) {
      throw new AppError("Failed to create item", 500);
    }

    return getItemById(created.id);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    mapItemDatabaseError(error);
  }
}

export async function updateItem(
  id: string,
  input: UpdateItemInput,
): Promise<Item> {
  const existing = await getItemById(id);

  await assertUnitForSave(input.unitId, existing.unitId);
  await assertItemGroupForSave(input.itemGroupId, existing.itemGroupId);

  const existingCode = await findItemByCodeInsensitive(input.itemCode, id);
  if (existingCode) {
    throw new AppError("An item with this code already exists.", 409);
  }

  const existingName = await findItemByNameInsensitive(input.itemName, id);
  if (existingName) {
    throw new AppError("An item with this name already exists.", 409);
  }

  try {
    const rows = await getDb()
      .update(items)
      .set({
        itemCode: input.itemCode,
        itemName: input.itemName,
        unitId: input.unitId,
        itemGroupId: input.itemGroupId,
        returnType: input.returnType,
        purchaseRate: input.purchaseRate,
        remarks: input.remarks,
        isRequestable: input.isRequestable,
        isIssuable: input.isIssuable,
        trackSerialNumber: input.trackSerialNumber,
        updatedAt: sql`now()`,
      })
      .where(eq(items.id, id))
      .returning({ id: items.id });

    const updated = rows[0];
    if (!updated) {
      throw new AppError("Item not found", 404);
    }

    return getItemById(updated.id);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    mapItemDatabaseError(error);
  }
}

export async function updateItemStatus(
  id: string,
  input: UpdateItemStatusInput,
): Promise<Item> {
  try {
    const rows = await getDb()
      .update(items)
      .set({
        isActive: input.isActive,
        updatedAt: sql`now()`,
      })
      .where(eq(items.id, id))
      .returning({ id: items.id });

    const updated = rows[0];
    if (!updated) {
      throw new AppError("Item not found", 404);
    }

    return getItemById(updated.id);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    mapItemDatabaseError(error);
  }
}
