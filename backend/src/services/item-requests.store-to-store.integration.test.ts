import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { and, count, eq, inArray, like, or } from "drizzle-orm";
import {
  ITEM_REQUEST_CORPORATE_MAKER_CREATE_MESSAGE,
  ITEM_REQUEST_MISSING_MAKER_OR_CHECKER_MESSAGE,
  itemRequestListQuerySchema,
  type AuthenticatedUser,
} from "@printing-stationery/shared";
import { loadEnv } from "../config/env.js";
import { closePool, createDb, getDb } from "../db/client.js";
import {
  applicationUsers,
  authSessions,
  userRoles,
} from "../db/schema/auth.js";
import { branches } from "../db/schema/branches.js";
import { employees } from "../db/schema/employees.js";
import {
  itemIssueActions,
  itemIssueLines,
  itemIssues,
} from "../db/schema/item-issues.js";
import {
  departmentConsumptionLines,
  departmentConsumptions,
  itemIssueDiscrepancies,
  itemIssueReceiptActions,
  itemIssueReceiptLines,
  itemIssueReceipts,
  itemIssueShipmentLines,
  itemIssueShipments,
} from "../db/schema/item-issue-delivery.js";
import { itemRequestActions, itemRequestLines, itemRequests } from "../db/schema/item-requests.js";
import { notifications } from "../db/schema/notifications.js";
import { items } from "../db/schema/items.js";
import { stockLedger } from "../db/schema/opening-stocks.js";
import { stockLedgerSourceKey } from "./stock-ledger.js";
import { stores } from "../db/schema/stores.js";
import { storeUsers } from "../db/schema/store-users.js";
import {
  createItemRequest,
  deleteItemRequest,
  getItemRequestById,
  getItemRequestContext,
  listEligibleItemRequestSourceStores,
  listItemRequests,
  performItemRequestAction,
} from "./item-requests.service.js";
import {
  createItemIssueFromRequest,
  getItemIssueEligibility,
  submitItemIssue,
  verifyAndPostItemIssue,
} from "./item-issues.service.js";
import { listEmployees } from "./employees.service.js";
import { getOperationalAvailableQuantities } from "./opening-stocks.service.js";
import { AppError } from "../utils/errors.js";
import { hashPassword } from "../utils/password.js";
import { listNotifications } from "./notifications.service.js";

const PREFIX = "S2S-";

function isAppError(
  error: unknown,
  statusCode: number,
  message?: string | RegExp,
): error is AppError {
  return (
    error instanceof AppError &&
    error.statusCode === statusCode &&
    (message === undefined ||
      (typeof message === "string"
        ? error.message === message
        : message.test(error.message)))
  );
}

