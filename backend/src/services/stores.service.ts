import { and, asc, count, eq, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type {
  CreateStoreInput,
  PaginatedStoreResponse,
  Store,
  StoreListQuery,
  UpdateStoreInput,
  UpdateStoreStatusInput,
} from "@printing-stationery/shared";
import { getDb } from "../db/client.js";
import { branches } from "../db/schema/branches.js";
import { stores, type StoreRow } from "../db/schema/stores.js";
import { AppError } from "../utils/errors.js";
import { mapStoreDatabaseError } from "../utils/db-errors.js";

const underStores = alias(stores, "under_stores");

type StoreJoinedRow = {
  store: StoreRow;
  branchId: string;
  branchCode: string;
  branchName: string;
  branchIsActive: boolean;
  underStoreId: string | null;
  underStoreCode: string | null;
  underStoreName: string | null;
  underStoreBranchId: string | null;
  underStoreIsActive: boolean | null;
};

function toStore(row: StoreJoinedRow): Store {
  return {
    id: row.store.id,
    storeCode: row.store.storeCode,
    storeName: row.store.storeName,
    branchId: row.store.branchId,
    underStoreId: row.store.underStoreId ?? null,
    allowTransfer: row.store.allowTransfer,
    allowDepartmentIssue: row.store.allowDepartmentIssue,
    remarks: row.store.remarks ?? null,
    isActive: row.store.isActive,
    createdAt: row.store.createdAt.toISOString(),
    updatedAt: row.store.updatedAt.toISOString(),
    branch: {
      id: row.branchId,
      branchCode: row.branchCode,
      branchName: row.branchName,
      isActive: row.branchIsActive,
    },
    underStore:
      row.underStoreId &&
      row.underStoreCode &&
      row.underStoreName &&
      row.underStoreBranchId &&
      row.underStoreIsActive !== null
        ? {
            id: row.underStoreId,
            storeCode: row.underStoreCode,
            storeName: row.underStoreName,
            branchId: row.underStoreBranchId,
            isActive: row.underStoreIsActive,
          }
        : null,
  };
}

function escapeIlikePattern(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function buildListFilters(query: StoreListQuery): SQL | undefined {
  const conditions: SQL[] = [];

  if (query.status === "ACTIVE") {
    conditions.push(eq(stores.isActive, true));
  } else if (query.status === "INACTIVE") {
    conditions.push(eq(stores.isActive, false));
  }

  if (query.search) {
    const pattern = `%${escapeIlikePattern(query.search)}%`;
    const searchCondition = or(
      sql`${stores.storeCode} ILIKE ${pattern} ESCAPE '\\'`,
      sql`${stores.storeName} ILIKE ${pattern} ESCAPE '\\'`,
    );

    if (searchCondition) {
      conditions.push(searchCondition);
    }
  }

  if (query.branchId) {
    conditions.push(eq(stores.branchId, query.branchId));
  }

  if (query.underStoreId) {
    conditions.push(eq(stores.underStoreId, query.underStoreId));
  }

  if (query.hierarchy === "TOP_LEVEL") {
    conditions.push(isNull(stores.underStoreId));
  } else if (query.hierarchy === "NESTED") {
    conditions.push(isNotNull(stores.underStoreId));
  }

  if (conditions.length === 0) {
    return undefined;
  }

  return conditions.length === 1 ? conditions[0] : and(...conditions);
}

const storeSelect = {
  store: stores,
  branchId: branches.id,
  branchCode: branches.branchCode,
  branchName: branches.branchName,
  branchIsActive: branches.isActive,
  underStoreId: underStores.id,
  underStoreCode: underStores.storeCode,
  underStoreName: underStores.storeName,
  underStoreBranchId: underStores.branchId,
  underStoreIsActive: underStores.isActive,
};

async function findStoreByCodeInsensitive(
  storeCode: string,
  excludeId?: string,
): Promise<StoreRow | undefined> {
  const conditions: SQL[] = [
    sql`lower(${stores.storeCode}) = ${storeCode.toLowerCase()}`,
  ];

  if (excludeId) {
    conditions.push(sql`${stores.id} <> ${excludeId}`);
  }

  const where =
    conditions.length === 1 ? conditions[0]! : and(...conditions)!;

  try {
    const rows = await getDb().select().from(stores).where(where).limit(1);
    return rows[0];
  } catch (error) {
    mapStoreDatabaseError(error);
  }
}

async function findStoreByNameInBranchInsensitive(
  storeName: string,
  branchId: string,
  excludeId?: string,
): Promise<StoreRow | undefined> {
  const conditions: SQL[] = [
    eq(stores.branchId, branchId),
    sql`lower(${stores.storeName}) = ${storeName.toLowerCase()}`,
  ];

  if (excludeId) {
    conditions.push(sql`${stores.id} <> ${excludeId}`);
  }

  const where = and(...conditions)!;

  try {
    const rows = await getDb().select().from(stores).where(where).limit(1);
    return rows[0];
  } catch (error) {
    mapStoreDatabaseError(error);
  }
}

async function getJoinedStoreById(
  id: string,
): Promise<StoreJoinedRow | undefined> {
  const rows = await getDb()
    .select(storeSelect)
    .from(stores)
    .innerJoin(branches, eq(stores.branchId, branches.id))
    .leftJoin(underStores, eq(stores.underStoreId, underStores.id))
    .where(eq(stores.id, id))
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

async function assertUnderStoreForSave(
  underStoreId: string | null,
  storeId?: string,
  previousUnderStoreId?: string | null,
): Promise<void> {
  if (underStoreId === null) {
    return;
  }

  if (storeId && underStoreId === storeId) {
    throw new AppError(
      "This Under Store selection would create a circular store relationship.",
      400,
    );
  }

  const rows = await getDb()
    .select()
    .from(stores)
    .where(eq(stores.id, underStoreId))
    .limit(1);

  const underStore = rows[0];
  if (!underStore) {
    throw new AppError("Selected under store was not found.", 400);
  }

  const isUnchanged =
    previousUnderStoreId !== undefined &&
    previousUnderStoreId === underStoreId;
  if (!isUnchanged && !underStore.isActive) {
    throw new AppError("Selected under store is inactive.", 400);
  }

  if (storeId) {
    await assertNoUnderStoreCycle(storeId, underStoreId);
  }
}

async function assertNoUnderStoreCycle(
  storeId: string,
  underStoreId: string,
): Promise<void> {
  const visited = new Set<string>();
  let currentId: string | null = underStoreId;

  while (currentId) {
    if (currentId === storeId) {
      throw new AppError(
        "This Under Store selection would create a circular store relationship.",
        400,
      );
    }

    if (visited.has(currentId)) {
      // Existing data already contains a cycle; stop walking safely.
      break;
    }
    visited.add(currentId);

    const rows = await getDb()
      .select({ underStoreId: stores.underStoreId })
      .from(stores)
      .where(eq(stores.id, currentId))
      .limit(1);

    currentId = rows[0]?.underStoreId ?? null;
  }
}

export async function listStores(
  query: StoreListQuery,
): Promise<PaginatedStoreResponse> {
  const where = buildListFilters(query);

  try {
    const countBase = getDb()
      .select({ value: count() })
      .from(stores)
      .innerJoin(branches, eq(stores.branchId, branches.id))
      .leftJoin(underStores, eq(stores.underStoreId, underStores.id));

    const countRows = where ? await countBase.where(where) : await countBase;
    const totalItems = countRows[0]?.value ?? 0;

    const totalPages =
      totalItems === 0 ? 0 : Math.ceil(totalItems / query.pageSize);
    const offset = (query.page - 1) * query.pageSize;

    const listBase = getDb()
      .select(storeSelect)
      .from(stores)
      .innerJoin(branches, eq(stores.branchId, branches.id))
      .leftJoin(underStores, eq(stores.underStoreId, underStores.id))
      .orderBy(asc(stores.storeName), asc(stores.id))
      .limit(query.pageSize)
      .offset(offset);

    const rows = where ? await listBase.where(where) : await listBase;

    return {
      items: rows.map(toStore),
      page: query.page,
      pageSize: query.pageSize,
      totalItems,
      totalPages,
    };
  } catch (error) {
    mapStoreDatabaseError(error);
  }
}

export async function getStoreById(id: string): Promise<Store> {
  try {
    const row = await getJoinedStoreById(id);
    if (!row) {
      throw new AppError("Store not found", 404);
    }

    return toStore(row);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    mapStoreDatabaseError(error);
  }
}

export async function createStore(input: CreateStoreInput): Promise<Store> {
  await assertBranchForSave(input.branchId);
  await assertUnderStoreForSave(input.underStoreId);

  const existingCode = await findStoreByCodeInsensitive(input.storeCode);
  if (existingCode) {
    throw new AppError("A store with this code already exists.", 409);
  }

  const existingName = await findStoreByNameInBranchInsensitive(
    input.storeName,
    input.branchId,
  );
  if (existingName) {
    throw new AppError(
      "A store with this name already exists in the selected branch.",
      409,
    );
  }

  try {
    const rows = await getDb()
      .insert(stores)
      .values({
        storeCode: input.storeCode,
        storeName: input.storeName,
        branchId: input.branchId,
        underStoreId: input.underStoreId,
        allowTransfer: input.allowTransfer,
        allowDepartmentIssue: input.allowDepartmentIssue,
        remarks: input.remarks,
        isActive: input.isActive,
      })
      .returning({ id: stores.id });

    const created = rows[0];
    if (!created) {
      throw new AppError("Failed to create store", 500);
    }

    return getStoreById(created.id);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    mapStoreDatabaseError(error);
  }
}

export async function updateStore(
  id: string,
  input: UpdateStoreInput,
): Promise<Store> {
  const existing = await getStoreById(id);

  await assertBranchForSave(input.branchId, existing.branchId);
  await assertUnderStoreForSave(
    input.underStoreId,
    id,
    existing.underStoreId,
  );

  const existingCode = await findStoreByCodeInsensitive(input.storeCode, id);
  if (existingCode) {
    throw new AppError("A store with this code already exists.", 409);
  }

  const existingName = await findStoreByNameInBranchInsensitive(
    input.storeName,
    input.branchId,
    id,
  );
  if (existingName) {
    throw new AppError(
      "A store with this name already exists in the selected branch.",
      409,
    );
  }

  try {
    const rows = await getDb()
      .update(stores)
      .set({
        storeCode: input.storeCode,
        storeName: input.storeName,
        branchId: input.branchId,
        underStoreId: input.underStoreId,
        allowTransfer: input.allowTransfer,
        allowDepartmentIssue: input.allowDepartmentIssue,
        remarks: input.remarks,
        updatedAt: sql`now()`,
      })
      .where(eq(stores.id, id))
      .returning({ id: stores.id });

    const updated = rows[0];
    if (!updated) {
      throw new AppError("Store not found", 404);
    }

    return getStoreById(updated.id);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    mapStoreDatabaseError(error);
  }
}

export async function updateStoreStatus(
  id: string,
  input: UpdateStoreStatusInput,
): Promise<Store> {
  try {
    const rows = await getDb()
      .update(stores)
      .set({
        isActive: input.isActive,
        updatedAt: sql`now()`,
      })
      .where(eq(stores.id, id))
      .returning({ id: stores.id });

    const updated = rows[0];
    if (!updated) {
      throw new AppError("Store not found", 404);
    }

    return getStoreById(updated.id);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    mapStoreDatabaseError(error);
  }
}
