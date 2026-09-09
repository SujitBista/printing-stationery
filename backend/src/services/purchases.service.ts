import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type {
  AuthenticatedUser,
  CreatePurchaseInput,
  PaginatedPurchaseResponse,
  Purchase,
  PurchaseLine,
  PurchaseLineInput,
  PurchaseListItem,
  PurchaseListQuery,
  PurchasePartySummary,
  PurchaseStoreSummary,
  UpdatePurchaseInput,
} from "@printing-stationery/shared";
import {
  nepaliFiscalYearFromIsoDate,
  purchaseLineAmount,
  sumDecimalStrings,
  userHasAnyRole,
} from "@printing-stationery/shared";
import { getDb } from "../db/client.js";
import {
  applicationUsers,
  type ApplicationUserRow,
} from "../db/schema/auth.js";
import { employees, type EmployeeRow } from "../db/schema/employees.js";
import { items } from "../db/schema/items.js";
import { parties, type PartyRow } from "../db/schema/parties.js";
import {
  purchaseLines,
  purchases,
  type PurchaseRow,
} from "../db/schema/purchases.js";
import { stores, type StoreRow } from "../db/schema/stores.js";
import { units } from "../db/schema/units.js";
import { AppError } from "../utils/errors.js";
import { mapPurchaseDatabaseError } from "../utils/db-errors.js";

const STALE_PURCHASE_MESSAGE =
  "This purchase was updated by someone else. Reload and try again.";

const createdByUsers = alias(applicationUsers, "purchase_created_by_users");
const createdByEmployees = alias(employees, "purchase_created_by_employees");

function canMutatePurchases(actor: AuthenticatedUser): boolean {
  return userHasAnyRole(actor.roles, ["ADMIN", "MAKER"]);
}