describe("store-to-store item requests", { concurrency: false }, () => {
  let admin: AuthenticatedUser;
  let destinationMaker: AuthenticatedUser;
  let sourceMaker: AuthenticatedUser;
  let sourceChecker: AuthenticatedUser;
  let unassignedMaker: AuthenticatedUser;
  let sourceStoreId = "";
  let destinationStoreId = "";
  let corporateStoreId = "";
  let corporateStoreName = "";
  let birtamodStoreId = "";
  let birtamodMaker: AuthenticatedUser;
  let birtamodChecker: AuthenticatedUser;
  let corporateMaker: AuthenticatedUser | null = null;
  let corporateChecker: AuthenticatedUser | null = null;
  let originalCorporateAssignment: {
    id: string;
    makerApplicationUserId: string | null;
    supervisorApplicationUserId: string | null;
    isActive: boolean;
  } | null = null;
  let inactiveStoreId = "";
  let noTransferStoreId = "";
  let beyondFifthStoreId = "";
  let itemId = "";
  let itemUnitId = "";
  let otherEmployeeId = "";
  let inactiveEmployeeId = "";
  let defaultRequestedById = "";
  let createdRequestIds: string[] = [];
  let createdBranchIds: string[] = [];
  let createdStoreIds: string[] = [];
  let createdUserIds: string[] = [];
  let createdEmployeeIds: string[] = [];
  let createdLedgerIds: string[] = [];

  async function loadActor(userId: string): Promise<AuthenticatedUser> {
    const rows = await getDb()
      .select({
        user: applicationUsers,
        employee: employees,
        branch: branches,
      })
      .from(applicationUsers)
      .leftJoin(employees, eq(applicationUsers.employeeId, employees.id))
      .leftJoin(branches, eq(employees.branchId, branches.id))
      .where(eq(applicationUsers.id, userId))
      .limit(1);
    const row = rows[0];
    if (!row) {
      throw new Error(`User ${userId} was not found`);
    }
    const roleRows = await getDb()
      .select({ role: userRoles.role })
      .from(userRoles)
      .where(eq(userRoles.userId, userId));
    return {
      id: row.user.id,
      username: row.user.username,
      mustChangePassword: row.user.mustChangePassword,
      roles: roleRows.map((item) => item.role),
      employee:
        row.employee && row.branch
          ? {
              id: row.employee.id,
              employeeCode: row.employee.employeeCode,
              employeeName: row.employee.employeeName,
              branch: {
                id: row.branch.id,
                branchCode: row.branch.branchCode,
                branchName: row.branch.branchName,
              },
            }
          : null,
    };
  }

  async function trackRequest<T extends { id: string }>(created: T): Promise<T> {
    createdRequestIds.push(created.id);
    return created;
  }

  async function seedStoreStock(
    storeId: string,
    quantity: string,
  ): Promise<void> {
    const inserted = await getDb()
      .insert(stockLedger)
      .values({
        storeId,
        itemId,
        unitId: itemUnitId,
        rate: "1",
        movementType: "PURCHASE",
        stockCategory: "AVAILABLE",
        quantityIn: quantity,
        quantityOut: "0",
        amountIn: quantity,
        amountOut: "0",
        transactionDate: new Date(),
        referenceType: "PURCHASE",
        referenceId: randomUUID(),
        referenceLineId: randomUUID(),
        sourceKey: stockLedgerSourceKey({
          referenceType: "PURCHASE",
          referenceLineId: randomUUID(),
          storeId,
          movementType: "PURCHASE",
          stockCategory: "AVAILABLE",
          rate: "1",
        }),
        postedByApplicationUserId: admin.id,
        postedAt: new Date(),
      })
      .returning({ id: stockLedger.id });
    createdLedgerIds.push(inserted[0]!.id);
  }

  async function cleanup(): Promise<void> {
    const db = getDb();
    const leftoverStores = await db
      .select({ id: stores.id })
      .from(stores)
      .where(like(stores.storeCode, `${PREFIX}%`));
    const storeIds = [
      ...new Set([...createdStoreIds, ...leftoverStores.map((row) => row.id)]),
    ];

    const leftoverByNumber = await db
      .select({ id: itemRequests.id })
      .from(itemRequests)
      .where(like(itemRequests.requestNumber, `${PREFIX}%`));
    const leftoverByStore =
      storeIds.length > 0
        ? await db
            .select({ id: itemRequests.id })
            .from(itemRequests)
            .where(
              or(
                inArray(itemRequests.requestingStoreId, storeIds),
                inArray(itemRequests.corporateStoreId, storeIds),
              ),
            )
        : [];
    const requestIds = [
      ...new Set([
        ...createdRequestIds,
        ...leftoverByNumber.map((row) => row.id),
        ...leftoverByStore.map((row) => row.id),
      ]),
    ];
    const issueRows =
      requestIds.length > 0
        ? await db
            .select({ id: itemIssues.id })
            .from(itemIssues)
            .where(inArray(itemIssues.requestId, requestIds))
        : [];
    const issueIds = issueRows.map((row) => row.id);

    const leftoverUsers = await db
      .select({ id: applicationUsers.id })
      .from(applicationUsers)
      .where(like(applicationUsers.username, `${PREFIX}%`.toLowerCase()));
    const userIds = [
      ...new Set([...createdUserIds, ...leftoverUsers.map((row) => row.id)]),
    ];

    if (createdLedgerIds.length > 0) {
      await db
        .delete(stockLedger)
        .where(inArray(stockLedger.id, createdLedgerIds));
    }
    if (issueIds.length > 0) {
      await db
        .delete(stockLedger)
        .where(inArray(stockLedger.referenceId, issueIds));
    }
    if (storeIds.length > 0) {
      await db.delete(stockLedger).where(inArray(stockLedger.storeId, storeIds));
    }
    if (userIds.length > 0) {
      await db
        .delete(stockLedger)
        .where(inArray(stockLedger.postedByApplicationUserId, userIds));
    }

    if (issueIds.length > 0) {
      const shipmentRows = await db
        .select({ id: itemIssueShipments.id })
        .from(itemIssueShipments)
        .where(inArray(itemIssueShipments.itemIssueId, issueIds));
      const shipmentIds = shipmentRows.map((row) => row.id);
      const receiptRows =
        shipmentIds.length > 0
          ? await db
              .select({ id: itemIssueReceipts.id })
              .from(itemIssueReceipts)
              .where(inArray(itemIssueReceipts.shipmentId, shipmentIds))
          : [];
      const receiptIds = receiptRows.map((row) => row.id);
      const consumptionRows = await db
        .select({ id: departmentConsumptions.id })
        .from(departmentConsumptions)
        .where(inArray(departmentConsumptions.itemIssueId, issueIds));
      const consumptionIds = consumptionRows.map((row) => row.id);
      if (receiptIds.length > 0) {
        await db
          .delete(itemIssueDiscrepancies)
          .where(inArray(itemIssueDiscrepancies.receiptId, receiptIds));
        await db
          .delete(itemIssueReceiptActions)
          .where(inArray(itemIssueReceiptActions.receiptId, receiptIds));
        await db
          .delete(itemIssueReceiptLines)
          .where(inArray(itemIssueReceiptLines.receiptId, receiptIds));
      }
      await db
        .delete(itemIssueDiscrepancies)
        .where(inArray(itemIssueDiscrepancies.itemIssueId, issueIds));
      await db
        .delete(stockLedger)
        .where(
          inArray(stockLedger.referenceId, [
            ...issueIds,
            ...shipmentIds,
            ...receiptIds,
          ]),
        );
      if (receiptIds.length > 0) {
        await db.delete(itemIssueReceipts).where(inArray(itemIssueReceipts.id, receiptIds));
      }
      if (shipmentIds.length > 0) {
        await db
          .delete(itemIssueShipmentLines)
          .where(inArray(itemIssueShipmentLines.shipmentId, shipmentIds));
        await db.delete(itemIssueShipments).where(inArray(itemIssueShipments.id, shipmentIds));
      }
      if (consumptionIds.length > 0) {
        await db
          .delete(departmentConsumptionLines)
          .where(
            inArray(departmentConsumptionLines.departmentConsumptionId, consumptionIds),
          );
        await db
          .delete(departmentConsumptions)
          .where(inArray(departmentConsumptions.id, consumptionIds));
      }
      await db
        .delete(notifications)
        .where(
          and(
            eq(notifications.relatedEntityType, "ITEM_ISSUE"),
            inArray(notifications.relatedEntityId, issueIds),
          ),
        );
      await db
        .delete(itemIssueActions)
        .where(inArray(itemIssueActions.itemIssueId, issueIds));
      await db
        .delete(stockLedger)
        .where(inArray(stockLedger.referenceId, issueIds));
      await db
        .delete(itemIssueLines)
        .where(inArray(itemIssueLines.itemIssueId, issueIds));
      await db.delete(itemIssues).where(inArray(itemIssues.id, issueIds));
    }
    if (requestIds.length > 0) {
      await db
        .delete(notifications)
        .where(
          and(
            eq(notifications.relatedEntityType, "ITEM_REQUEST"),
            inArray(notifications.relatedEntityId, requestIds),
          ),
        );
      await db
        .delete(itemRequestActions)
        .where(inArray(itemRequestActions.itemRequestId, requestIds));
      await db
        .delete(itemRequestLines)
        .where(inArray(itemRequestLines.itemRequestId, requestIds));
      await db.delete(itemRequests).where(inArray(itemRequests.id, requestIds));
    }

    if (originalCorporateAssignment) {
      await db
        .update(storeUsers)
        .set({
          makerApplicationUserId:
            originalCorporateAssignment.makerApplicationUserId,
          supervisorApplicationUserId:
            originalCorporateAssignment.supervisorApplicationUserId,
          isActive: originalCorporateAssignment.isActive,
          updatedAt: new Date(),
        })
        .where(eq(storeUsers.id, originalCorporateAssignment.id));
    }

    if (userIds.length > 0) {
      await db
        .delete(storeUsers)
        .where(
          or(
            inArray(storeUsers.makerApplicationUserId, userIds),
            inArray(storeUsers.supervisorApplicationUserId, userIds),
          ),
        );
    }
    if (storeIds.length > 0) {
      await db.delete(storeUsers).where(inArray(storeUsers.storeId, storeIds));
      await db.delete(stores).where(inArray(stores.id, storeIds));
    }

    for (const userId of userIds) {
      await db
        .delete(notifications)
        .where(
          or(
            eq(notifications.recipientUserId, userId),
            eq(notifications.actorUserId, userId),
          ),
        );
      await db.delete(authSessions).where(eq(authSessions.userId, userId));
      await db.delete(userRoles).where(eq(userRoles.userId, userId));
      await db.delete(applicationUsers).where(eq(applicationUsers.id, userId));
    }

    const leftoverEmployees = await db
      .select({ id: employees.id })
      .from(employees)
      .where(like(employees.employeeCode, `${PREFIX}%`));
    const employeeIds = [
      ...new Set([
        ...createdEmployeeIds,
        ...leftoverEmployees.map((row) => row.id),
      ]),
    ];
    if (employeeIds.length > 0) {
      await db.delete(employees).where(inArray(employees.id, employeeIds));
    }

    const leftoverBranches = await db
      .select({ id: branches.id })
      .from(branches)
      .where(like(branches.branchCode, `${PREFIX}%`));
    const branchIds = [
      ...new Set([
        ...createdBranchIds,
        ...leftoverBranches.map((row) => row.id),
      ]),
    ];
    if (branchIds.length > 0) {
      await db.delete(branches).where(inArray(branches.id, branchIds));
    }

    createdRequestIds = [];
    createdStoreIds = [];
    createdUserIds = [];
    createdEmployeeIds = [];
    createdBranchIds = [];
    createdLedgerIds = [];
    originalCorporateAssignment = null;
  }

  before(async () => {
    createDb(loadEnv());
    await cleanup();

    const adminRows = await getDb()
      .select({ id: applicationUsers.id })
      .from(applicationUsers)
      .innerJoin(userRoles, eq(userRoles.userId, applicationUsers.id))
      .where(eq(userRoles.role, "ADMIN"))
      .limit(1);
    if (!adminRows[0]) {
      throw new Error("An ADMIN application user is required");
    }
    admin = await loadActor(adminRows[0].id);

    const itemRows = await getDb()
      .select({ id: items.id, unitId: items.unitId })
      .from(items)
      .where(eq(items.isRequestable, true))
      .limit(1);
    if (!itemRows[0]) {
      throw new Error("No requestable item exists");
    }
    itemId = itemRows[0].id;
    itemUnitId = itemRows[0].unitId;

    const passwordHash = await hashPassword("StoreToStore!1a");

    async function createAssignedStore(params: {
      suffix: string;
      storeName: string;
      allowTransfer: boolean;
      isActive?: boolean;
    }): Promise<{
      storeId: string;
      maker: AuthenticatedUser;
      checker: AuthenticatedUser;
    }> {
      const branch = await getDb()
        .insert(branches)
        .values({
          branchCode: `${PREFIX}${params.suffix}B`,
          branchName: `${params.storeName} Branch`,
          branchType: "BRANCH",
          isActive: true,
        })
        .returning({ id: branches.id });
      createdBranchIds.push(branch[0]!.id);

      const store = await getDb()
        .insert(stores)
        .values({
          storeCode: `${PREFIX}${params.suffix}S`,
          storeName: params.storeName,
          branchId: branch[0]!.id,
          allowTransfer: params.allowTransfer,
          isActive: params.isActive ?? true,
        })
        .returning({ id: stores.id });
      createdStoreIds.push(store[0]!.id);

      const makerEmployee = await getDb()
        .insert(employees)
        .values({
          employeeCode: `${PREFIX}${params.suffix}M`,
          employeeName: `${params.storeName} Maker`,
          branchId: branch[0]!.id,
          isActive: true,
        })
        .returning({ id: employees.id });
      createdEmployeeIds.push(makerEmployee[0]!.id);
      const checkerEmployee = await getDb()
        .insert(employees)
        .values({
          employeeCode: `${PREFIX}${params.suffix}C`,
          employeeName: `${params.storeName} Checker`,
          branchId: branch[0]!.id,
          isActive: true,
        })
        .returning({ id: employees.id });
      createdEmployeeIds.push(checkerEmployee[0]!.id);

      const makerUser = await getDb()
        .insert(applicationUsers)
        .values({
          employeeId: makerEmployee[0]!.id,
          username: `${PREFIX}${params.suffix}maker`.toLowerCase(),
          passwordHash,
          mustChangePassword: false,
          isActive: true,
        })
        .returning({ id: applicationUsers.id });
      createdUserIds.push(makerUser[0]!.id);
      const checkerUser = await getDb()
        .insert(applicationUsers)
        .values({
          employeeId: checkerEmployee[0]!.id,
          username: `${PREFIX}${params.suffix}checker`.toLowerCase(),
          passwordHash,
          mustChangePassword: false,
          isActive: true,
        })
        .returning({ id: applicationUsers.id });
      createdUserIds.push(checkerUser[0]!.id);

      await getDb().insert(userRoles).values([
        { userId: makerUser[0]!.id, role: "MAKER" },
        { userId: checkerUser[0]!.id, role: "CHECKER" },
      ]);
      await getDb().insert(storeUsers).values({
        storeId: store[0]!.id,
        makerApplicationUserId: makerUser[0]!.id,
        supervisorApplicationUserId: checkerUser[0]!.id,
        isActive: true,
      });

      return {
        storeId: store[0]!.id,
        maker: await loadActor(makerUser[0]!.id),
        checker: await loadActor(checkerUser[0]!.id),
      };
    }

    const source = await createAssignedStore({
      suffix: "FR",
      storeName: "S2S Supplying Store",
      allowTransfer: true,
    });
    sourceStoreId = source.storeId;
    sourceMaker = source.maker;
    sourceChecker = source.checker;

    const destination = await createAssignedStore({
      suffix: "TO",
      storeName: "S2S Receiving Store",
      allowTransfer: false,
    });
    destinationStoreId = destination.storeId;
    destinationMaker = destination.maker;

    const inactiveBranch = await getDb()
      .insert(branches)
      .values({
        branchCode: `${PREFIX}IB`,
        branchName: "S2S Inactive Branch",
        branchType: "BRANCH",
        isActive: true,
      })
      .returning({ id: branches.id });
    createdBranchIds.push(inactiveBranch[0]!.id);
    const inactiveStore = await getDb()
      .insert(stores)
      .values({
        storeCode: `${PREFIX}IS`,
        storeName: "S2S Inactive Store",
        branchId: inactiveBranch[0]!.id,
        allowTransfer: true,
        isActive: false,
      })
      .returning({ id: stores.id });
    inactiveStoreId = inactiveStore[0]!.id;
    createdStoreIds.push(inactiveStoreId);

    const noTransferBranch = await getDb()
      .insert(branches)
      .values({
        branchCode: `${PREFIX}NB`,
        branchName: "S2S No Transfer Branch",
        branchType: "BRANCH",
        isActive: true,
      })
      .returning({ id: branches.id });
    createdBranchIds.push(noTransferBranch[0]!.id);
    const noTransferStore = await getDb()
      .insert(stores)
      .values({
        storeCode: `${PREFIX}NT`,
        storeName: "S2S No Transfer Store",
        branchId: noTransferBranch[0]!.id,
        allowTransfer: false,
        isActive: true,
      })
      .returning({ id: stores.id });
    noTransferStoreId = noTransferStore[0]!.id;
    createdStoreIds.push(noTransferStoreId);

    async function createSimpleStore(params: {
      suffix: string;
      storeName: string;
      allowTransfer: boolean;
      isActive?: boolean;
    }): Promise<string> {
      const branch = await getDb()
        .insert(branches)
        .values({
          branchCode: `${PREFIX}${params.suffix}B`,
          branchName: `${params.storeName} Branch`,
          branchType: "BRANCH",
          isActive: true,
        })
        .returning({ id: branches.id });
      createdBranchIds.push(branch[0]!.id);
      const store = await getDb()
        .insert(stores)
        .values({
          storeCode: `${PREFIX}${params.suffix}S`,
          storeName: params.storeName,
          branchId: branch[0]!.id,
          allowTransfer: params.allowTransfer,
          isActive: params.isActive ?? true,
        })
        .returning({ id: stores.id });
      createdStoreIds.push(store[0]!.id);
      return store[0]!.id;
    }

    for (const index of [1, 2, 3, 4, 5]) {
      await createSimpleStore({
        suffix: `P${index}`,
        storeName: `S2S PG Alpha ${index}`,
        allowTransfer: true,
      });
    }
    beyondFifthStoreId = await createSimpleStore({
      suffix: "PZ",
      storeName: "S2S PG Zulu Needle",
      allowTransfer: true,
    });
    await createSimpleStore({
      suffix: "PI",
      storeName: "S2S PG Inactive Needle",
      allowTransfer: true,
      isActive: false,
    });
    await createSimpleStore({
      suffix: "PN",
      storeName: "S2S PG NoTransfer Needle",
      allowTransfer: false,
    });

    const extraEmployee = await getDb()
      .insert(employees)
      .values({
        employeeCode: `${PREFIX}M2`,
        employeeName: "S2S Extra Maker",
        branchId: noTransferBranch[0]!.id,
        isActive: true,
      })
      .returning({ id: employees.id });
    createdEmployeeIds.push(extraEmployee[0]!.id);
    const extraUser = await getDb()
      .insert(applicationUsers)
      .values({
        employeeId: extraEmployee[0]!.id,
        username: `${PREFIX}maker2`.toLowerCase(),
        passwordHash,
        mustChangePassword: false,
        isActive: true,
      })
      .returning({ id: applicationUsers.id });
    createdUserIds.push(extraUser[0]!.id);
    await getDb().insert(userRoles).values({
      userId: extraUser[0]!.id,
      role: "MAKER",
    });
    unassignedMaker = await loadActor(extraUser[0]!.id);

    const otherEmployee = await getDb()
      .insert(employees)
      .values({
        employeeCode: `${PREFIX}368`,
        employeeName: "Anjani Chaudhary",
        branchId: destinationMaker.employee!.branch.id,
        isActive: true,
      })
      .returning({ id: employees.id });
    otherEmployeeId = otherEmployee[0]!.id;
    createdEmployeeIds.push(otherEmployeeId);

    const inactiveEmployee = await getDb()
      .insert(employees)
      .values({
        employeeCode: `${PREFIX}INA`,
        employeeName: "S2S Inactive Employee",
        branchId: destinationMaker.employee!.branch.id,
        isActive: false,
      })
      .returning({ id: employees.id });
    inactiveEmployeeId = inactiveEmployee[0]!.id;
    createdEmployeeIds.push(inactiveEmployeeId);

    defaultRequestedById = destinationMaker.employee!.id;

    const corporateRows = await getDb()
      .select({ store: stores, branch: branches })
      .from(stores)
      .innerJoin(branches, eq(stores.branchId, branches.id))
      .where(
        and(
          eq(stores.isActive, true),
          eq(branches.isActive, true),
        ),
      );
    const corporateRow =
      corporateRows.find((row) => row.store.storeCode.trim() === "999") ??
      corporateRows.find(
        (row) =>
          row.branch.branchType === "HEAD_OFFICE" &&
          row.store.underStoreId === null,
      );
    if (!corporateRow) {
      throw new Error("Corporate Store is required for item request tests");
    }
    corporateStoreId = corporateRow.store.id;
    corporateStoreName = corporateRow.store.storeName;
    const existingCorporateAssignment = await getDb()
      .select()
      .from(storeUsers)
      .where(eq(storeUsers.storeId, corporateStoreId))
      .limit(1);
    if (
      existingCorporateAssignment[0]?.isActive &&
      existingCorporateAssignment[0].makerApplicationUserId &&
      existingCorporateAssignment[0].supervisorApplicationUserId
    ) {
      corporateMaker = await loadActor(
        existingCorporateAssignment[0].makerApplicationUserId,
      );
      corporateChecker = await loadActor(
        existingCorporateAssignment[0].supervisorApplicationUserId,
      );
    } else {
      const makerEmployee = await getDb()
        .insert(employees)
        .values({
          employeeCode: `${PREFIX}COM`,
          employeeName: "Corporate Store Maker",
          branchId: corporateRow.branch.id,
          isActive: true,
        })
        .returning({ id: employees.id });
      createdEmployeeIds.push(makerEmployee[0]!.id);
      const checkerEmployee = await getDb()
        .insert(employees)
        .values({
          employeeCode: `${PREFIX}COC`,
          employeeName: "Corporate Store Checker",
          branchId: corporateRow.branch.id,
          isActive: true,
        })
        .returning({ id: employees.id });
      createdEmployeeIds.push(checkerEmployee[0]!.id);
      const makerUser = await getDb()
        .insert(applicationUsers)
        .values({
          employeeId: makerEmployee[0]!.id,
          username: `${PREFIX}comaker`.toLowerCase(),
          passwordHash,
          mustChangePassword: false,
          isActive: true,
        })
        .returning({ id: applicationUsers.id });
      createdUserIds.push(makerUser[0]!.id);
      const checkerUser = await getDb()
        .insert(applicationUsers)
        .values({
          employeeId: checkerEmployee[0]!.id,
          username: `${PREFIX}cochecker`.toLowerCase(),
          passwordHash,
          mustChangePassword: false,
          isActive: true,
        })
        .returning({ id: applicationUsers.id });
      createdUserIds.push(checkerUser[0]!.id);
      await getDb().insert(userRoles).values([
        { userId: makerUser[0]!.id, role: "MAKER" },
        { userId: checkerUser[0]!.id, role: "CHECKER" },
      ]);
      if (existingCorporateAssignment[0]) {
        originalCorporateAssignment = {
          id: existingCorporateAssignment[0].id,
          makerApplicationUserId:
            existingCorporateAssignment[0].makerApplicationUserId,
          supervisorApplicationUserId:
            existingCorporateAssignment[0].supervisorApplicationUserId,
          isActive: existingCorporateAssignment[0].isActive,
        };
        await getDb()
          .update(storeUsers)
          .set({
            makerApplicationUserId: makerUser[0]!.id,
            supervisorApplicationUserId: checkerUser[0]!.id,
            isActive: true,
            updatedAt: new Date(),
          })
          .where(eq(storeUsers.id, existingCorporateAssignment[0].id));
      } else {
        await getDb().insert(storeUsers).values({
          storeId: corporateStoreId,
          makerApplicationUserId: makerUser[0]!.id,
          supervisorApplicationUserId: checkerUser[0]!.id,
          isActive: true,
        });
      }
      corporateMaker = await loadActor(makerUser[0]!.id);
      corporateChecker = await loadActor(checkerUser[0]!.id);
    }

    const birtamod = await createAssignedStore({
      suffix: "BM",
      storeName: "Birtamod Store",
      allowTransfer: false,
    });
    birtamodStoreId = birtamod.storeId;
    birtamodMaker = birtamod.maker;
    birtamodChecker = birtamod.checker;
  });

  after(async () => {
    try {
      await cleanup();
    } finally {
      await closePool();
    }
  });

  it("lets an admin request from one store to another", async () => {
    const context = await getItemRequestContext(admin);
    assert.equal(context.canCreate, true);
    assert.deepEqual(context.workflowRoles, ["ADMIN"]);
    assert.equal(context.canViewFulfilment, true);
    assert.equal(context.canSelectRequestFromStore, true);
    assert.equal(context.canSelectDestinationStore, true);
    assert.equal(context.canSelectRequestedByEmployee, true);
    assert.equal(context.requestFromStore, null);
    assert.equal(context.destinationStore, null);
    assert.equal(context.requestToStore?.id, corporateStoreId);
    if (admin.employee) {
      assert.equal(context.requestedByEmployee?.id, admin.employee.id);
      assert.equal(context.requestedByEmployee?.department, null);
    }

    const created = await trackRequest(
      await createItemRequest(admin, {
        sourceStoreId: destinationStoreId,
        destinationStoreId: sourceStoreId,
        requestedByEmployeeId: defaultRequestedById,
        remarks: null,
        lines: [{ itemId, requestedQuantity: "3" }],
      }),
    );

    assert.equal(created.sourceStoreId, destinationStoreId);
    assert.equal(created.destinationStoreId, sourceStoreId);
    assert.equal(created.requestingStoreId, destinationStoreId);
    assert.equal(created.corporateStoreId, sourceStoreId);
    assert.equal(created.sourceStore?.id, destinationStoreId);
    assert.equal(created.destinationStore?.id, sourceStoreId);
    assert.equal(created.status, "DRAFT");
    assert.equal(created.requestedBy?.id, defaultRequestedById);
    assert.equal(created.createdBy.id, admin.id);
    assert.equal(created.requestedBy?.department, null);
  });

  it("lets an admin create a request for another active employee", async () => {
    const created = await trackRequest(
      await createItemRequest(admin, {
        sourceStoreId: destinationStoreId,
        destinationStoreId: sourceStoreId,
        requestedByEmployeeId: otherEmployeeId,
        remarks: null,
        lines: [{ itemId, requestedQuantity: "1" }],
      }),
    );

    assert.equal(created.requestedBy?.id, otherEmployeeId);
    assert.equal(created.requestedBy?.employeeName, "Anjani Chaudhary");
    assert.equal(created.requestedBy?.employeeCode, `${PREFIX}368`);
    assert.equal(created.createdBy.id, admin.id);
    if (admin.employee) {
      assert.notEqual(created.requestedByEmployeeId, admin.employee.id);
    }
    assert.equal(created.requestedBy?.department, null);
  });

  it("lets an admin search a requesting store beyond the first five results and submit it", async () => {
    const firstPage = await listEligibleItemRequestSourceStores(admin, {
      page: 1,
      pageSize: 5,
      search: "S2S PG",
    });
    assert.equal(firstPage.pageSize, 5);
    assert.ok(firstPage.totalItems >= 6);
    assert.equal(firstPage.items.length, 5);
    assert.ok(
      !firstPage.items.some((store) => store.id === beyondFifthStoreId),
    );
    assert.ok(
      !firstPage.items.some((store) => /inactive/i.test(store.storeName)),
    );

    const searched = await listEligibleItemRequestSourceStores(admin, {
      page: 1,
      pageSize: 5,
      search: "Zulu Needle",
    });
    assert.ok(searched.items.some((store) => store.id === beyondFifthStoreId));
    const found = searched.items.find(
      (store) => store.id === beyondFifthStoreId,
    );
    assert.ok(found);
    assert.equal(
      `${found.storeCode} — ${found.storeName} (${found.branch.branchName})`,
      `${PREFIX}PZS — S2S PG Zulu Needle (S2S PG Zulu Needle Branch)`,
    );
    assert.notEqual(found.branch.id, admin.employee?.branch.id);

    const hidden = await listEligibleItemRequestSourceStores(admin, {
      page: 1,
      pageSize: 20,
      search: "Needle",
    });
    assert.ok(
      !hidden.items.some((store) => store.storeName.includes("Inactive Needle")),
    );

    const zuluEmployee = await getDb()
      .insert(employees)
      .values({
        employeeCode: `${PREFIX}ZULU`,
        employeeName: "Zulu Requestor",
        branchId: found.branch.id,
        isActive: true,
      })
      .returning({ id: employees.id });
    createdEmployeeIds.push(zuluEmployee[0]!.id);

    const created = await trackRequest(
      await createItemRequest(admin, {
        sourceStoreId: beyondFifthStoreId,
        destinationStoreId: sourceStoreId,
        requestedByEmployeeId: zuluEmployee[0]!.id,
        remarks: null,
        lines: [{ itemId, requestedQuantity: "1" }],
      }),
    );
    assert.equal(created.sourceStoreId, beyondFifthStoreId);
    assert.equal(created.sourceStore?.id, beyondFifthStoreId);
    assert.equal(created.status, "DRAFT");
  });

  it("lets an admin search employees by name and employee number", async () => {
    const byName = await listEmployees({
      page: 1,
      pageSize: 20,
      status: "ACTIVE",
      search: "Anjani",
    });
    assert.ok(byName.items.some((employee) => employee.id === otherEmployeeId));
    assert.ok(
      !byName.items.some((employee) => employee.id === inactiveEmployeeId),
    );

    const byCode = await listEmployees({
      page: 1,
      pageSize: 20,
      status: "ACTIVE",
      search: `${PREFIX}368`,
    });
    assert.ok(byCode.items.some((employee) => employee.id === otherEmployeeId));
  });

  it("rejects inactive employees in Requested By", async () => {
    await assert.rejects(
      () =>
        createItemRequest(admin, {
          sourceStoreId: destinationStoreId,
          destinationStoreId: sourceStoreId,
          requestedByEmployeeId: inactiveEmployeeId,
          remarks: null,
          lines: [{ itemId, requestedQuantity: "1" }],
        }),
      (error: unknown) =>
        isAppError(error, 400, "The selected employee is inactive."),
    );
  });

  it("rejects a normal user submitting another employee id", async () => {
    await assert.rejects(
      () =>
        createItemRequest(destinationMaker, {
          sourceStoreId: destinationStoreId,
          destinationStoreId: corporateStoreId,
          requestedByEmployeeId: otherEmployeeId,
          remarks: null,
          lines: [{ itemId, requestedQuantity: "1" }],
        }),
      (error: unknown) =>
        isAppError(
          error,
          403,
          "You can create a request only for your own employee record.",
        ),
    );
  });

  it("lets a normal maker request only for their assigned Request From Store", async () => {
    const context = await getItemRequestContext(destinationMaker);
    assert.equal(context.canCreate, true);
    assert.deepEqual(context.workflowRoles, ["BRANCH_MAKER"]);
    assert.equal(context.canViewFulfilment, false);
    assert.equal(context.canSelectRequestFromStore, false);
    assert.equal(context.canSelectRequestToStore, false);
    assert.equal(context.canSelectDestinationStore, false);
    assert.equal(context.requestFromStore?.id, destinationStoreId);
    assert.equal(context.destinationStore?.id, destinationStoreId);
    assert.equal(context.requestToStore?.id, corporateStoreId);
    assert.equal(context.requestedByEmployee?.id, destinationMaker.employee!.id);

    const created = await trackRequest(
      await createItemRequest(destinationMaker, {
        sourceStoreId: destinationStoreId,
        destinationStoreId: corporateStoreId,
        requestedByEmployeeId: destinationMaker.employee!.id,
        remarks: null,
        lines: [{ itemId, requestedQuantity: "2" }],
      }),
    );
    assert.equal(created.sourceStoreId, destinationStoreId);
    assert.equal(created.destinationStoreId, corporateStoreId);
    assert.equal(created.requestingStoreId, destinationStoreId);
    assert.equal(created.corporateStoreId, corporateStoreId);
    assert.equal(created.requestingStoreId, destinationStoreId);
    assert.equal(created.corporateStoreId, corporateStoreId);
    assert.equal(created.requestedBy?.id, destinationMaker.employee!.id);
    assert.equal(created.createdBy.id, destinationMaker.id);
  });

  it("rejects unauthorized Request From Store selection from a normal user", async () => {
    await assert.rejects(
      () =>
        createItemRequest(destinationMaker, {
          sourceStoreId: sourceStoreId,
          destinationStoreId: corporateStoreId,
          requestedByEmployeeId: destinationMaker.employee!.id,
          remarks: null,
          lines: [{ itemId, requestedQuantity: "1" }],
        }),
      (error: unknown) =>
        isAppError(
          error,
          403,
          ITEM_REQUEST_MISSING_MAKER_OR_CHECKER_MESSAGE,
        ),
    );
  });

  it("rejects a maker without an active store assignment", async () => {
    const context = await getItemRequestContext(unassignedMaker);
    assert.equal(context.canCreate, false);
    await assert.rejects(
      () =>
        createItemRequest(unassignedMaker, {
          sourceStoreId: destinationStoreId,
          destinationStoreId: corporateStoreId,
          requestedByEmployeeId: unassignedMaker.employee!.id,
          remarks: null,
          lines: [{ itemId, requestedQuantity: "1" }],
        }),
      (error: unknown) =>
        isAppError(
          error,
          403,
          ITEM_REQUEST_MISSING_MAKER_OR_CHECKER_MESSAGE,
        ),
    );
  });

  it("hides requests until the requesting store maker has an assigned checker", async () => {
    const assignmentRows = await getDb()
      .select()
      .from(storeUsers)
      .where(eq(storeUsers.storeId, destinationStoreId))
      .limit(1);
    const assignment = assignmentRows[0];
    assert.ok(assignment);
    const originalSupervisorId = assignment.supervisorApplicationUserId;
    assert.ok(originalSupervisorId);

    await getDb()
      .update(storeUsers)
      .set({
        supervisorApplicationUserId: null,
        updatedAt: new Date(),
      })
      .where(eq(storeUsers.id, assignment.id));

    try {
      const makerContext = await getItemRequestContext(destinationMaker);
      assert.equal(makerContext.canCreate, false);
      assert.equal(
        makerContext.workflowRoles.includes("BRANCH_MAKER"),
        false,
      );
      await assert.rejects(
        () =>
          createItemRequest(destinationMaker, {
            sourceStoreId: destinationStoreId,
            destinationStoreId: corporateStoreId,
            requestedByEmployeeId: destinationMaker.employee!.id,
            remarks: null,
            lines: [{ itemId, requestedQuantity: "1" }],
          }),
        (error: unknown) =>
          isAppError(
            error,
            403,
            ITEM_REQUEST_MISSING_MAKER_OR_CHECKER_MESSAGE,
          ),
      );

      const created = await trackRequest(
        await createItemRequest(admin, {
          sourceStoreId: destinationStoreId,
          destinationStoreId: sourceStoreId,
          requestedByEmployeeId: defaultRequestedById,
          remarks: null,
          lines: [{ itemId, requestedQuantity: "1" }],
        }),
      );

      const hidden = await listItemRequests(admin, {
        page: 1,
        pageSize: 50,
        status: "ALL",
      });
      assert.equal(
        hidden.items.some((item) => item.id === created.id),
        false,
      );

      await getDb()
        .update(storeUsers)
        .set({
          supervisorApplicationUserId: originalSupervisorId,
          updatedAt: new Date(),
        })
        .where(eq(storeUsers.id, assignment.id));

      const visible = await listItemRequests(admin, {
        page: 1,
        pageSize: 50,
        status: "ALL",
      });
      assert.equal(
        visible.items.some((item) => item.id === created.id),
        true,
      );

      const restoredContext = await getItemRequestContext(destinationMaker);
      assert.equal(restoredContext.canCreate, true);
      assert.ok(restoredContext.workflowRoles.includes("BRANCH_MAKER"));
    } finally {
      await getDb()
        .update(storeUsers)
        .set({
          supervisorApplicationUserId: originalSupervisorId,
          updatedAt: new Date(),
        })
        .where(eq(storeUsers.id, assignment.id));
    }
  });

  it("rejects same-store requests", async () => {
    await assert.rejects(
      () =>
        createItemRequest(admin, {
          sourceStoreId: destinationStoreId,
          destinationStoreId: destinationStoreId,
          requestedByEmployeeId: defaultRequestedById,
          remarks: null,
          lines: [{ itemId, requestedQuantity: "1" }],
        }),
      (error: unknown) =>
        isAppError(
          error,
          400,
          "Request From Store and Request To Store must be different.",
        ),
    );
  });

  it("rejects inactive stores", async () => {
    await assert.rejects(
      () =>
        createItemRequest(admin, {
          sourceStoreId: inactiveStoreId,
          destinationStoreId: sourceStoreId,
          requestedByEmployeeId: defaultRequestedById,
          remarks: null,
          lines: [{ itemId, requestedQuantity: "1" }],
        }),
      (error: unknown) =>
        isAppError(error, 400, /inactive/i),
    );
  });

  it("rejects a Request To Store that is not allowed to transfer", async () => {
    await assert.rejects(
      () =>
        createItemRequest(admin, {
          sourceStoreId: destinationStoreId,
          destinationStoreId: noTransferStoreId,
          requestedByEmployeeId: defaultRequestedById,
          remarks: null,
          lines: [{ itemId, requestedQuantity: "1" }],
        }),
      (error: unknown) =>
        isAppError(
          error,
          400,
          "The Request To Store is not allowed to transfer or issue stock.",
        ),
    );
  });

  it("does not change stock when a request is created", async () => {
    const before = await getOperationalAvailableQuantities({
      storeId: sourceStoreId,
      itemIds: [itemId],
    });
    await trackRequest(
      await createItemRequest(admin, {
        sourceStoreId: destinationStoreId,
        destinationStoreId: sourceStoreId,
        requestedByEmployeeId: defaultRequestedById,
        remarks: null,
        lines: [{ itemId, requestedQuantity: "8" }],
      }),
    );
    const after = await getOperationalAvailableQuantities({
      storeId: sourceStoreId,
      itemIds: [itemId],
    });
    assert.deepEqual(after, before);
  });

  it("creates an issue from the supplying store and blocks over-issue and re-issue", async () => {
    await seedStoreStock(sourceStoreId, "20");
    const requested = await trackRequest(
      await createItemRequest(admin, {
        sourceStoreId: destinationStoreId,
        destinationStoreId: sourceStoreId,
        requestedByEmployeeId: defaultRequestedById,
        remarks: null,
        lines: [{ itemId, requestedQuantity: "10" }],
      }),
    );
    await getDb()
      .update(itemRequests)
      .set({
        status: "APPROVED",
        approvedAt: new Date(),
        corporateMakerApplicationUserId: sourceMaker.id,
        corporateCheckerApplicationUserId: sourceChecker.id,
        branchCheckerApplicationUserId: destinationMaker.id,
      })
      .where(eq(itemRequests.id, requested.id));

    const detail = await getItemRequestById(requested.id, admin);
    const requestLineId = detail.lines[0]?.id;
    assert.ok(requestLineId);

    await assert.rejects(
      () =>
        createItemIssueFromRequest(requested.id, sourceChecker, {
          remarks: null,
          lines: [{ requestLineId, issueQuantity: "4" }],
        }),
      (error: unknown) => isAppError(error, 403),
    );

    const firstIssue = await createItemIssueFromRequest(
      requested.id,
      sourceMaker,
      {
        remarks: null,
        lines: [{ requestLineId, issueQuantity: "4" }],
      },
    );
    assert.equal(firstIssue.fromStore.id, sourceStoreId);
    assert.equal(firstIssue.toStore?.id, destinationStoreId);

    const submitted = await submitItemIssue(firstIssue.id, sourceMaker, {
      expectedVersion: firstIssue.version,
    });
    await verifyAndPostItemIssue(firstIssue.id, sourceChecker, {
      expectedVersion: submitted.version,
      remarks: null,
    });

    const afterPartial = await getItemRequestById(requested.id, admin);
    assert.equal(afterPartial.status, "PARTIALLY_ISSUED");
    assert.equal(afterPartial.lines[0]?.issuedQuantity, "4");
    assert.equal(afterPartial.lines[0]?.remainingQuantity, "6");

    await assert.rejects(
      () =>
        createItemIssueFromRequest(requested.id, sourceMaker, {
          remarks: null,
          lines: [{ requestLineId, issueQuantity: "7" }],
        }),
      (error: unknown) =>
        isAppError(error, 409, /exceeds request remainder/i),
    );

    const secondIssue = await createItemIssueFromRequest(
      requested.id,
      sourceMaker,
      {
        remarks: null,
        lines: [{ requestLineId, issueQuantity: "6" }],
      },
    );
    const secondSubmitted = await submitItemIssue(secondIssue.id, sourceMaker, {
      expectedVersion: secondIssue.version,
    });
    await verifyAndPostItemIssue(secondIssue.id, sourceChecker, {
      expectedVersion: secondSubmitted.version,
      remarks: null,
    });

    const eligibility = await getItemIssueEligibility(requested.id, sourceMaker);
    assert.equal(eligibility.canCreate, false);

    await assert.rejects(
      () =>
        createItemIssueFromRequest(requested.id, sourceMaker, {
          remarks: null,
          lines: [{ requestLineId, issueQuantity: "1" }],
        }),
      (error: unknown) => isAppError(error, 409),
    );
  });

  it("lets an admin delete a request that has no item issues", async () => {
    const created = await trackRequest(
      await createItemRequest(admin, {
        sourceStoreId: destinationStoreId,
        destinationStoreId: sourceStoreId,
        requestedByEmployeeId: defaultRequestedById,
        remarks: null,
        lines: [{ itemId, requestedQuantity: "1" }],
      }),
    );
    assert.equal(created.canDelete, true);

    await deleteItemRequest(created.id, admin, created.version);

    await assert.rejects(
      () => getItemRequestById(created.id, admin),
      (error: unknown) => isAppError(error, 404, "Item request not found"),
    );
  });

  it("does not let a maker delete an item request", async () => {
    const created = await trackRequest(
      await createItemRequest(destinationMaker, {
        sourceStoreId: destinationStoreId,
        destinationStoreId: corporateStoreId,
        requestedByEmployeeId: destinationMaker.employee!.id,
        remarks: null,
        lines: [{ itemId, requestedQuantity: "1" }],
      }),
    );
    assert.equal(created.canDelete, false);

    await assert.rejects(
      () => deleteItemRequest(created.id, destinationMaker, created.version),
      (error: unknown) =>
        isAppError(error, 403, "You cannot delete an item request"),
    );

    const stillThere = await getItemRequestById(created.id, admin);
    assert.equal(stillThere.id, created.id);
    assert.equal(stillThere.canDelete, true);
  });

  it("rejects deleting a request that has item issues", async () => {
    const requested = await trackRequest(
      await createItemRequest(admin, {
        sourceStoreId: destinationStoreId,
        destinationStoreId: sourceStoreId,
        requestedByEmployeeId: defaultRequestedById,
        remarks: null,
        lines: [{ itemId, requestedQuantity: "2" }],
      }),
    );
    await getDb()
      .update(itemRequests)
      .set({
        status: "APPROVED",
        approvedAt: new Date(),
        corporateMakerApplicationUserId: sourceMaker.id,
        corporateCheckerApplicationUserId: sourceChecker.id,
        branchCheckerApplicationUserId: destinationMaker.id,
      })
      .where(eq(itemRequests.id, requested.id));

    const detail = await getItemRequestById(requested.id, admin);
    const requestLineId = detail.lines[0]?.id;
    assert.ok(requestLineId);

    await createItemIssueFromRequest(requested.id, sourceMaker, {
      remarks: null,
      lines: [{ requestLineId, issueQuantity: "1" }],
    });

    await assert.rejects(
      () => deleteItemRequest(requested.id, admin, detail.version),
      (error: unknown) =>
        isAppError(
          error,
          409,
          "This item request cannot be deleted because it has item issue records.",
        ),
    );

    const stillThere = await getItemRequestById(requested.id, admin);
    assert.equal(stillThere.id, requested.id);
  });

  it("lets Birtamod Store request from Corporate Store with the corrected store meaning", async () => {
    await seedStoreStock(corporateStoreId, "15");
    await seedStoreStock(birtamodStoreId, "99");

    const created = await trackRequest(
      await createItemRequest(birtamodMaker, {
        sourceStoreId: birtamodStoreId,
        destinationStoreId: corporateStoreId,
        requestedByEmployeeId: birtamodMaker.employee!.id,
        remarks: null,
        lines: [{ itemId, requestedQuantity: "5" }],
      }),
    );

    assert.equal(created.sourceStoreId, birtamodStoreId);
    assert.equal(created.requestingStoreId, birtamodStoreId);
    assert.equal(created.sourceStore?.storeName, "Birtamod Store");
    assert.equal(created.destinationStoreId, corporateStoreId);
    assert.equal(created.corporateStoreId, corporateStoreId);
    assert.equal(created.destinationStore?.id, corporateStoreId);
    assert.equal(created.destinationStore?.storeName, corporateStoreName);

    const corporateStock = await getOperationalAvailableQuantities({
      storeId: corporateStoreId,
      itemIds: [itemId],
    });
    const birtamodStock = await getOperationalAvailableQuantities({
      storeId: birtamodStoreId,
      itemIds: [itemId],
    });
    assert.equal(
      created.lines[0]?.availableStockQuantity,
      corporateStock[0]?.availableQuantity ?? "0",
    );
    assert.notEqual(
      created.lines[0]?.availableStockQuantity,
      birtamodStock[0]?.availableQuantity ?? "0",
    );

    const submitted = await performItemRequestAction(created.id, birtamodMaker, {
      action: "SUBMIT",
      remarks: null,
      expectedVersion: created.version,
    });
    assert.equal(submitted.status, "PENDING_BRANCH_CHECKER");
    assert.equal(submitted.branchChecker?.id, birtamodChecker.id);
    const submittedNotifications = await listNotifications(birtamodChecker.id, {
      page: 1,
      pageSize: 20,
    });
    const submittedNote = submittedNotifications.items.find(
      (item) => item.relatedEntityId === created.id,
    );
    assert.equal(submittedNote?.type, "ITEM_REQUEST_SUBMITTED");
    assert.equal(submittedNote?.isRead, false);
    assert.equal(submittedNote?.requestNumber, submitted.requestNumber);
    assert.equal(
      submittedNote?.message.includes(submitted.requestNumber),
      true,
    );

    const recommended = await performItemRequestAction(
      submitted.id,
      birtamodChecker,
      {
        action: "RECOMMEND",
        remarks: "Branch recommended",
        expectedVersion: submitted.version,
      },
    );
    assert.equal(recommended.status, "PENDING_CORPORATE_MAKER");
    assert.ok(recommended.corporateMaker);
    assert.ok(recommended.corporateChecker);
    assert.notEqual(recommended.corporateMaker.id, birtamodMaker.id);
    assert.notEqual(recommended.corporateChecker.id, birtamodChecker.id);
  });

  it("names the requesting store when a Maker assignment is missing", async () => {
    await getDb()
      .update(storeUsers)
      .set({ isActive: false })
      .where(eq(storeUsers.storeId, birtamodStoreId));

    try {
      const created = await trackRequest(
        await createItemRequest(admin, {
          sourceStoreId: birtamodStoreId,
          destinationStoreId: corporateStoreId,
          requestedByEmployeeId: birtamodMaker.employee!.id,
          remarks: null,
          lines: [{ itemId, requestedQuantity: "1" }],
        }),
      );

      await assert.rejects(
        () =>
          performItemRequestAction(created.id, admin, {
            action: "SUBMIT",
            remarks: null,
            expectedVersion: created.version,
          }),
        (error: unknown) =>
          isAppError(
            error,
            400,
            "Birtamod Store does not have an active Maker assignment.",
          ),
      );
    } finally {
      await getDb()
        .update(storeUsers)
        .set({ isActive: true })
        .where(eq(storeUsers.storeId, birtamodStoreId));
    }
  });

  it("does not reverse historically stored requesting and corporate store ids", async () => {
    const inserted = await getDb()
      .insert(itemRequests)
      .values({
        requestNumber: `${PREFIX}HIST-${Date.now().toString(36)}`,
        requestingStoreId: birtamodStoreId,
        corporateStoreId: corporateStoreId,
        requestedByEmployeeId: birtamodMaker.employee!.id,
        createdByApplicationUserId: admin.id,
        status: "DRAFT",
        remarks: "historical-row",
        version: 1,
      })
      .returning({ id: itemRequests.id });
    createdRequestIds.push(inserted[0]!.id);

    const loaded = await getItemRequestById(inserted[0]!.id, admin);
    assert.equal(loaded.requestingStoreId, birtamodStoreId);
    assert.equal(loaded.corporateStoreId, corporateStoreId);
    assert.equal(loaded.sourceStoreId, birtamodStoreId);
    assert.equal(loaded.destinationStoreId, corporateStoreId);
    assert.equal(loaded.sourceStore?.storeName, "Birtamod Store");
    assert.equal(loaded.destinationStore?.id, corporateStoreId);
  });

  it("posting an issue deducts Corporate stock, not Birtamod stock", async () => {
    assert.ok(corporateMaker, "Corporate Store maker assignment is required");
    assert.ok(corporateChecker, "Corporate Store checker assignment is required");

    await seedStoreStock(corporateStoreId, "20");
    await seedStoreStock(birtamodStoreId, "8");

    const created = await trackRequest(
      await createItemRequest(birtamodMaker, {
        sourceStoreId: birtamodStoreId,
        destinationStoreId: corporateStoreId,
        requestedByEmployeeId: birtamodMaker.employee!.id,
        remarks: null,
        lines: [{ itemId, requestedQuantity: "3" }],
      }),
    );

    const approvedAtCreate = await getOperationalAvailableQuantities({
      storeId: corporateStoreId,
      itemIds: [itemId],
    });
    const birtamodBefore = await getOperationalAvailableQuantities({
      storeId: birtamodStoreId,
      itemIds: [itemId],
    });

    await getDb()
      .update(itemRequests)
      .set({
        status: "APPROVED",
        approvedAt: new Date(),
        branchCheckerApplicationUserId: birtamodChecker.id,
        corporateMakerApplicationUserId: corporateMaker.id,
        corporateCheckerApplicationUserId: corporateChecker.id,
      })
      .where(eq(itemRequests.id, created.id));

    const afterApproveCorporate = await getOperationalAvailableQuantities({
      storeId: corporateStoreId,
      itemIds: [itemId],
    });
    assert.deepEqual(afterApproveCorporate, approvedAtCreate);

    const detail = await getItemRequestById(created.id, admin);
    const requestLineId = detail.lines[0]?.id;
    assert.ok(requestLineId);
    assert.equal(
      detail.lines[0]?.availableStockQuantity,
      afterApproveCorporate[0]?.availableQuantity ?? "0",
    );

    await assert.rejects(
      () =>
        createItemIssueFromRequest(created.id, birtamodMaker, {
          remarks: null,
          lines: [{ requestLineId, issueQuantity: "3" }],
        }),
      (error: unknown) => isAppError(error, 403),
    );
    await assert.rejects(
      () =>
        createItemIssueFromRequest(created.id, corporateChecker, {
          remarks: null,
          lines: [{ requestLineId, issueQuantity: "3" }],
        }),
      (error: unknown) => isAppError(error, 403),
    );

    const issue = await createItemIssueFromRequest(created.id, corporateMaker, {
      remarks: null,
      lines: [{ requestLineId, issueQuantity: "3" }],
    });
    assert.equal(issue.fromStore.id, corporateStoreId);
    assert.equal(issue.toStore?.id, birtamodStoreId);
    assert.notEqual(issue.fromStore.id, birtamodStoreId);

    const submitted = await submitItemIssue(issue.id, corporateMaker, {
      expectedVersion: issue.version,
    });
    const afterSubmitCorporate = await getOperationalAvailableQuantities({
      storeId: corporateStoreId,
      itemIds: [itemId],
    });
    assert.deepEqual(afterSubmitCorporate, afterApproveCorporate);

    await verifyAndPostItemIssue(issue.id, corporateChecker, {
      expectedVersion: submitted.version,
      remarks: null,
    });

    const afterIssueCorporate = await getOperationalAvailableQuantities({
      storeId: corporateStoreId,
      itemIds: [itemId],
    });
    const afterIssueBirtamod = await getOperationalAvailableQuantities({
      storeId: birtamodStoreId,
      itemIds: [itemId],
    });

    const beforeQty = Number(approvedAtCreate[0]?.availableQuantity ?? "0");
    const afterQty = Number(afterIssueCorporate[0]?.availableQuantity ?? "0");
    assert.equal(afterQty, beforeQty - 3);
    assert.deepEqual(afterIssueBirtamod, birtamodBefore);
  });

  async function forwardRequestToCorporateChecker() {
    assert.ok(corporateMaker, "Corporate Store maker assignment is required");
    assert.ok(corporateChecker, "Corporate Store checker assignment is required");

    const created = await trackRequest(
      await createItemRequest(birtamodMaker, {
        sourceStoreId: birtamodStoreId,
        destinationStoreId: corporateStoreId,
        requestedByEmployeeId: birtamodMaker.employee!.id,
        remarks: null,
        lines: [{ itemId, requestedQuantity: "2" }],
      }),
    );
    const submitted = await performItemRequestAction(created.id, birtamodMaker, {
      action: "SUBMIT",
      remarks: null,
      expectedVersion: created.version,
    });
    const recommended = await performItemRequestAction(
      submitted.id,
      birtamodChecker,
      {
        action: "RECOMMEND",
        remarks: "Branch recommended",
        expectedVersion: submitted.version,
      },
    );
    return performItemRequestAction(recommended.id, corporateMaker, {
      action: "FORWARD",
      remarks: null,
      expectedVersion: recommended.version,
    });
  }

  it("does not let the Corporate Maker create branch requests", async () => {
    assert.ok(corporateMaker);

    const context = await getItemRequestContext(corporateMaker);
    assert.ok(context.workflowRoles.includes("CORPORATE_MAKER"));
    assert.equal(context.canCreate, false);

    const emptyReview = await listItemRequests(corporateMaker, {
      page: 1,
      pageSize: 20,
      status: "ALL",
      queue: "review",
    });
    assert.equal(Array.isArray(emptyReview.items), true);

    await assert.rejects(
      () =>
        createItemRequest(corporateMaker, {
          sourceStoreId: corporateStoreId,
          destinationStoreId: corporateStoreId,
          requestedByEmployeeId: corporateMaker.employee!.id,
          remarks: null,
          lines: [{ itemId, requestedQuantity: "1" }],
        }),
      (error: unknown) =>
        isAppError(
          error,
          403,
          ITEM_REQUEST_CORPORATE_MAKER_CREATE_MESSAGE,
        ),
    );

    await assert.rejects(
      () =>
        createItemRequest(corporateMaker, {
          sourceStoreId: birtamodStoreId,
          destinationStoreId: corporateStoreId,
          requestedByEmployeeId: corporateMaker.employee!.id,
          remarks: null,
          lines: [{ itemId, requestedQuantity: "1" }],
        }),
      (error: unknown) =>
        isAppError(
          error,
          403,
          ITEM_REQUEST_CORPORATE_MAKER_CREATE_MESSAGE,
        ),
    );

    await assert.rejects(
      () =>
        listEligibleItemRequestSourceStores(corporateMaker, {
          page: 1,
          pageSize: 20,
        }),
      (error: unknown) =>
        isAppError(
          error,
          403,
          ITEM_REQUEST_CORPORATE_MAKER_CREATE_MESSAGE,
        ),
    );
  });

  it("exposes Corporate Checker queues and pending-approval filtering", async () => {
    assert.ok(corporateMaker);
    assert.ok(corporateChecker);

    const checkerContext = await getItemRequestContext(corporateChecker);
    assert.ok(checkerContext.workflowRoles.includes("CORPORATE_CHECKER"));
    assert.equal(checkerContext.canCreate, false);

    const makerContext = await getItemRequestContext(birtamodMaker);
    assert.deepEqual(makerContext.workflowRoles, ["BRANCH_MAKER"]);

    const branchCheckerContext = await getItemRequestContext(birtamodChecker);
    assert.deepEqual(branchCheckerContext.workflowRoles, ["BRANCH_CHECKER"]);

    const corporateMakerContext = await getItemRequestContext(corporateMaker);
    assert.ok(corporateMakerContext.workflowRoles.includes("CORPORATE_MAKER"));
    assert.equal(corporateMakerContext.canCreate, false);

    const created = await trackRequest(
      await createItemRequest(birtamodMaker, {
        sourceStoreId: birtamodStoreId,
        destinationStoreId: corporateStoreId,
        requestedByEmployeeId: birtamodMaker.employee!.id,
        remarks: null,
        lines: [{ itemId, requestedQuantity: "2" }],
      }),
    );
    const submitted = await performItemRequestAction(created.id, birtamodMaker, {
      action: "SUBMIT",
      remarks: null,
      expectedVersion: created.version,
    });
    const recommended = await performItemRequestAction(
      submitted.id,
      birtamodChecker,
      {
        action: "RECOMMEND",
        remarks: "Branch recommended",
        expectedVersion: submitted.version,
      },
    );

    const pendingBeforeForward = await listItemRequests(corporateChecker, {
      page: 1,
      pageSize: 20,
      status: "ALL",
      queue: "approve",
    });
    assert.equal(
      pendingBeforeForward.items.some((item) => item.id === recommended.id),
      false,
      "requests that are still with the Corporate Maker must not appear in Pending Approval",
    );

    const forwarded = await performItemRequestAction(
      recommended.id,
      corporateMaker,
      {
        action: "FORWARD",
        remarks: null,
        expectedVersion: recommended.version,
      },
    );
    assert.equal(forwarded.status, "PENDING_CORPORATE_CHECKER");
    assert.equal(forwarded.pendingWith?.id, corporateChecker.id);
    assert.ok(forwarded.forwardedAt);
    const pendingForChecker = await getItemRequestById(
      forwarded.id,
      corporateChecker,
    );
    assert.deepEqual([...pendingForChecker.allowedActions].sort(), [
      "APPROVE",
      "REJECT",
      "RETURN",
    ]);

    const pendingApproval = await listItemRequests(corporateChecker, {
      page: 1,
      pageSize: 20,
      status: "ALL",
      queue: "approve",
    });
    assert.ok(
      pendingApproval.items.some((item) => item.id === forwarded.id),
      "properly forwarded requests must appear in Pending Approval",
    );

    const recommendQueue = await listItemRequests(corporateChecker, {
      page: 1,
      pageSize: 20,
      status: "ALL",
      queue: "recommend",
    });
    assert.equal(
      recommendQueue.items.some((item) => item.id === forwarded.id),
      false,
    );

    const reviewQueue = await listItemRequests(corporateChecker, {
      page: 1,
      pageSize: 20,
      status: "ALL",
      queue: "review",
    });
    assert.equal(
      reviewQueue.items.some((item) => item.id === forwarded.id),
      false,
    );

    await getDb()
      .update(itemRequests)
      .set({ forwardedAt: null })
      .where(eq(itemRequests.id, forwarded.id));

    const pendingWithoutForward = await listItemRequests(corporateChecker, {
      page: 1,
      pageSize: 20,
      status: "ALL",
      queue: "approve",
    });
    assert.equal(
      pendingWithoutForward.items.some((item) => item.id === forwarded.id),
      false,
      "requests missing Corporate Maker forward must not appear in Pending Approval",
    );

    await getDb()
      .update(itemRequests)
      .set({ forwardedAt: new Date(forwarded.forwardedAt!) })
      .where(eq(itemRequests.id, forwarded.id));
  });

  it("lets the assigned Corporate Checker approve, return, and reject with history", async () => {
    const forwarded = await forwardRequestToCorporateChecker();
    assert.ok(corporateChecker);
    assert.ok(corporateMaker);

    await assert.rejects(
      () =>
        performItemRequestAction(forwarded.id, corporateChecker, {
          action: "RETURN",
          remarks: null,
          expectedVersion: forwarded.version,
        }),
      (error: unknown) =>
        isAppError(error, 400, "Remarks are required for this action"),
    );

    const returned = await performItemRequestAction(
      forwarded.id,
      corporateChecker,
      {
        action: "RETURN",
        remarks: "Please correct quantities",
        expectedVersion: forwarded.version,
      },
    );
    assert.equal(returned.status, "RETURNED_TO_CORPORATE_MAKER");
    assert.equal(returned.pendingWith?.id, corporateMaker.id);
    assert.equal(returned.allowedActions.length, 0);
    const pendingForMaker = await getItemRequestById(returned.id, corporateMaker);
    assert.deepEqual([...pendingForMaker.allowedActions].sort(), [
      "FORWARD",
      "RETURN",
    ]);
    const returnEntry = returned.actions.at(-1);
    assert.equal(returnEntry?.action, "RETURN");
    assert.equal(returnEntry?.fromStatus, "PENDING_CORPORATE_CHECKER");
    assert.equal(returnEntry?.toStatus, "RETURNED_TO_CORPORATE_MAKER");
    assert.equal(returnEntry?.actorWorkflowRole, "CORPORATE_CHECKER");
    assert.equal(returnEntry?.remarks, "Please correct quantities");
    assert.equal(returnEntry?.actor.id, corporateChecker.id);

    const returnedQueue = await listItemRequests(corporateChecker, {
      page: 1,
      pageSize: 20,
      status: "ALL",
      queue: "returned",
    });
    assert.ok(returnedQueue.items.some((item) => item.id === returned.id));

    const forwardedAgain = await performItemRequestAction(
      returned.id,
      corporateMaker,
      {
        action: "FORWARD",
        remarks: "Corrected",
        expectedVersion: returned.version,
      },
    );
    assert.equal(forwardedAgain.status, "PENDING_CORPORATE_CHECKER");
    assert.equal(forwardedAgain.actions.length, returned.actions.length + 1);

    const approved = await performItemRequestAction(
      forwardedAgain.id,
      corporateChecker,
      {
        action: "APPROVE",
        remarks: null,
        expectedVersion: forwardedAgain.version,
      },
    );
    assert.equal(approved.status, "APPROVED");
    assert.ok(approved.approvedAt);
    assert.equal(approved.allowedActions.length, 0);
    const approveEntry = approved.actions.at(-1);
    assert.equal(approveEntry?.action, "APPROVE");
    assert.equal(approveEntry?.actorWorkflowRole, "CORPORATE_CHECKER");
    assert.equal(approveEntry?.fromStatus, "PENDING_CORPORATE_CHECKER");
    assert.equal(approveEntry?.toStatus, "APPROVED");

    const approvedQueue = await listItemRequests(corporateChecker, {
      page: 1,
      pageSize: 20,
      status: "ALL",
      queue: "approved",
    });
    assert.ok(approvedQueue.items.some((item) => item.id === approved.id));

    await assert.rejects(
      () =>
        performItemRequestAction(approved.id, corporateChecker, {
          action: "APPROVE",
          remarks: null,
          expectedVersion: approved.version,
        }),
      (error: unknown) =>
        isAppError(error, 409, "This action is not allowed for the current request status."),
    );

    const toReject = await forwardRequestToCorporateChecker();
    await assert.rejects(
      () =>
        performItemRequestAction(toReject.id, corporateChecker, {
          action: "REJECT",
          remarks: null,
          expectedVersion: toReject.version,
        }),
      (error: unknown) =>
        isAppError(error, 400, "Remarks are required for this action"),
    );

    const rejected = await performItemRequestAction(
      toReject.id,
      corporateChecker,
      {
        action: "REJECT",
        remarks: "Not required",
        expectedVersion: toReject.version,
      },
    );
    assert.equal(rejected.status, "REJECTED");
    assert.ok(rejected.rejectedAt);
    assert.equal(rejected.allowedActions.length, 0);
    assert.equal(rejected.canCreateIssue, false);

    const rejectedQueue = await listItemRequests(corporateChecker, {
      page: 1,
      pageSize: 20,
      status: "ALL",
      queue: "rejected",
    });
    assert.ok(rejectedQueue.items.some((item) => item.id === rejected.id));

    await assert.rejects(
      () =>
        performItemRequestAction(rejected.id, corporateChecker, {
          action: "APPROVE",
          remarks: null,
          expectedVersion: rejected.version,
        }),
      (error: unknown) =>
        isAppError(error, 409, "This action is not allowed for the current request status."),
    );
  });

  it("rejects unauthorized Corporate Checker actions and keeps other role queues", async () => {
    const forwarded = await forwardRequestToCorporateChecker();
    assert.ok(corporateChecker);
    assert.ok(corporateMaker);

    await assert.rejects(
      () =>
        performItemRequestAction(forwarded.id, birtamodChecker, {
          action: "APPROVE",
          remarks: null,
          expectedVersion: forwarded.version,
        }),
      (error: unknown) =>
        isAppError(error, 403, "This request is not pending with you."),
    );

    await assert.rejects(
      () =>
        performItemRequestAction(forwarded.id, birtamodMaker, {
          action: "APPROVE",
          remarks: null,
          expectedVersion: forwarded.version,
        }),
      (error: unknown) =>
        isAppError(error, 403, "This request is not pending with you."),
    );

    await assert.rejects(
      () =>
        performItemRequestAction(forwarded.id, corporateMaker, {
          action: "APPROVE",
          remarks: null,
          expectedVersion: forwarded.version,
        }),
      (error: unknown) =>
        isAppError(error, 403, "This request is not pending with you."),
    );

    await assert.rejects(
      () =>
        performItemRequestAction(forwarded.id, corporateChecker, {
          action: "RECOMMEND",
          remarks: null,
          expectedVersion: forwarded.version,
        }),
      (error: unknown) =>
        isAppError(
          error,
          409,
          "This action is not allowed for the current request status.",
        ),
    );

    const makerDrafts = await listItemRequests(birtamodMaker, {
      page: 1,
      pageSize: 20,
      status: "ALL",
      queue: "drafts",
    });
    assert.ok(
      makerDrafts.items.every((item) => item.status === "DRAFT"),
    );

    const checkerRecommend = await listItemRequests(birtamodChecker, {
      page: 1,
      pageSize: 20,
      status: "ALL",
      queue: "recommend",
    });
    assert.ok(
      checkerRecommend.items.every(
        (item) => item.status === "PENDING_BRANCH_CHECKER",
      ),
    );

    const corporateReview = await listItemRequests(corporateMaker, {
      page: 1,
      pageSize: 20,
      status: "ALL",
      queue: "review",
    });
    assert.ok(
      corporateReview.items.every(
        (item) => item.status === "PENDING_CORPORATE_MAKER",
      ),
    );
  });

  it("tracks submitted requests on Request List and keeps checker review store-scoped", async () => {
    assert.ok(corporateMaker);
    assert.ok(corporateChecker);

    const ledgerBefore = await getDb()
      .select({ value: count() })
      .from(stockLedger);

    const created = await trackRequest(
      await createItemRequest(birtamodMaker, {
        sourceStoreId: birtamodStoreId,
        destinationStoreId: corporateStoreId,
        requestedByEmployeeId: birtamodMaker.employee!.id,
        remarks: null,
        lines: [{ itemId, requestedQuantity: "1" }],
      }),
    );
    assert.equal(created.status, "DRAFT");
    assert.ok(created.allowedActions.includes("SUBMIT"));

    const draftList = await listItemRequests(birtamodMaker, {
      page: 1,
      pageSize: 50,
      status: "ALL",
      queue: "request-list",
      search: created.requestNumber,
    });
    assert.ok(draftList.items.some((item) => item.id === created.id));

    const adminCreated = await trackRequest(
      await createItemRequest(admin, {
        sourceStoreId: birtamodStoreId,
        destinationStoreId: corporateStoreId,
        requestedByEmployeeId: birtamodMaker.employee!.id,
        remarks: null,
        lines: [{ itemId, requestedQuantity: "1" }],
      }),
    );
    const storeList = await listItemRequests(birtamodMaker, {
      page: 1,
      pageSize: 50,
      status: "ALL",
      queue: "request-list",
      search: adminCreated.requestNumber,
    });
    assert.ok(
      storeList.items.some((item) => item.id === adminCreated.id),
      "the maker sees requests for their assigned store",
    );
    const otherStoreList = await listItemRequests(sourceMaker, {
      page: 1,
      pageSize: 50,
      status: "ALL",
      queue: "request-list",
      search: adminCreated.requestNumber,
    });
    assert.equal(
      otherStoreList.items.some((item) => item.id === adminCreated.id),
      false,
    );

    const submitted = await performItemRequestAction(created.id, birtamodMaker, {
      action: "SUBMIT",
      remarks: null,
      expectedVersion: created.version,
    });
    assert.equal(submitted.status, "PENDING_BRANCH_CHECKER");
    assert.equal(submitted.allowedActions.length, 0);
    const submitEntry = submitted.actions.at(-1);
    assert.equal(submitEntry?.action, "SUBMIT");
    assert.equal(submitEntry?.fromStatus, "DRAFT");
    assert.equal(submitEntry?.toStatus, "PENDING_BRANCH_CHECKER");

    const submittedNotifications = await listNotifications(birtamodChecker.id, {
      page: 1,
      pageSize: 20,
    });
    const submittedNote = submittedNotifications.items.find(
      (item) => item.relatedEntityId === created.id,
    );
    assert.equal(submittedNote?.type, "ITEM_REQUEST_SUBMITTED");
    assert.equal(submittedNote?.relatedEntityId, created.id);

    const makerList = await listItemRequests(
      birtamodMaker,
      itemRequestListQuerySchema.parse({
        page: 1,
        pageSize: 50,
        status: "SUBMITTED",
        queue: "request-list",
        search: created.requestNumber,
      }),
    );
    assert.ok(makerList.items.some((item) => item.id === created.id));
    assert.ok(
      makerList.items.every((item) => item.status === "PENDING_BRANCH_CHECKER"),
    );

    const draftsOnly = await listItemRequests(birtamodMaker, {
      page: 1,
      pageSize: 50,
      status: "DRAFT",
      queue: "request-list",
      search: created.requestNumber,
    });
    assert.equal(
      draftsOnly.items.some((item) => item.id === created.id),
      false,
    );

    const reviewQueue = await listItemRequests(birtamodChecker, {
      page: 1,
      pageSize: 50,
      status: "ALL",
      queue: "recommend",
      search: created.requestNumber,
    });
    assert.ok(reviewQueue.items.some((item) => item.id === created.id));
    const checkerView = await getItemRequestById(created.id, birtamodChecker);
    assert.deepEqual([...checkerView.allowedActions].sort(), [
      "RECOMMEND",
      "RETURN",
    ]);

    const otherCheckerQueue = await listItemRequests(sourceChecker, {
      page: 1,
      pageSize: 50,
      status: "ALL",
      queue: "recommend",
      search: created.requestNumber,
    });
    assert.equal(
      otherCheckerQueue.items.some((item) => item.id === created.id),
      false,
    );
    await assert.rejects(
      () => getItemRequestById(created.id, sourceChecker),
      (error: unknown) => isAppError(error, 404, "Item request not found"),
    );
    await assert.rejects(
      () =>
        performItemRequestAction(created.id, sourceChecker, {
          action: "RECOMMEND",
          remarks: null,
          expectedVersion: submitted.version,
        }),
      (error: unknown) =>
        isAppError(error, 403, "This request is not pending with you."),
    );
    await assert.rejects(
      () =>
        performItemRequestAction(created.id, sourceChecker, {
          action: "RETURN",
          remarks: "Not my store",
          expectedVersion: submitted.version,
        }),
      (error: unknown) =>
        isAppError(error, 403, "This request is not pending with you."),
    );
    await assert.rejects(
      () =>
        performItemRequestAction(created.id, birtamodChecker, {
          action: "REJECT",
          remarks: "Branch checkers do not reject",
          expectedVersion: submitted.version,
        }),
      (error: unknown) =>
        isAppError(
          error,
          409,
          "This action is not allowed for the current request status.",
        ),
    );

    const returned = await performItemRequestAction(
      created.id,
      birtamodChecker,
      {
        action: "RETURN",
        remarks: "Please revise the quantity",
        expectedVersion: submitted.version,
      },
    );
    assert.equal(returned.status, "RETURNED_TO_BRANCH_MAKER");
    assert.ok(returned.actions.some((entry) => entry.action === "RETURN"));
    const reviewAfterReturn = await listItemRequests(birtamodChecker, {
      page: 1,
      pageSize: 50,
      status: "ALL",
      queue: "recommend",
      search: created.requestNumber,
    });
    assert.equal(
      reviewAfterReturn.items.some((item) => item.id === created.id),
      false,
    );

    const resubmitted = await performItemRequestAction(
      created.id,
      birtamodMaker,
      {
        action: "RESUBMIT",
        remarks: null,
        expectedVersion: returned.version,
      },
    );
    const recommended = await performItemRequestAction(
      created.id,
      birtamodChecker,
      {
        action: "RECOMMEND",
        remarks: "Ready for corporate",
        expectedVersion: resubmitted.version,
      },
    );
    assert.equal(recommended.status, "PENDING_CORPORATE_MAKER");
    const reviewAfterRecommend = await listItemRequests(birtamodChecker, {
      page: 1,
      pageSize: 50,
      status: "ALL",
      queue: "recommend",
      search: created.requestNumber,
    });
    assert.equal(
      reviewAfterRecommend.items.some((item) => item.id === created.id),
      false,
    );

    const forwarded = await performItemRequestAction(
      created.id,
      corporateMaker,
      {
        action: "FORWARD",
        remarks: null,
        expectedVersion: recommended.version,
      },
    );
    const rejected = await performItemRequestAction(
      created.id,
      corporateChecker,
      {
        action: "REJECT",
        remarks: "Not required",
        expectedVersion: forwarded.version,
      },
    );
    assert.equal(rejected.status, "REJECTED");
    assert.equal(rejected.actions.at(-1)?.action, "REJECT");

    const ledgerAfter = await getDb()
      .select({ value: count() })
      .from(stockLedger);
    assert.equal(ledgerAfter[0]?.value, ledgerBefore[0]?.value);
  });
});
