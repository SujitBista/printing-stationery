import { and, asc, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import type {
  AuthenticatedUser,
  ItemRequestPersonSummary,
  StockBalance,
  StockBalanceListQuery,
  StockBalanceResponse,
  StockBalanceSortField,
  StockLedgerEntry,
  StockLedgerListQuery,
  StockLedgerMovementType,
  StockLedgerResponse,
} from "@printing-stationery/shared";
import {
  formatQuantityString,
  LEGACY_OPENING_IN_TRANSIT_SOURCE_LABEL,
  UNKNOWN_LEGACY_SOURCE_LABEL,
  isLegacyOpeningInTransitMovement,
  totalTrackedQuantity,
  userHasAnyRole,
} from "@printing-stationery/shared";
import { getDb } from "../db/client.js";
import {
  applicationUsers,
  branches,
  departments,
  employees,
  itemIssueReceipts,
  itemIssueShipments,
  itemIssues,
  items,
  openingStockBatches,
  purchases,
  stockLedger,
  stores,
  units,
} from "../db/schema/index.js";
import { AppError } from "../utils/errors.js";
import { databaseUnavailableError, isDatabaseUnavailableError } from "../utils/db-errors.js";
import {
  listVisibleInventoryStores,
  type VisibleInventoryStore,
} from "./store-users.assignment.js";

const STOCK_BALANCE_FORBIDDEN_MESSAGE =
  "You do not have permission to view stock balances.";
const STOCK_BALANCE_STORE_FORBIDDEN_MESSAGE =
  "You do not have permission to view this store's stock balance.";

type PostedByAlias = {
  id: string;
  username: string;
  isActive: boolean;
  employeeId: string | null;
};

type EmployeeAlias = {
  id: string;
  employeeCode: string;
  employeeName: string;
  isActive: boolean;
};

function canAccessStockBalance(actor: AuthenticatedUser): boolean {
  return userHasAnyRole(actor.roles, ["ADMIN", "MAKER", "CHECKER"]);
}

function requireStockBalanceAccess(actor: AuthenticatedUser): void {
  if (!canAccessStockBalance(actor)) {
    throw new AppError(STOCK_BALANCE_FORBIDDEN_MESSAGE, 403);
  }
}

function toIsoTimestamp(value: Date | string | null | undefined): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return new Date(String(value)).toISOString();
}