function escapeIlikePattern(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function toStoreSummary(store: StoreRow): PurchaseStoreSummary {
  return {
    id: store.id,
    storeCode: store.storeCode,
    storeName: store.storeName,
    isActive: store.isActive,
  };
}

function toPartySummary(party: PartyRow): PurchasePartySummary {
  return {
    id: party.id,
    partyCode: party.partyCode,
    partyName: party.partyName,
    isActive: party.isActive,
  };
}

function toCreatedBy(
  user: ApplicationUserRow,
  employee: EmployeeRow | null,
) {
  return {
    id: user.id,
    username: user.username,
    isActive: user.isActive,
    employee: employee
      ? {
          id: employee.id,
          employeeCode: employee.employeeCode,
          employeeName: employee.employeeName,
          isActive: employee.isActive,
        }
      : null,
  };
}

type HeaderJoinedRow = {
  purchase: PurchaseRow;
  store: StoreRow;
  party: PartyRow;
  createdByUser: ApplicationUserRow;
  createdByEmployee: EmployeeRow | null;
};

const headerSelect = {
  purchase: purchases,
  store: stores,
  party: parties,
  createdByUser: createdByUsers,
  createdByEmployee: createdByEmployees,
};

function purchaseHeaderJoins() {
  return getDb()
    .select(headerSelect)
    .from(purchases)
    .innerJoin(stores, eq(purchases.storeId, stores.id))
    .innerJoin(parties, eq(purchases.partyId, parties.id))
    .innerJoin(
      createdByUsers,
      eq(purchases.createdByApplicationUserId, createdByUsers.id),
    )
    .leftJoin(
      createdByEmployees,
      eq(createdByUsers.employeeId, createdByEmployees.id),
    );
}

function toListItem(
  row: HeaderJoinedRow,
  actor: AuthenticatedUser,
): PurchaseListItem {
  const canMutate = canMutatePurchases(actor);
  return {
    id: row.purchase.id,
    purchaseNumber: row.purchase.purchaseNumber,
    fiscalYear: row.purchase.fiscalYear,
    purchaseDate: row.purchase.purchaseDate,
    purchaseBillDate: row.purchase.purchaseBillDate,
    store: toStoreSummary(row.store),
    party: toPartySummary(row.party),
    totalAmount: row.purchase.totalAmount,
    poNumber: row.purchase.poNumber,
    grnNumber: row.purchase.grnNumber,
    deliveryNoteNumber: row.purchase.deliveryNoteNumber,
    purchaseBillNumber: row.purchase.purchaseBillNumber,
    remarks: row.purchase.remarks,
    createdBy: toCreatedBy(row.createdByUser, row.createdByEmployee),
    version: row.purchase.version,
    createdAt: row.purchase.createdAt.toISOString(),
    updatedAt: row.purchase.updatedAt.toISOString(),
    canEdit: canMutate,
    canDelete: canMutate,
  };
}

function buildListFilters(query: PurchaseListQuery): SQL | undefined {
  const conditions: SQL[] = [];

  if (query.storeId) {
    conditions.push(eq(purchases.storeId, query.storeId));
  }
  if (query.partyId) {
    conditions.push(eq(purchases.partyId, query.partyId));
  }
  if (query.fiscalYear) {
    conditions.push(eq(purchases.fiscalYear, query.fiscalYear));
  }
  if (query.search) {
    const pattern = `%${escapeIlikePattern(query.search)}%`;
    const searchCondition = or(
      sql`${purchases.purchaseNumber} ILIKE ${pattern} ESCAPE '\\'`,
      sql`${purchases.fiscalYear} ILIKE ${pattern} ESCAPE '\\'`,
      sql`${purchases.poNumber} ILIKE ${pattern} ESCAPE '\\'`,
      sql`${purchases.grnNumber} ILIKE ${pattern} ESCAPE '\\'`,
      sql`${purchases.deliveryNoteNumber} ILIKE ${pattern} ESCAPE '\\'`,
      sql`${purchases.purchaseBillNumber} ILIKE ${pattern} ESCAPE '\\'`,
      sql`${purchases.remarks} ILIKE ${pattern} ESCAPE '\\'`,
      sql`${stores.storeName} ILIKE ${pattern} ESCAPE '\\'`,
      sql`${stores.storeCode} ILIKE ${pattern} ESCAPE '\\'`,
      sql`${parties.partyName} ILIKE ${pattern} ESCAPE '\\'`,
      sql`${parties.partyCode} ILIKE ${pattern} ESCAPE '\\'`,
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

async function loadLines(purchaseId: string): Promise<PurchaseLine[]> {
  const rows = await getDb()
    .select({
      line: purchaseLines,
      item: items,
      unitName: units.unitName,
      unitId: units.id,
    })
    .from(purchaseLines)
    .innerJoin(items, eq(purchaseLines.itemId, items.id))
    .innerJoin(units, eq(items.unitId, units.id))
    .where(eq(purchaseLines.purchaseId, purchaseId))
    .orderBy(asc(items.itemName), asc(purchaseLines.id));

  return rows.map((row) => ({
    id: row.line.id,
    itemId: row.line.itemId,
    quantity: row.line.quantity,
    rate: row.line.rate,
    amount: row.line.amount,
    createdAt: row.line.createdAt.toISOString(),
    updatedAt: row.line.updatedAt.toISOString(),
    item: {
      id: row.item.id,
      itemCode: row.item.itemCode,
      itemName: row.item.itemName,
      isActive: row.item.isActive,
      purchaseRate: row.item.purchaseRate,
      unit: {
        id: row.unitId,
        unitName: row.unitName,
      },
    },
  }));
}

async function assertStore(storeId: string, requireActive: boolean): Promise<void> {
  const rows = await getDb()
    .select({ id: stores.id, isActive: stores.isActive })
    .from(stores)
    .where(eq(stores.id, storeId))
    .limit(1);
  const store = rows[0];
  if (!store) {
    throw new AppError("Store not found", 400);
  }
  if (requireActive && !store.isActive) {
    throw new AppError("The selected store is inactive", 400);
  }
}

async function assertParty(partyId: string, requireActive: boolean): Promise<void> {
  const rows = await getDb()
    .select({ id: parties.id, isActive: parties.isActive })
    .from(parties)
    .where(eq(parties.id, partyId))
    .limit(1);
  const party = rows[0];
  if (!party) {
    throw new AppError("Party not found", 400);
  }
  if (requireActive && !party.isActive) {
    throw new AppError("The selected party is inactive", 400);
  }
}

async function assertPurchaseLines(
  lines: PurchaseLineInput[],
  allowedInactiveItemIds: Set<string>,
): Promise<Array<PurchaseLineInput & { amount: string }>> {
  const itemIds = lines.map((line) => line.itemId);
  const itemRows = await getDb()
    .select({
      id: items.id,
      isActive: items.isActive,
    })
    .from(items)
    .where(inArray(items.id, itemIds));

  const byId = new Map(itemRows.map((row) => [row.id, row]));
  const prepared: Array<PurchaseLineInput & { amount: string }> = [];

  for (const line of lines) {
    const item = byId.get(line.itemId);
    if (!item) {
      throw new AppError("One or more purchase items were not found", 400);
    }
    if (!item.isActive && !allowedInactiveItemIds.has(item.id)) {
      throw new AppError("Inactive items cannot be added to a purchase", 400);
    }
    prepared.push({
      ...line,
      amount: purchaseLineAmount(line.quantity, line.rate),
    });
  }

  return prepared;
}

async function insertLines(
  tx: Pick<ReturnType<typeof getDb>, "insert">,
  purchaseId: string,
  lines: Array<PurchaseLineInput & { amount: string }>,
): Promise<void> {
  await tx.insert(purchaseLines).values(
    lines.map((line) => ({
      purchaseId,
      itemId: line.itemId,
      quantity: line.quantity,
      rate: line.rate,
      amount: line.amount,
    })),
  );
}

async function getHeaderRow(id: string): Promise<HeaderJoinedRow> {
  const rows = await purchaseHeaderJoins()
    .where(eq(purchases.id, id))
    .limit(1);
  const row = rows[0];
  if (!row) {
    throw new AppError("Purchase not found", 404);
  }
  return row as HeaderJoinedRow;
}

export async function listPurchases(
  actor: AuthenticatedUser,
  query: PurchaseListQuery,
): Promise<PaginatedPurchaseResponse> {
  const where = buildListFilters(query);

  try {
    const countRows = where
      ? await getDb()
          .select({ value: count() })
          .from(purchases)
          .innerJoin(stores, eq(purchases.storeId, stores.id))
          .innerJoin(parties, eq(purchases.partyId, parties.id))
          .where(where)
      : await getDb().select({ value: count() }).from(purchases);
    const totalItems = countRows[0]?.value ?? 0;
    const totalPages =
      totalItems === 0 ? 0 : Math.ceil(totalItems / query.pageSize);
    const offset = (query.page - 1) * query.pageSize;

    const listQuery = where
      ? purchaseHeaderJoins()
          .where(where)
          .orderBy(desc(purchases.purchaseDate), desc(purchases.purchaseNumber))
          .limit(query.pageSize)
          .offset(offset)
      : purchaseHeaderJoins()
          .orderBy(desc(purchases.purchaseDate), desc(purchases.purchaseNumber))
          .limit(query.pageSize)
          .offset(offset);

    const rows = (await listQuery) as HeaderJoinedRow[];

    return {
      items: rows.map((row) => toListItem(row, actor)),
      page: query.page,
      pageSize: query.pageSize,
      totalItems,
      totalPages,
      canCreate: canMutatePurchases(actor),
    };
  } catch (error) {
    mapPurchaseDatabaseError(error);
  }
}

export async function getPurchaseById(
  id: string,
  actor: AuthenticatedUser,
): Promise<Purchase> {
  try {
    const row = await getHeaderRow(id);
    const lines = await loadLines(id);
    const listItem = toListItem(row, actor);
    return {
      ...listItem,
      storeId: row.purchase.storeId,
      partyId: row.purchase.partyId,
      createdByApplicationUserId: row.purchase.createdByApplicationUserId,
      lines,
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    mapPurchaseDatabaseError(error);
  }
}

export async function createPurchase(
  actor: AuthenticatedUser,
  input: CreatePurchaseInput,
): Promise<Purchase> {
  if (!canMutatePurchases(actor)) {
    throw new AppError("You cannot create a purchase record", 403);
  }

  await assertStore(input.storeId, true);
  await assertParty(input.partyId, true);
  const preparedLines = await assertPurchaseLines(input.lines, new Set());
  const totalAmount = sumDecimalStrings(
    preparedLines.map((line) => line.amount),
  );
  const fiscalYear = nepaliFiscalYearFromIsoDate(input.purchaseDate);

  try {
    const createdId = await getDb().transaction(async (tx) => {
      const inserted = await tx
        .insert(purchases)
        .values({
          fiscalYear,
          purchaseDate: input.purchaseDate,
          purchaseBillDate: input.purchaseBillDate,
          storeId: input.storeId,
          partyId: input.partyId,
          totalAmount,
          poNumber: input.poNumber,
          grnNumber: input.grnNumber,
          deliveryNoteNumber: input.deliveryNoteNumber,
          purchaseBillNumber: input.purchaseBillNumber,
          remarks: input.remarks,
          createdByApplicationUserId: actor.id,
          version: 1,
        })
        .returning({ id: purchases.id });

      const created = inserted[0];
      if (!created) {
        throw new AppError("Failed to create purchase", 500);
      }

      await insertLines(tx, created.id, preparedLines);
      return created.id;
    });

    return getPurchaseById(createdId, actor);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    mapPurchaseDatabaseError(error);
  }
}

export async function updatePurchase(
  id: string,
  actor: AuthenticatedUser,
  input: UpdatePurchaseInput,
): Promise<Purchase> {
  if (!canMutatePurchases(actor)) {
    throw new AppError("You cannot edit a purchase record", 403);
  }

  const existing = await getHeaderRow(id);
  await assertStore(input.storeId, input.storeId !== existing.purchase.storeId);
  await assertParty(input.partyId, input.partyId !== existing.purchase.partyId);

  const existingLines = await loadLines(id);
  const allowedInactiveItemIds = new Set(existingLines.map((line) => line.itemId));
  const preparedLines = await assertPurchaseLines(
    input.lines,
    allowedInactiveItemIds,
  );
  const totalAmount = sumDecimalStrings(
    preparedLines.map((line) => line.amount),
  );
  const fiscalYear = nepaliFiscalYearFromIsoDate(input.purchaseDate);

  try {
    await getDb().transaction(async (tx) => {
      const updated = await tx
        .update(purchases)
        .set({
          fiscalYear,
          purchaseDate: input.purchaseDate,
          purchaseBillDate: input.purchaseBillDate,
          storeId: input.storeId,
          partyId: input.partyId,
          totalAmount,
          poNumber: input.poNumber,
          grnNumber: input.grnNumber,
          deliveryNoteNumber: input.deliveryNoteNumber,
          purchaseBillNumber: input.purchaseBillNumber,
          remarks: input.remarks,
          version: existing.purchase.version + 1,
          updatedAt: sql`now()`,
        })
        .where(
          and(
            eq(purchases.id, id),
            eq(purchases.version, input.expectedVersion),
          ),
        )
        .returning({ id: purchases.id });

      if (!updated[0]) {
        throw new AppError(STALE_PURCHASE_MESSAGE, 409);
      }

      await tx.delete(purchaseLines).where(eq(purchaseLines.purchaseId, id));
      await insertLines(tx, id, preparedLines);
    });

    return getPurchaseById(id, actor);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    mapPurchaseDatabaseError(error);
  }
}

export async function deletePurchase(
  id: string,
  actor: AuthenticatedUser,
  expectedVersion: number,
): Promise<void> {
  if (!canMutatePurchases(actor)) {
    throw new AppError("You cannot delete a purchase record", 403);
  }

  try {
    const deleted = await getDb()
      .delete(purchases)
      .where(
        and(eq(purchases.id, id), eq(purchases.version, expectedVersion)),
      )
      .returning({ id: purchases.id });

    if (!deleted[0]) {
      const existing = await getDb()
        .select({ id: purchases.id, version: purchases.version })
        .from(purchases)
        .where(eq(purchases.id, id))
        .limit(1);
      if (!existing[0]) {
        throw new AppError("Purchase not found", 404);
      }
      throw new AppError(STALE_PURCHASE_MESSAGE, 409);
    }
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    mapPurchaseDatabaseError(error);
  }
}