function escapeIlikePattern(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function categoryQuantitySql(
  category: "AVAILABLE" | "IN_TRANSIT" | "DAMAGED" | "DISCREPANCY",
  alias: string,
) {
  return sql<string>`coalesce(sum(case when ${stockLedger.stockCategory} = ${category} then ${stockLedger.quantityIn}::numeric - ${stockLedger.quantityOut}::numeric else 0 end), 0)::text`.as(
    alias,
  );
}

function toPersonSummary(
  user: PostedByAlias,
  employee: EmployeeAlias | null | undefined,
): ItemRequestPersonSummary {
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

function toStoreOption(store: VisibleInventoryStore) {
  return {
    id: store.id,
    storeCode: store.storeCode,
    storeName: store.storeName,
    isActive: store.isActive,
    branchId: store.branchId,
    branchCode: store.branchCode,
    branchName: store.branchName,
  };
}

function emptyBalanceResponse(params: {
  query: StockBalanceListQuery;
  visibleStores: VisibleInventoryStore[];
  canSelectStore: boolean;
  lockedStoreId: string | null;
  hasLedgerActivity: boolean;
  emptyReason: StockBalanceResponse["emptyReason"];
}): StockBalanceResponse {
  return {
    data: [],
    pagination: {
      page: params.query.page,
      pageSize: params.query.pageSize,
      totalItems: 0,
      totalPages: 0,
    },
    summaryByUnit: [],
    visibleStores: params.visibleStores.map(toStoreOption),
    canSelectStore: params.canSelectStore,
    lockedStoreId: params.lockedStoreId,
    hasLedgerActivity: params.hasLedgerActivity,
    emptyReason: params.emptyReason,
  };
}

async function resolveAuthorizedStoreIds(
  actor: AuthenticatedUser,
  queryStoreId: string | undefined,
): Promise<{
  access: Awaited<ReturnType<typeof listVisibleInventoryStores>>;
  authorizedStoreIds: string[] | null;
  canSelectStore: boolean;
  lockedStoreId: string | null;
}> {
  requireStockBalanceAccess(actor);
  const access = await listVisibleInventoryStores(actor);
  const canSelectStore = access.unrestricted || access.stores.length > 1;
  const lockedStoreId =
    !canSelectStore && access.stores.length === 1 ? access.stores[0]!.id : null;
  const requestedStoreId = queryStoreId ?? lockedStoreId ?? undefined;

  if (requestedStoreId) {
    const allowed =
      access.unrestricted ||
      access.stores.some((store) => store.id === requestedStoreId);
    if (!allowed) {
      throw new AppError(STOCK_BALANCE_STORE_FORBIDDEN_MESSAGE, 403);
    }
    return {
      access,
      authorizedStoreIds: [requestedStoreId],
      canSelectStore,
      lockedStoreId,
    };
  }

  if (!access.unrestricted) {
    return {
      access,
      authorizedStoreIds: access.stores.map((store) => store.id),
      canSelectStore,
      lockedStoreId,
    };
  }

  return {
    access,
    authorizedStoreIds: null,
    canSelectStore,
    lockedStoreId,
  };
}

function sortColumns(
  grouped: {
    storeName: unknown;
    itemCode: unknown;
    itemName: unknown;
    unitName: unknown;
    availableQuantity: unknown;
    inTransitQuantity: unknown;
    damagedQuantity: unknown;
    discrepancyQuantity: unknown;
    lastMovementAt: unknown;
  },
  sortBy: StockBalanceSortField,
): SQL {
  switch (sortBy) {
    case "storeName":
      return sql`${grouped.storeName}`;
    case "itemCode":
      return sql`${grouped.itemCode}`;
    case "availableQuantity":
      return sql`${grouped.availableQuantity}::numeric`;
    case "inTransitQuantity":
      return sql`${grouped.inTransitQuantity}::numeric`;
    case "damagedQuantity":
      return sql`${grouped.damagedQuantity}::numeric`;
    case "discrepancyQuantity":
      return sql`${grouped.discrepancyQuantity}::numeric`;
    case "lastMovementAt":
      return sql`${grouped.lastMovementAt}`;
    default:
      return sql`${grouped.itemName}`;
  }
}

function sourceHref(
  movementType: StockLedgerMovementType,
  params: {
    referenceId: string;
    issueId: string | null;
    shipmentId: string | null;
  },
): string | null {
  switch (movementType) {
    case "OPENING_STOCK":
    case "LEGACY_OPENING_IN_TRANSIT":
    case "LEGACY_OPENING_IN_TRANSIT_RECEIPT":
      return `/stock/opening-stock/${params.referenceId}`;
    case "PURCHASE":
      return `/purchases/${params.referenceId}`;
    case "DEPARTMENT_CONSUMPTION":
    case "ITEM_ISSUE":
      return `/requests/item-issues/${params.issueId ?? params.referenceId}`;
    case "ITEM_ISSUE_IN_TRANSIT":
    case "ITEM_ISSUE_RECEIPT":
    case "ITEM_ISSUE_DISCREPANCY":
      if (params.shipmentId) {
        return `/requests/incoming-items/${params.shipmentId}`;
      }
      if (params.issueId) {
        return `/requests/item-issues/${params.issueId}`;
      }
      return null;
    default:
      return null;
  }
}

export async function listStockBalances(
  actor: AuthenticatedUser,
  query: StockBalanceListQuery,
): Promise<StockBalanceResponse> {
  try {
    const { access, authorizedStoreIds, canSelectStore, lockedStoreId } =
      await resolveAuthorizedStoreIds(actor, query.storeId);

    if (authorizedStoreIds && authorizedStoreIds.length === 0) {
      return emptyBalanceResponse({
        query,
        visibleStores: access.stores,
        canSelectStore,
        lockedStoreId,
        hasLedgerActivity: false,
        emptyReason: "NO_MOVEMENTS",
      });
    }

    const conditions: SQL[] = [];
    if (authorizedStoreIds) {
      conditions.push(inArray(stockLedger.storeId, authorizedStoreIds));
    }
    if (query.branchId) {
      const branchAllowed =
        access.unrestricted ||
        access.stores.some((store) => store.branchId === query.branchId);
      if (!branchAllowed) {
        throw new AppError(STOCK_BALANCE_STORE_FORBIDDEN_MESSAGE, 403);
      }
      conditions.push(eq(branches.id, query.branchId));
    }
    if (query.itemId) {
      conditions.push(eq(stockLedger.itemId, query.itemId));
    }
    if (query.itemGroupId) {
      conditions.push(eq(items.itemGroupId, query.itemGroupId));
    }
    if (query.search) {
      const pattern = `%${escapeIlikePattern(query.search)}%`;
      conditions.push(
        or(
          ilike(items.itemCode, pattern),
          ilike(items.itemName, pattern),
          ilike(stores.storeName, pattern),
          ilike(stores.storeCode, pattern),
        )!,
      );
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const activityStoreIds =
      authorizedStoreIds ??
      (query.storeId ? [query.storeId] : null);
    const activityRows = activityStoreIds
      ? await getDb()
          .select({ id: stockLedger.id })
          .from(stockLedger)
          .where(inArray(stockLedger.storeId, activityStoreIds))
          .limit(1)
      : await getDb().select({ id: stockLedger.id }).from(stockLedger).limit(1);
    const hasLedgerActivity = activityRows.length > 0;

    const grouped = getDb()
      .select({
        storeId: sql<string>`${stores.id}`.as("store_id"),
        storeCode: sql<string>`${stores.storeCode}`.as("store_code"),
        storeName: sql<string>`${stores.storeName}`.as("store_name"),
        branchId: sql<string>`${branches.id}`.as("branch_id"),
        branchCode: sql<string>`${branches.branchCode}`.as("branch_code"),
        branchName: sql<string>`${branches.branchName}`.as("branch_name"),
        itemId: sql<string>`${items.id}`.as("item_id"),
        itemCode: sql<string>`${items.itemCode}`.as("item_code"),
        itemName: sql<string>`${items.itemName}`.as("item_name"),
        unitId: sql<string>`${units.id}`.as("unit_id"),
        unitName: sql<string>`${units.unitName}`.as("unit_name"),
        availableQuantity: categoryQuantitySql("AVAILABLE", "available_quantity"),
        inTransitQuantity: categoryQuantitySql("IN_TRANSIT", "in_transit_quantity"),
        damagedQuantity: categoryQuantitySql("DAMAGED", "damaged_quantity"),
        discrepancyQuantity: categoryQuantitySql(
          "DISCREPANCY",
          "discrepancy_quantity",
        ),
        lastMovementAt: sql<Date>`max(${stockLedger.transactionDate})`.as(
          "last_movement_at",
        ),
      })
      .from(stockLedger)
      .innerJoin(stores, eq(stockLedger.storeId, stores.id))
      .innerJoin(branches, eq(stores.branchId, branches.id))
      .innerJoin(items, eq(stockLedger.itemId, items.id))
      .innerJoin(units, eq(stockLedger.unitId, units.id))
      .where(where)
      .groupBy(
        stores.id,
        stores.storeCode,
        stores.storeName,
        branches.id,
        branches.branchCode,
        branches.branchName,
        items.id,
        items.itemCode,
        items.itemName,
        units.id,
        units.unitName,
      )
      .as("stock_balance_grouped");

    const zeroFilter = query.includeZeroBalance
      ? undefined
      : sql`(
          ${grouped.availableQuantity}::numeric <> 0
          or ${grouped.inTransitQuantity}::numeric <> 0
          or ${grouped.damagedQuantity}::numeric <> 0
          or ${grouped.discrepancyQuantity}::numeric <> 0
        )`;

    const [countRow] = await getDb()
      .select({ totalItems: sql<number>`count(*)::int` })
      .from(grouped)
      .where(zeroFilter);
    const totalItems = Number(countRow?.totalItems ?? 0);
    if (totalItems === 0) {
      return emptyBalanceResponse({
        query,
        visibleStores: access.stores,
        canSelectStore,
        lockedStoreId,
        hasLedgerActivity,
        emptyReason: hasLedgerActivity ? "NO_MATCHES" : "NO_MOVEMENTS",
      });
    }

    const summaryRows = await getDb()
      .select({
        unitId: grouped.unitId,
        unitName: grouped.unitName,
        availableQuantity: sql<string>`coalesce(sum(${grouped.availableQuantity}::numeric), 0)::text`,
        inTransitQuantity: sql<string>`coalesce(sum(${grouped.inTransitQuantity}::numeric), 0)::text`,
        damagedQuantity: sql<string>`coalesce(sum(${grouped.damagedQuantity}::numeric), 0)::text`,
        discrepancyQuantity: sql<string>`coalesce(sum(${grouped.discrepancyQuantity}::numeric), 0)::text`,
        rowCount: sql<number>`count(*)::int`,
      })
      .from(grouped)
      .where(zeroFilter)
      .groupBy(grouped.unitId, grouped.unitName)
      .orderBy(asc(grouped.unitName));

    const totalPages = Math.ceil(totalItems / query.pageSize);
    const offset = (query.page - 1) * query.pageSize;
    const sortSql = sortColumns(grouped, query.sortBy);
    const pageRows = await getDb()
      .select()
      .from(grouped)
      .where(zeroFilter)
      .orderBy(
        query.sortOrder === "desc" ? desc(sortSql) : asc(sortSql),
        asc(grouped.storeName),
        asc(grouped.itemName),
        asc(grouped.unitName),
      )
      .limit(query.pageSize)
      .offset(offset);

    const data: StockBalance[] = pageRows.map((row) => {
      const availableQuantity = formatQuantityString(String(row.availableQuantity));
      const inTransitQuantity = formatQuantityString(String(row.inTransitQuantity));
      const damagedQuantity = formatQuantityString(String(row.damagedQuantity));
      const discrepancyQuantity = formatQuantityString(
        String(row.discrepancyQuantity),
      );
      const lastMovementAt = toIsoTimestamp(row.lastMovementAt as Date | string);
      return {
        storeId: row.storeId,
        storeCode: row.storeCode,
        storeName: row.storeName,
        branchId: row.branchId,
        branchCode: row.branchCode,
        branchName: row.branchName,
        itemId: row.itemId,
        itemCode: row.itemCode,
        itemName: row.itemName,
        unitId: row.unitId,
        unitName: row.unitName,
        availableQuantity,
        inTransitQuantity,
        damagedQuantity,
        discrepancyQuantity,
        totalTrackedQuantity: totalTrackedQuantity({
          availableQuantity,
          inTransitQuantity,
          damagedQuantity,
          discrepancyQuantity,
        }),
        lastMovementAt,
      };
    });

    return {
      data,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        totalItems,
        totalPages,
      },
      summaryByUnit: summaryRows.map((row) => {
        const availableQuantity = formatQuantityString(
          String(row.availableQuantity),
        );
        const inTransitQuantity = formatQuantityString(
          String(row.inTransitQuantity),
        );
        const damagedQuantity = formatQuantityString(String(row.damagedQuantity));
        const discrepancyQuantity = formatQuantityString(
          String(row.discrepancyQuantity),
        );
        return {
          unitId: row.unitId,
          unitName: row.unitName,
          availableQuantity,
          inTransitQuantity,
          damagedQuantity,
          discrepancyQuantity,
          totalTrackedQuantity: totalTrackedQuantity({
            availableQuantity,
            inTransitQuantity,
            damagedQuantity,
            discrepancyQuantity,
          }),
          rowCount: Number(row.rowCount),
        };
      }),
      visibleStores: access.stores.map(toStoreOption),
      canSelectStore,
      lockedStoreId,
      hasLedgerActivity,
      emptyReason: "NONE",
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    if (isDatabaseUnavailableError(error)) {
      throw databaseUnavailableError(error);
    }
    throw error;
  }
}

export async function listStockLedgerEntries(
  actor: AuthenticatedUser,
  query: StockLedgerListQuery,
): Promise<StockLedgerResponse> {
  try {
    await resolveAuthorizedStoreIds(actor, query.storeId);

    const contextRows = await getDb()
      .select({
        storeId: stores.id,
        storeCode: stores.storeCode,
        storeName: stores.storeName,
        branchName: branches.branchName,
        itemId: items.id,
        itemCode: items.itemCode,
        itemName: items.itemName,
        unitId: units.id,
        unitName: units.unitName,
      })
      .from(stores)
      .innerJoin(branches, eq(stores.branchId, branches.id))
      .innerJoin(items, eq(items.id, query.itemId))
      .innerJoin(units, eq(units.id, query.unitId))
      .where(eq(stores.id, query.storeId))
      .limit(1);
    const context = contextRows[0];
    if (!context) {
      throw new AppError("Store, item, or unit was not found.", 404);
    }

    const conditions: SQL[] = [
      eq(stockLedger.storeId, query.storeId),
      eq(stockLedger.itemId, query.itemId),
      eq(stockLedger.unitId, query.unitId),
    ];
    if (query.stockCategory !== "ALL") {
      conditions.push(eq(stockLedger.stockCategory, query.stockCategory));
    }

    const ledgerRows = await getDb()
      .select({
        ledger: stockLedger,
        postedByUser: {
          id: applicationUsers.id,
          username: applicationUsers.username,
          isActive: applicationUsers.isActive,
          employeeId: applicationUsers.employeeId,
        },
        postedByEmployee: employees,
      })
      .from(stockLedger)
      .innerJoin(
        applicationUsers,
        eq(stockLedger.postedByApplicationUserId, applicationUsers.id),
      )
      .leftJoin(employees, eq(applicationUsers.employeeId, employees.id))
      .where(and(...conditions))
      .orderBy(
        asc(stockLedger.transactionDate),
        asc(stockLedger.createdAt),
        asc(stockLedger.id),
      );

    const openingIds = [
      ...new Set(
        ledgerRows
          .filter(
            (row) =>
              row.ledger.referenceType === "OPENING_STOCK" ||
              row.ledger.referenceType === "LEGACY_OPENING_IN_TRANSIT" ||
              row.ledger.referenceType === "LEGACY_OPENING_IN_TRANSIT_RECEIPT",
          )
          .map((row) => row.ledger.referenceId),
      ),
    ];
    const purchaseIds = [
      ...new Set(
        ledgerRows
          .filter((row) => row.ledger.referenceType === "PURCHASE")
          .map((row) => row.ledger.referenceId),
      ),
    ];
    const issueIds = [
      ...new Set(
        ledgerRows
          .filter(
            (row) =>
              row.ledger.referenceType === "ITEM_ISSUE" ||
              row.ledger.referenceType === "DEPARTMENT_CONSUMPTION",
          )
          .map((row) => row.ledger.referenceId),
      ),
    ];
    const shipmentIds = [
      ...new Set(
        ledgerRows
          .filter((row) => row.ledger.referenceType === "ITEM_ISSUE_IN_TRANSIT")
          .map((row) => row.ledger.referenceId),
      ),
    ];
    const receiptIds = [
      ...new Set(
        ledgerRows
          .filter(
            (row) =>
              row.ledger.referenceType === "ITEM_ISSUE_RECEIPT" ||
              row.ledger.referenceType === "ITEM_ISSUE_DISCREPANCY",
          )
          .map((row) => row.ledger.referenceId),
      ),
    ];

    const [openingRows, purchaseRows, issueRows, shipmentRows, receiptRows] =
      await Promise.all([
        openingIds.length > 0
          ? getDb()
              .select({
                id: openingStockBatches.id,
                batchNumber: openingStockBatches.batchNumber,
                remarks: openingStockBatches.remarks,
              })
              .from(openingStockBatches)
              .where(inArray(openingStockBatches.id, openingIds))
          : Promise.resolve([]),
        purchaseIds.length > 0
          ? getDb()
              .select({
                id: purchases.id,
                purchaseNumber: purchases.purchaseNumber,
                remarks: purchases.remarks,
                storeId: purchases.storeId,
              })
              .from(purchases)
              .where(inArray(purchases.id, purchaseIds))
          : Promise.resolve([]),
        issueIds.length > 0
          ? getDb()
              .select({
                issue: itemIssues,
                departmentName: departments.departmentName,
                fromStore: stores,
                verifiedUser: {
                  id: applicationUsers.id,
                  username: applicationUsers.username,
                  isActive: applicationUsers.isActive,
                  employeeId: applicationUsers.employeeId,
                },
              })
              .from(itemIssues)
              .leftJoin(departments, eq(itemIssues.departmentId, departments.id))
              .innerJoin(stores, eq(itemIssues.fromStoreId, stores.id))
              .leftJoin(
                applicationUsers,
                eq(itemIssues.verifiedByApplicationUserId, applicationUsers.id),
              )
              .where(inArray(itemIssues.id, issueIds))
          : Promise.resolve([]),
        shipmentIds.length > 0
          ? getDb()
              .select({
                shipment: itemIssueShipments,
                issueNumber: itemIssues.issueNumber,
                issueId: itemIssues.id,
                fromStore: {
                  id: stores.id,
                  storeCode: stores.storeCode,
                  storeName: stores.storeName,
                },
              })
              .from(itemIssueShipments)
              .innerJoin(itemIssues, eq(itemIssueShipments.itemIssueId, itemIssues.id))
              .innerJoin(stores, eq(itemIssueShipments.fromStoreId, stores.id))
              .where(inArray(itemIssueShipments.id, shipmentIds))
          : Promise.resolve([]),
        receiptIds.length > 0
          ? getDb()
              .select({
                receipt: itemIssueReceipts,
                shipment: itemIssueShipments,
                issueNumber: itemIssues.issueNumber,
                issueId: itemIssues.id,
                fromStore: {
                  id: stores.id,
                  storeCode: stores.storeCode,
                  storeName: stores.storeName,
                },
                verifiedUser: {
                  id: applicationUsers.id,
                  username: applicationUsers.username,
                  isActive: applicationUsers.isActive,
                  employeeId: applicationUsers.employeeId,
                },
              })
              .from(itemIssueReceipts)
              .innerJoin(
                itemIssueShipments,
                eq(itemIssueReceipts.shipmentId, itemIssueShipments.id),
              )
              .innerJoin(itemIssues, eq(itemIssueShipments.itemIssueId, itemIssues.id))
              .innerJoin(stores, eq(itemIssueShipments.fromStoreId, stores.id))
              .leftJoin(
                applicationUsers,
                eq(itemIssueReceipts.verifiedByApplicationUserId, applicationUsers.id),
              )
              .where(inArray(itemIssueReceipts.id, receiptIds))
          : Promise.resolve([]),
      ]);

    const openingById = new Map(openingRows.map((row) => [row.id, row]));
    const purchaseById = new Map(purchaseRows.map((row) => [row.id, row]));
    const issueById = new Map(issueRows.map((row) => [row.issue.id, row]));
    const shipmentById = new Map(shipmentRows.map((row) => [row.shipment.id, row]));
    const receiptById = new Map(receiptRows.map((row) => [row.receipt.id, row]));

    const toStoreRows = await getDb()
      .select({
        id: stores.id,
        storeCode: stores.storeCode,
        storeName: stores.storeName,
      })
      .from(stores)
      .where(eq(stores.id, query.storeId))
      .limit(1);
    const currentStore = toStoreRows[0] ?? {
      id: context.storeId,
      storeCode: context.storeCode,
      storeName: context.storeName,
    };

    const extraUserIds = [
      ...issueRows
        .map((row) => row.verifiedUser?.id)
        .filter((id): id is string => Boolean(id)),
      ...receiptRows
        .map((row) => row.verifiedUser?.id)
        .filter((id): id is string => Boolean(id)),
    ];
    const extraUsers =
      extraUserIds.length > 0
        ? await getDb()
            .select({
              user: {
                id: applicationUsers.id,
                username: applicationUsers.username,
                isActive: applicationUsers.isActive,
                employeeId: applicationUsers.employeeId,
              },
              employee: employees,
            })
            .from(applicationUsers)
            .leftJoin(employees, eq(applicationUsers.employeeId, employees.id))
            .where(inArray(applicationUsers.id, extraUserIds))
        : [];
    const extraUserById = new Map(
      extraUsers.map((row) => [row.user.id, toPersonSummary(row.user, row.employee)]),
    );

    const destinationIssueIds = [
      ...new Set(
        issueRows
          .map((row) => row.issue.toStoreId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const destinationStores =
      destinationIssueIds.length > 0
        ? await getDb()
            .select({
              id: stores.id,
              storeCode: stores.storeCode,
              storeName: stores.storeName,
            })
            .from(stores)
            .where(inArray(stores.id, destinationIssueIds))
        : [];
    const destinationById = new Map(destinationStores.map((row) => [row.id, row]));

    const running = new Map<string, bigint>();
    const parseScaled = (value: string): bigint => {
      const negative = value.startsWith("-");
      const unsigned = negative ? value.slice(1) : value;
      const [whole = "0", fraction = ""] = unsigned.split(".");
      const scaled = BigInt(whole) * 10_000n + BigInt(fraction.padEnd(4, "0"));
      return negative ? -scaled : scaled;
    };
    const formatScaled = (value: bigint): string => {
      const sign = value < 0n ? "-" : "";
      const absolute = value < 0n ? -value : value;
      const whole = absolute / 10_000n;
      const fraction = (absolute % 10_000n).toString().padStart(4, "0");
      const trimmed = fraction.replace(/0+$/, "");
      return trimmed.length > 0
        ? `${sign}${whole.toString()}.${trimmed}`
        : `${sign}${whole.toString()}`;
    };

    const entries: StockLedgerEntry[] = ledgerRows.map((row) => {
      const quantityIn = formatQuantityString(String(row.ledger.quantityIn));
      const quantityOut = formatQuantityString(String(row.ledger.quantityOut));
      const net = parseScaled(quantityIn) - parseScaled(quantityOut);
      const next = (running.get(row.ledger.stockCategory) ?? 0n) + net;
      running.set(row.ledger.stockCategory, next);

      const movementType = row.ledger.movementType as StockLedgerMovementType;
      let referenceNumber: string | null = null;
      let remarks: string | null = null;
      let sourceStore: StockLedgerEntry["sourceStore"] = null;
      let sourceStoreLabel: string | null = null;
      let destinationStore: StockLedgerEntry["destinationStore"] = null;
      let departmentName: string | null = null;
      let verifiedBy: ItemRequestPersonSummary | null = null;
      let issueId: string | null = null;
      let shipmentId: string | null = null;

      if (
        row.ledger.referenceType === "OPENING_STOCK" ||
        row.ledger.referenceType === "LEGACY_OPENING_IN_TRANSIT" ||
        row.ledger.referenceType === "LEGACY_OPENING_IN_TRANSIT_RECEIPT"
      ) {
        const opening = openingById.get(row.ledger.referenceId);
        referenceNumber = opening?.batchNumber ?? null;
        remarks = opening?.remarks ?? null;
        destinationStore = currentStore;
        if (isLegacyOpeningInTransitMovement(movementType)) {
          sourceStore = null;
          sourceStoreLabel = LEGACY_OPENING_IN_TRANSIT_SOURCE_LABEL;
          remarks = remarks ?? UNKNOWN_LEGACY_SOURCE_LABEL;
        }
      } else if (row.ledger.referenceType === "PURCHASE") {
        const purchase = purchaseById.get(row.ledger.referenceId);
        referenceNumber = purchase?.purchaseNumber ?? null;
        remarks = purchase?.remarks ?? null;
        destinationStore = currentStore;
      } else if (
        row.ledger.referenceType === "ITEM_ISSUE" ||
        row.ledger.referenceType === "DEPARTMENT_CONSUMPTION"
      ) {
        const issue = issueById.get(row.ledger.referenceId);
        referenceNumber = issue?.issue.issueNumber ?? null;
        remarks = issue?.issue.remarks ?? issue?.issue.consumptionDescription ?? null;
        departmentName = issue?.departmentName ?? null;
        issueId = issue?.issue.id ?? row.ledger.referenceId;
        sourceStore = issue
          ? {
              id: issue.fromStore.id,
              storeCode: issue.fromStore.storeCode,
              storeName: issue.fromStore.storeName,
            }
          : currentStore;
        if (issue?.issue.toStoreId) {
          destinationStore = destinationById.get(issue.issue.toStoreId) ?? null;
        }
        if (issue?.verifiedUser?.id) {
          verifiedBy = extraUserById.get(issue.verifiedUser.id) ?? null;
        }
      } else if (row.ledger.referenceType === "ITEM_ISSUE_IN_TRANSIT") {
        const shipment = shipmentById.get(row.ledger.referenceId);
        referenceNumber = shipment?.issueNumber ?? null;
        issueId = shipment?.issueId ?? null;
        shipmentId = shipment?.shipment.id ?? row.ledger.referenceId;
        sourceStore = shipment?.fromStore ?? null;
        destinationStore = currentStore;
      } else if (
        row.ledger.referenceType === "ITEM_ISSUE_RECEIPT" ||
        row.ledger.referenceType === "ITEM_ISSUE_DISCREPANCY"
      ) {
        const receipt = receiptById.get(row.ledger.referenceId);
        referenceNumber = receipt?.issueNumber ?? null;
        remarks = receipt?.receipt.remarks ?? null;
        issueId = receipt?.issueId ?? null;
        shipmentId = receipt?.shipment.id ?? null;
        sourceStore = receipt?.fromStore ?? null;
        destinationStore = currentStore;
        if (receipt?.verifiedUser?.id) {
          verifiedBy = extraUserById.get(receipt.verifiedUser.id) ?? null;
        }
      }

      return {
        id: row.ledger.id,
        transactionDate: row.ledger.transactionDate.toISOString(),
        createdAt: row.ledger.createdAt.toISOString(),
        movementType,
        stockCategory: row.ledger.stockCategory,
        quantityIn,
        quantityOut,
        categoryRunningBalance: formatScaled(next),
        referenceType: row.ledger.referenceType as StockLedgerMovementType,
        referenceId: row.ledger.referenceId,
        referenceLineId: row.ledger.referenceLineId,
        referenceNumber,
        sourceStore,
        sourceStoreLabel,
        destinationStore,
        departmentName,
        remarks,
        performedBy: toPersonSummary(row.postedByUser, row.postedByEmployee),
        verifiedBy,
        sourceHref: sourceHref(movementType, {
          referenceId: row.ledger.referenceId,
          issueId,
          shipmentId,
        }),
        sourceKind: movementType,
      };
    });

    const totalItems = entries.length;
    const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / query.pageSize);
    const offset = (query.page - 1) * query.pageSize;

    return {
      context,
      items: entries.slice(offset, offset + query.pageSize),
      page: query.page,
      pageSize: query.pageSize,
      totalItems,
      totalPages,
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    if (isDatabaseUnavailableError(error)) {
      throw databaseUnavailableError(error);
    }
    throw error;
  }
}
