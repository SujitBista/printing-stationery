import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { and, eq, inArray, like, or } from "drizzle-orm";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import type { AuthenticatedUser } from "@printing-stationery/shared";
import { ITEM_ISSUE_ACTIVE_CONFLICT_CODE, preferCorporateControlStore } from "@printing-stationery/shared";
import { createApp } from "../app.js";
import { loadEnv, type Env } from "../config/env.js";
import { closePool, createDb, getDb } from "../db/client.js";
import {
  applicationUsers,
  authSessions,
  userRoles,
} from "../db/schema/auth.js";
import { branches } from "../db/schema/branches.js";
import { departments } from "../db/schema/departments.js";
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
import { stockLedgerSourceKey } from "./stock-ledger.js";
import { itemRequestLines, itemRequests } from "../db/schema/item-requests.js";
import { notifications } from "../db/schema/notifications.js";
import { items } from "../db/schema/items.js";
import { stockLedger } from "../db/schema/opening-stocks.js";
import { stores } from "../db/schema/stores.js";
import { storeUsers } from "../db/schema/store-users.js";
import {
    ITEM_ISSUE_CHECKER_CREATE_FORBIDDEN_MESSAGE,
    ITEM_ISSUE_DESTINATION_FORBIDDEN_MESSAGE,
    ITEM_ISSUE_OPERATOR_FORBIDDEN_MESSAGE,
    ITEM_ISSUE_SELF_VERIFY_FORBIDDEN_MESSAGE,
} from "./item-issue-authorization.js";
import {
  confirmItemIssueReceipt,
  getIncomingShipment,
  listIncomingShipments,
  submitItemIssueReceipt,
} from "./item-issue-receipts.service.js";
import {
  createDepartmentIssue,
  createItemIssueFromRequest,
  countItemIssuesForQueue,
  getItemIssueById,
  getItemIssueEligibility,
  listDepartmentConsumptions,
  listItemIssues,
  rejectItemIssue,
  returnItemIssue,
  submitItemIssue,
  updateItemIssue,
  verifyAndPostItemIssue,
} from "./item-issues.service.js";
import { getOperationalAvailableQuantities } from "./opening-stocks.service.js";
import {
  getItemRequestById,
  getItemRequestContext,
  listItemRequests,
} from "./item-requests.service.js";
import { listNotifications } from "./notifications.service.js";
import { AppError } from "../utils/errors.js";
import { generateSessionToken, hashPassword, hashSessionToken } from "../utils/password.js";

const REQUEST_NUMBER_PREFIX = "IR-TIA-";
const UNRELATED_STORE_CODE = "TIAUTH-S1";
const UNRELATED_BRANCH_CODE = "TIAUTH-B1";
const UNRELATED_MAKER_CODE = "TIAUTH-M1";
const UNRELATED_CHECKER_CODE = "TIAUTH-C1";
const UNRELATED_MAKER_USERNAME = "tiauth_maker";
const UNRELATED_CHECKER_USERNAME = "tiauth_checker";
const CORP_MAKER_CODE = "TIAUTH-CM";
const CORP_CHECKER_CODE = "TIAUTH-CC";
const CORP_MAKER_USERNAME = "tiauth_corp_maker";
const CORP_CHECKER_USERNAME = "tiauth_corp_checker";

let originalCorporateAssignment: {
  id: string;
  makerApplicationUserId: string | null;
  supervisorApplicationUserId: string | null;
  isActive: boolean;
} | null = null;
let seededLedgerIds: string[] = [];

type StoreAssignment = {
  storeId: string;
  storeCode: string;
  storeName: string;
  makerUserId: string;
  checkerUserId: string;
  branchType: string;
};

function isAppError(
  error: unknown,
  statusCode: number,
  message?: string,
): error is AppError {
  return (
    error instanceof AppError &&
    error.statusCode === statusCode &&
    (message === undefined || error.message === message)
  );
}

function assertIssueAvailabilityQuantities(
  line:
    | {
        requestedQuantity: string;
        previouslyIssuedQuantity: string;
        thisIssueQuantity: string;
        outstandingBeforeThisIssue: string;
        remainingQuantity: string;
        remainingAfterIssue: string | null;
      }
    | undefined,
  expected: {
    requestedQuantity: string;
    previouslyIssuedQuantity: string;
    thisIssueQuantity: string;
    outstandingBeforeThisIssue: string;
    remainingQuantity: string;
    remainingAfterIssue: string | null;
  },
) {
  assert.ok(line);
  assert.equal(line.requestedQuantity, expected.requestedQuantity);
  assert.equal(line.previouslyIssuedQuantity, expected.previouslyIssuedQuantity);
  assert.equal(line.thisIssueQuantity, expected.thisIssueQuantity);
  assert.equal(
    line.outstandingBeforeThisIssue,
    expected.outstandingBeforeThisIssue,
  );
  assert.equal(line.remainingQuantity, expected.remainingQuantity);
  assert.equal(line.remainingAfterIssue, expected.remainingAfterIssue);
}

  async function deleteIssuesForRequests(requestIds: string[]): Promise<void> {
    if (requestIds.length === 0) {
      return;
    }
    const db = getDb();
    const issueRows = await db
      .select({ id: itemIssues.id })
      .from(itemIssues)
      .where(inArray(itemIssues.requestId, requestIds));
    const issueIds = issueRows.map((row) => row.id);
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
      const ledgerRefIds = [...issueIds, ...shipmentIds, ...receiptIds];
      await db
        .delete(stockLedger)
        .where(inArray(stockLedger.referenceId, ledgerRefIds));
      if (receiptIds.length > 0) {
        await db
          .delete(itemIssueReceipts)
          .where(inArray(itemIssueReceipts.id, receiptIds));
      }
      if (shipmentIds.length > 0) {
        await db
          .delete(itemIssueShipmentLines)
          .where(inArray(itemIssueShipmentLines.shipmentId, shipmentIds));
        await db
          .delete(itemIssueShipments)
          .where(inArray(itemIssueShipments.id, shipmentIds));
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
        .delete(itemIssueLines)
        .where(inArray(itemIssueLines.itemIssueId, issueIds));
      await db.delete(itemIssues).where(inArray(itemIssues.id, issueIds));
    }
  }

  async function deleteRequests(requestIds: string[]): Promise<void> {
    if (requestIds.length === 0) {
      return;
    }
    const db = getDb();
    await deleteIssuesForRequests(requestIds);
    await db
      .delete(itemRequestLines)
      .where(inArray(itemRequestLines.itemRequestId, requestIds));
    await db.delete(itemRequests).where(inArray(itemRequests.id, requestIds));
  }

  async function cleanupNamedFixtures(): Promise<void> {
    const db = getDb();
    const leftoverRequests = await db
      .select({ id: itemRequests.id })
      .from(itemRequests)
      .where(like(itemRequests.requestNumber, `${REQUEST_NUMBER_PREFIX}%`));
    await deleteRequests(leftoverRequests.map((row) => row.id));

    if (seededLedgerIds.length > 0) {
      await db.delete(stockLedger).where(inArray(stockLedger.id, seededLedgerIds));
      seededLedgerIds = [];
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
      originalCorporateAssignment = null;
    }

    const leftoverStore = await db
      .select({ id: stores.id })
      .from(stores)
      .where(eq(stores.storeCode, UNRELATED_STORE_CODE))
      .limit(1);
    if (leftoverStore[0]) {
      await db.delete(storeUsers).where(eq(storeUsers.storeId, leftoverStore[0].id));
      await db.delete(stores).where(eq(stores.id, leftoverStore[0].id));
    }
    await db
      .delete(branches)
      .where(eq(branches.branchCode, UNRELATED_BRANCH_CODE));

    const leftoverUsers = await db
      .select({ id: applicationUsers.id })
      .from(applicationUsers)
      .where(
        inArray(applicationUsers.username, [
          UNRELATED_MAKER_USERNAME,
          UNRELATED_CHECKER_USERNAME,
          CORP_MAKER_USERNAME,
          CORP_CHECKER_USERNAME,
        ]),
      );
    const leftoverUserIds = leftoverUsers.map((user) => user.id);
    if (leftoverUserIds.length > 0) {
      await db
        .delete(notifications)
        .where(
          or(
            inArray(notifications.recipientUserId, leftoverUserIds),
            inArray(notifications.actorUserId, leftoverUserIds),
          ),
        );
      await db
        .delete(storeUsers)
        .where(
          or(
            inArray(storeUsers.makerApplicationUserId, leftoverUserIds),
            inArray(storeUsers.supervisorApplicationUserId, leftoverUserIds),
          ),
        );
    }
    for (const user of leftoverUsers) {
      await db.delete(authSessions).where(eq(authSessions.userId, user.id));
      await db.delete(userRoles).where(eq(userRoles.userId, user.id));
      await db.delete(applicationUsers).where(eq(applicationUsers.id, user.id));
    }

    await db
      .delete(employees)
      .where(
        inArray(employees.employeeCode, [
          UNRELATED_MAKER_CODE,
          UNRELATED_CHECKER_CODE,
          CORP_MAKER_CODE,
          CORP_CHECKER_CODE,
        ]),
      );
  }

describe("item issue authorization integration", { concurrency: false }, () => {
  let env: Env;
  let server: Server;
  let baseUrl: string;
  let corporate: StoreAssignment;
  let requesting: StoreAssignment;
  let approvedRequestId: string;
  let draftRequestId: string;
  let requestLineId: string;
  let createdIssueId: string | undefined;
  let createdSessionIds: string[] = [];
  let corporateChecker: AuthenticatedUser;
  let corporateMaker: AuthenticatedUser;
  let requestingChecker: AuthenticatedUser;
  let requestingMaker: AuthenticatedUser;
  let unrelatedChecker: AuthenticatedUser;
  let unrelatedMaker: AuthenticatedUser;
  let corporateMakerSession: string;
  let corporateCheckerSession: string;
  let itemId: string;
  let itemUnitId: string;

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

  async function loadAssignment(
    storeId: string,
  ): Promise<StoreAssignment> {
    const rows = await getDb()
      .select({
        store: stores,
        branch: branches,
        assignment: storeUsers,
      })
      .from(storeUsers)
      .innerJoin(stores, eq(storeUsers.storeId, stores.id))
      .innerJoin(branches, eq(stores.branchId, branches.id))
      .where(eq(storeUsers.storeId, storeId))
      .limit(1);
    const row = rows[0];
    if (!row) {
      throw new Error(`No store user assignment for store ${storeId}`);
    }
    if (!row.assignment.makerApplicationUserId || !row.assignment.supervisorApplicationUserId) {
      throw new Error(`Incomplete store user assignment for store ${storeId}`);
    }
    return {
      storeId: row.store.id,
      storeCode: row.store.storeCode,
      storeName: row.store.storeName,
      makerUserId: row.assignment.makerApplicationUserId,
      checkerUserId: row.assignment.supervisorApplicationUserId,
      branchType: row.branch.branchType,
    };
  }

  async function insertRequest(status: "APPROVED" | "DRAFT"): Promise<string> {
    const requestNumber = `IR-TIA-${status === "APPROVED" ? "A" : "D"}-${Date.now().toString(36)}`;
    const inserted = await getDb()
      .insert(itemRequests)
      .values({
        requestNumber,
        requestingStoreId: requesting.storeId,
        corporateStoreId: corporate.storeId,
        createdByApplicationUserId: requesting.makerUserId,
        branchCheckerApplicationUserId: requesting.checkerUserId,
        corporateMakerApplicationUserId: corporate.makerUserId,
        corporateCheckerApplicationUserId: corporate.checkerUserId,
        status,
        remarks: null,
        version: 1,
        approvedAt: status === "APPROVED" ? new Date() : null,
      })
      .returning({ id: itemRequests.id });
    const id = inserted[0]?.id;
    if (!id) {
      throw new Error("Failed to insert test item request");
    }

    const line = await getDb()
      .insert(itemRequestLines)
      .values({
        itemRequestId: id,
        itemId,
        requestedQuantity: "10",
      })
      .returning({ id: itemRequestLines.id });
    const lineId = line[0]?.id;
    if (!lineId) {
      throw new Error("Failed to insert test item request line");
    }
    if (status === "APPROVED") {
      requestLineId = lineId;
    }
    return id;
  }

  async function createSession(userId: string): Promise<string> {
    const sessionToken = generateSessionToken();
    const inserted = await getDb()
      .insert(authSessions)
      .values({
        userId,
        tokenHash: hashSessionToken(sessionToken),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      })
      .returning({ id: authSessions.id });
    const sessionId = inserted[0]?.id;
    if (sessionId) {
      createdSessionIds.push(sessionId);
    }
    return sessionToken;
  }

  async function api(
    path: string,
    options: {
      method?: string;
      token?: string;
      body?: unknown;
      origin?: string;
    } = {},
  ): Promise<{ status: number; json: unknown }> {
    const headers = new Headers();
    headers.set("content-type", "application/json");
    if (options.origin !== undefined) {
      headers.set("origin", options.origin);
    }
    if (options.token) {
      headers.set("cookie", `${env.SESSION_COOKIE_NAME}=${options.token}`);
    }
    const response = await fetch(`${baseUrl}${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    const json: unknown = await response.json().catch(() => null);
    return { status: response.status, json };
  }

  before(async () => {
    env = loadEnv();
    createDb(env);
    await cleanupNamedFixtures();

    const corporateRows = await getDb()
      .select({ store: stores, branch: branches })
      .from(stores)
      .innerJoin(branches, eq(stores.branchId, branches.id))
      .where(eq(stores.isActive, true));
    const preferredCorporate = preferCorporateControlStore(
      corporateRows.map((row) => ({
        id: row.store.id,
        storeCode: row.store.storeCode,
        storeName: row.store.storeName,
        underStoreId: row.store.underStoreId,
        branchType: row.branch.branchType,
      })),
    );
    const corporateRow =
      corporateRows.find((row) => row.store.id === preferredCorporate?.id) ??
      corporateRows.find(
        (row) =>
          row.branch.branchType === "HEAD_OFFICE" &&
          row.store.underStoreId === null,
      );
    if (!corporateRow) {
      throw new Error("Corporate supplying store is not configured");
    }

    const existingCorporateAssignment = await getDb()
      .select()
      .from(storeUsers)
      .where(eq(storeUsers.storeId, corporateRow.store.id))
      .limit(1);
    if (!existingCorporateAssignment[0]?.isActive) {
      const passwordHash = await hashPassword("TestIssueAuth!1a");
      const makerEmployee = await getDb()
        .insert(employees)
        .values({
          employeeCode: CORP_MAKER_CODE,
          employeeName: "Issue Auth Corporate Maker",
          branchId: corporateRow.branch.id,
          isActive: true,
        })
        .returning({ id: employees.id });
      const checkerEmployee = await getDb()
        .insert(employees)
        .values({
          employeeCode: CORP_CHECKER_CODE,
          employeeName: "Issue Auth Corporate Checker",
          branchId: corporateRow.branch.id,
          isActive: true,
        })
        .returning({ id: employees.id });
      const makerUser = await getDb()
        .insert(applicationUsers)
        .values({
          employeeId: makerEmployee[0]!.id,
          username: CORP_MAKER_USERNAME,
          passwordHash,
          mustChangePassword: false,
          isActive: true,
        })
        .returning({ id: applicationUsers.id });
      const checkerUser = await getDb()
        .insert(applicationUsers)
        .values({
          employeeId: checkerEmployee[0]!.id,
          username: CORP_CHECKER_USERNAME,
          passwordHash,
          mustChangePassword: false,
          isActive: true,
        })
        .returning({ id: applicationUsers.id });
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
          storeId: corporateRow.store.id,
          makerApplicationUserId: makerUser[0]!.id,
          supervisorApplicationUserId: checkerUser[0]!.id,
          isActive: true,
        });
      }
    }
    corporate = await loadAssignment(corporateRow.store.id);

    const assignmentRows = await getDb()
      .select({ storeId: storeUsers.storeId })
      .from(storeUsers)
      .where(eq(storeUsers.isActive, true));
    const assignedIds = new Set(assignmentRows.map((row) => row.storeId));
    const branchRows = await getDb()
      .select({ store: stores, branch: branches })
      .from(stores)
      .innerJoin(branches, eq(stores.branchId, branches.id))
      .where(eq(branches.branchType, "BRANCH"));
    const branchRow = branchRows.find(
      (row) =>
        assignedIds.has(row.store.id) && row.store.id !== corporate.storeId,
    );
    if (!branchRow) {
      throw new Error("A requesting branch store is required for item issue tests");
    }
    requesting = await loadAssignment(branchRow.store.id);

    const itemRows = await getDb()
      .select({ id: items.id, unitId: items.unitId })
      .from(items)
      .where(eq(items.isRequestable, true))
      .limit(1);
    const foundItem = itemRows[0];
    if (!foundItem) {
      throw new Error("No requestable item exists for item issue tests");
    }
    itemId = foundItem.id;
    itemUnitId = foundItem.unitId;

    corporateChecker = await loadActor(corporate.checkerUserId);
    corporateMaker = await loadActor(corporate.makerUserId);
    requestingChecker = await loadActor(requesting.checkerUserId);
    requestingMaker = await loadActor(requesting.makerUserId);

    const passwordHash = await hashPassword("TestIssueAuth!1a");
    const makerEmployee = await getDb()
      .insert(employees)
      .values({
        employeeCode: UNRELATED_MAKER_CODE,
        employeeName: "Issue Auth Maker",
        branchId: branchRow.branch.id,
        isActive: true,
      })
      .returning({ id: employees.id });
    const checkerEmployee = await getDb()
      .insert(employees)
      .values({
        employeeCode: UNRELATED_CHECKER_CODE,
        employeeName: "Issue Auth Checker",
        branchId: branchRow.branch.id,
        isActive: true,
      })
      .returning({ id: employees.id });
    const makerEmployeeId = makerEmployee[0]?.id;
    const checkerEmployeeId = checkerEmployee[0]?.id;
    if (!makerEmployeeId || !checkerEmployeeId) {
      throw new Error("Failed to insert unrelated-store employees");
    }

    const makerUser = await getDb()
      .insert(applicationUsers)
      .values({
        employeeId: makerEmployeeId,
        username: UNRELATED_MAKER_USERNAME,
        passwordHash,
        mustChangePassword: false,
        isActive: true,
      })
      .returning({ id: applicationUsers.id });
    const checkerUser = await getDb()
      .insert(applicationUsers)
      .values({
        employeeId: checkerEmployeeId,
        username: UNRELATED_CHECKER_USERNAME,
        passwordHash,
        mustChangePassword: false,
        isActive: true,
      })
      .returning({ id: applicationUsers.id });
    const makerUserId = makerUser[0]?.id;
    const checkerUserId = checkerUser[0]?.id;
    if (!makerUserId || !checkerUserId) {
      throw new Error("Failed to insert unrelated-store users");
    }
    await getDb().insert(userRoles).values([
      { userId: makerUserId, role: "MAKER" },
      { userId: checkerUserId, role: "CHECKER" },
    ]);

    const unrelatedBranch = await getDb()
      .insert(branches)
      .values({
        branchCode: UNRELATED_BRANCH_CODE,
        branchName: "Issue Auth Unrelated Branch",
        branchType: "BRANCH",
        isActive: true,
      })
      .returning({ id: branches.id });
    const unrelatedBranchId = unrelatedBranch[0]?.id;
    if (!unrelatedBranchId) {
      throw new Error("Failed to insert unrelated branch");
    }
    const unrelatedStore = await getDb()
      .insert(stores)
      .values({
        storeCode: UNRELATED_STORE_CODE,
        storeName: "Issue Auth Unrelated Store",
        branchId: unrelatedBranchId,
        underStoreId: corporate.storeId,
        isActive: true,
      })
      .returning({ id: stores.id });
    const unrelatedStoreId = unrelatedStore[0]?.id;
    if (!unrelatedStoreId) {
      throw new Error("Failed to insert unrelated store");
    }
    await getDb().insert(storeUsers).values({
      storeId: unrelatedStoreId,
      makerApplicationUserId: makerUserId,
      supervisorApplicationUserId: checkerUserId,
      isActive: true,
    });
    unrelatedChecker = await loadActor(checkerUserId);
    unrelatedMaker = await loadActor(makerUserId);

    const seeded = await getDb()
      .insert(stockLedger)
      .values({
        storeId: corporate.storeId,
        itemId,
        unitId: itemUnitId,
        rate: "1",
        movementType: "PURCHASE",
        stockCategory: "AVAILABLE",
        quantityIn: "100",
        quantityOut: "0",
        amountIn: "100",
        amountOut: "0",
        transactionDate: new Date(),
        referenceType: "PURCHASE",
        referenceId: randomUUID(),
        referenceLineId: randomUUID(),
        sourceKey: stockLedgerSourceKey({
          referenceType: "PURCHASE",
          referenceLineId: randomUUID(),
          storeId: corporate.storeId,
          movementType: "PURCHASE",
          stockCategory: "AVAILABLE",
          rate: "1",
        }),
        postedByApplicationUserId: corporateMaker.id,
        postedAt: new Date(),
      })
      .returning({ id: stockLedger.id });
    if (seeded[0]) {
      seededLedgerIds.push(seeded[0].id);
    }

    approvedRequestId = await insertRequest("APPROVED");
    draftRequestId = await insertRequest("DRAFT");
    corporateMakerSession = await createSession(corporate.makerUserId);
    corporateCheckerSession = await createSession(corporate.checkerUserId);

    const app = createApp(env);
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", () => resolve()));
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  after(async () => {
    try {
      const db = getDb();
      for (const sessionId of createdSessionIds) {
        await db.delete(authSessions).where(eq(authSessions.id, sessionId));
      }
      await cleanupNamedFixtures();
    } finally {
      await new Promise<void>((resolve, reject) => {
        if (!server) {
          resolve();
          return;
        }
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
      await closePool();
    }
  });

  it("lets the supplying-store maker see issue eligibility for an approved request", async () => {
    const eligibility = await getItemIssueEligibility(
      approvedRequestId,
      corporateMaker,
    );
    assert.equal(eligibility.canCreate, true);
    assert.equal(eligibility.request?.corporateStore?.id, corporate.storeId);
    assert.ok(eligibility.lines.length > 0);
    for (const line of eligibility.lines) {
      assert.equal(line.stockBalanceKnown, true);
      assert.equal(typeof line.availableStockQuantity, "string");
      assert.match(line.availableStockQuantity ?? "", /^-?\d+(?:\.\d+)?$/);
    }

    const fromStoreStock = await getOperationalAvailableQuantities({
      storeId: corporate.storeId,
      itemIds: eligibility.lines.map((line) => line.itemId),
    });
    for (const line of eligibility.lines) {
      const matching = fromStoreStock.find(
        (row) =>
          row.storeId === corporate.storeId &&
          row.itemId === line.itemId &&
          row.unitId === line.unit.id,
      );
      assert.equal(line.availableStockQuantity, matching?.availableQuantity ?? "0");
    }
  });

  it("returns 403 when the Corporate Checker loads issue eligibility", async () => {
    await assert.rejects(
      () => getItemIssueEligibility(approvedRequestId, corporateChecker),
      (error: unknown) =>
        isAppError(error, 403, ITEM_ISSUE_CHECKER_CREATE_FORBIDDEN_MESSAGE),
    );
  });

  it("returns 403 when the Corporate Checker creates an item issue", async () => {
    await assert.rejects(
      () =>
        createItemIssueFromRequest(approvedRequestId, corporateChecker, {
          remarks: null,
          lines: [{ requestLineId, issueQuantity: "1" }],
        }),
      (error: unknown) =>
        isAppError(error, 403, ITEM_ISSUE_CHECKER_CREATE_FORBIDDEN_MESSAGE),
    );
  });

  it("returns 403 when the Branch Maker creates a Corporate Store issue", async () => {
    await assert.rejects(
      () =>
        createItemIssueFromRequest(approvedRequestId, requestingMaker, {
          remarks: null,
          lines: [{ requestLineId, issueQuantity: "1" }],
        }),
      (error: unknown) =>
        isAppError(error, 403, ITEM_ISSUE_OPERATOR_FORBIDDEN_MESSAGE),
    );
  });

  it("returns 403 when the requesting-store checker creates the corporate issue", async () => {
    await assert.rejects(
      () =>
        createItemIssueFromRequest(approvedRequestId, requestingChecker, {
          remarks: null,
          lines: [{ requestLineId, issueQuantity: "1" }],
        }),
      (error: unknown) =>
        isAppError(error, 403, ITEM_ISSUE_CHECKER_CREATE_FORBIDDEN_MESSAGE),
    );
  });

  it("returns 403 when an unrelated-store maker creates the issue", async () => {
    await assert.rejects(
      () =>
        createItemIssueFromRequest(approvedRequestId, unrelatedMaker, {
          remarks: null,
          lines: [{ requestLineId, issueQuantity: "1" }],
        }),
      (error: unknown) =>
        isAppError(error, 403, ITEM_ISSUE_OPERATOR_FORBIDDEN_MESSAGE),
    );
    await assert.rejects(
      () =>
        createItemIssueFromRequest(approvedRequestId, unrelatedChecker, {
          remarks: null,
          lines: [{ requestLineId, issueQuantity: "1" }],
        }),
      (error: unknown) =>
        isAppError(error, 403, ITEM_ISSUE_CHECKER_CREATE_FORBIDDEN_MESSAGE),
    );
  });

  it("returns 401 for an unauthenticated create request", async () => {
    const result = await api(`/api/item-requests/${approvedRequestId}/item-issues`, {
      method: "POST",
      origin: env.FRONTEND_ORIGIN,
      body: {
        remarks: null,
        lines: [{ requestLineId, issueQuantity: "1" }],
      },
    });
    assert.equal(result.status, 401);
  });

  it("returns 401 for an unauthenticated eligibility request", async () => {
    const result = await api(
      `/api/item-requests/${approvedRequestId}/issue-eligibility`,
    );
    assert.equal(result.status, 401);
  });

  it("returns 403 when the Corporate Checker posts to the create API", async () => {
    const result = await api(`/api/item-requests/${approvedRequestId}/item-issues`, {
      method: "POST",
      token: corporateCheckerSession,
      origin: env.FRONTEND_ORIGIN,
      body: {
        remarks: null,
        lines: [{ requestLineId, issueQuantity: "1" }],
      },
    });
    assert.equal(result.status, 403);
    assert.deepEqual(result.json, {
      error: { message: ITEM_ISSUE_CHECKER_CREATE_FORBIDDEN_MESSAGE },
    });
  });

  it("ignores a browser-provided store id instead of trusting it", async () => {
    const result = await api(`/api/item-requests/${approvedRequestId}/item-issues`, {
      method: "POST",
      token: corporateMakerSession,
      origin: env.FRONTEND_ORIGIN,
      body: {
        remarks: null,
        lines: [{ requestLineId, issueQuantity: "1" }],
        fromStoreId: requesting.storeId,
      },
    });
    assert.equal(result.status, 400);
  });

  it("rejects a maker creating an issue from a non-approved request", async () => {
    await assert.rejects(
      () =>
        createItemIssueFromRequest(draftRequestId, corporateMaker, {
          remarks: null,
          lines: [{ requestLineId, issueQuantity: "1" }],
        }),
      (error: unknown) =>
        isAppError(
          error,
          409,
          "An item issue can be created only from an approved request.",
        ),
    );
  });

  it("lets the supplying-store maker create an item issue draft", async () => {
    const beforeCreate = await getItemRequestById(approvedRequestId, corporateMaker);
    assert.equal(beforeCreate.canCreateIssue, true);
    assert.equal(beforeCreate.activeIssue, null);
    const readyBefore = await listItemRequests(corporateMaker, {
      page: 1,
      pageSize: 100,
      status: "ALL",
      queue: "ready-to-issue",
    });
    assert.equal(
      readyBefore.items.some((item) => item.id === approvedRequestId),
      true,
    );

    const issue = await createItemIssueFromRequest(
      approvedRequestId,
      corporateMaker,
      {
        remarks: null,
        lines: [{ requestLineId, issueQuantity: "4" }],
      },
    );
    createdIssueId = issue.id;
    assert.equal(issue.status, "DRAFT");
    assert.equal(issue.fromStore.id, corporate.storeId);
    assert.equal(issue.toStore?.id, requesting.storeId);
    assert.equal(issue.createdBy.id, corporateMaker.id);
    assert.equal(issue.canEdit, true);
    assert.equal(issue.canVerify, false);
    assertIssueAvailabilityQuantities(issue.availability[0], {
      requestedQuantity: "10",
      previouslyIssuedQuantity: "0",
      thisIssueQuantity: "4",
      outstandingBeforeThisIssue: "10",
      remainingQuantity: "10",
      remainingAfterIssue: null,
    });
    assert.equal(issue.request?.lines[0]?.issuedQuantity, "0");
    assert.equal(issue.request?.lines[0]?.remainingQuantity, "10");
    assert.equal(beforeCreate.lines[0]?.remainingQuantity, "10");
    assert.equal(beforeCreate.totalRemainingQuantity, "10");
  });

  it("records the authenticated supplying-store maker as the creator", async () => {
    assert.ok(createdIssueId);
    const issue = await getItemIssueById(createdIssueId, corporateMaker);
    assert.equal(issue.createdBy.id, corporateMaker.id);
    assert.notEqual(issue.createdBy.id, corporateChecker.id);
  });

  it("rejects a second open issue for the same remaining quantities", async () => {
    await assert.rejects(
      () =>
        createItemIssueFromRequest(approvedRequestId, corporateMaker, {
          remarks: null,
          lines: [{ requestLineId, issueQuantity: "1" }],
        }),
      (error: unknown) =>
        error instanceof AppError &&
        error.statusCode === 409 &&
        error.details?.code === ITEM_ISSUE_ACTIVE_CONFLICT_CODE &&
        error.details?.issueId === createdIssueId &&
        typeof error.details?.issueNumber === "string" &&
        error.details?.status === "DRAFT" &&
        /already exists/i.test(error.message),
    );
  });

  it("still rejects over-issue against remaining quantity", async () => {
    assert.ok(createdIssueId);
    await assert.rejects(
      () =>
        updateItemIssue(createdIssueId, corporateMaker, {
          expectedVersion: 1,
          lines: [{ requestLineId, issueQuantity: "11" }],
        }),
      (error: unknown) =>
        error instanceof AppError &&
        error.statusCode === 409 &&
        /exceeds request remainder/i.test(error.message),
    );
  });

  it("does not let the Corporate Checker edit a created draft", async () => {
    assert.ok(createdIssueId);
    const issue = await getItemIssueById(createdIssueId, corporateChecker);
    assert.equal(issue.canEdit, false);
    await assert.rejects(
      () =>
        updateItemIssue(createdIssueId, corporateChecker, {
          expectedVersion: 1,
          remarks: "checker edit",
        }),
      (error: unknown) =>
        isAppError(error, 403, ITEM_ISSUE_CHECKER_CREATE_FORBIDDEN_MESSAGE),
    );
  });

  it("shows create-issue eligibility on the request for the maker and not the checker", async () => {
    const checkerView = await getItemRequestById(approvedRequestId, corporateChecker);
    const makerView = await getItemRequestById(approvedRequestId, corporateMaker);
    assert.equal(makerView.canCreateIssue, false);
    assert.equal(makerView.activeIssue?.id, createdIssueId);
    assert.equal(makerView.activeIssue?.status, "DRAFT");
    assert.equal(checkerView.canCreateIssue, false);
    assert.equal(checkerView.activeIssue?.id, createdIssueId);

    const eligibility = await getItemIssueEligibility(
      approvedRequestId,
      corporateMaker,
    );
    assert.equal(eligibility.canCreate, false);
    assert.equal(eligibility.activeIssue?.id, createdIssueId);
    assert.equal(eligibility.activeIssue?.status, "DRAFT");
    assert.equal(eligibility.draftIssueId, createdIssueId);

    const ready = await listItemRequests(corporateMaker, {
      page: 1,
      pageSize: 100,
      status: "ALL",
      queue: "ready-to-issue",
    });
    assert.equal(
      ready.items.some((item) => item.id === approvedRequestId),
      true,
    );
    const draftRow = ready.items.find((item) => item.id === approvedRequestId);
    assert.equal(draftRow?.canCreateIssue, false);
    assert.equal(draftRow?.activeIssue?.status, "DRAFT");
  });

  it("does not reduce stock when the maker submits for verification", async () => {
    assert.ok(createdIssueId);
    const before = await getOperationalAvailableQuantities({
      storeId: corporate.storeId,
      itemIds: [itemId],
    });
    const submitted = await submitItemIssue(createdIssueId, corporateMaker, {
      expectedVersion: 1,
    });
    assert.equal(submitted.status, "PENDING_VERIFICATION");
    assertIssueAvailabilityQuantities(submitted.availability[0], {
      requestedQuantity: "10",
      previouslyIssuedQuantity: "0",
      thisIssueQuantity: "4",
      outstandingBeforeThisIssue: "10",
      remainingQuantity: "10",
      remainingAfterIssue: null,
    });
    assert.equal(submitted.request?.lines[0]?.remainingQuantity, "10");
    const after = await getOperationalAvailableQuantities({
      storeId: corporate.storeId,
      itemIds: [itemId],
    });
    assert.deepEqual(after, before);

    const notes = await listNotifications(corporateChecker.id, {
      page: 1,
      pageSize: 20,
    });
    const submittedNote = notes.items.find(
      (item) =>
        item.type === "ITEM_ISSUE_SUBMITTED" &&
        item.relatedEntityId === createdIssueId,
    );
    assert.ok(submittedNote);
    assert.equal(submittedNote.isRead, false);
  });

  it("removes a submitted issue from Ready to Issue and keeps issued quantity at zero", async () => {
    const request = await getItemRequestById(approvedRequestId, corporateMaker);
    assert.equal(request.status, "APPROVED");
    assert.equal(request.totalIssuedQuantity, "0");
    assert.equal(request.totalRemainingQuantity, "10");
    assert.equal(request.lines[0]?.remainingQuantity, "10");
    assert.equal(request.canCreateIssue, false);
    assert.equal(request.activeIssue?.id, createdIssueId);
    assert.equal(request.activeIssue?.status, "PENDING_VERIFICATION");

    const eligibility = await getItemIssueEligibility(
      approvedRequestId,
      corporateMaker,
    );
    assert.equal(eligibility.canCreate, false);
    assert.equal(eligibility.draftIssueId, null);
    assert.equal(eligibility.activeIssue?.id, createdIssueId);
    assert.equal(eligibility.activeIssue?.status, "PENDING_VERIFICATION");

    const ready = await listItemRequests(corporateMaker, {
      page: 1,
      pageSize: 100,
      status: "ALL",
      queue: "ready-to-issue",
    });
    assert.equal(
      ready.items.some((item) => item.id === approvedRequestId),
      false,
    );

    const context = await getItemRequestContext(corporateMaker);
    assert.equal(context.readyToIssueCount, ready.totalItems);

    const pending = await listItemIssues(corporateChecker, {
      page: 1,
      pageSize: 100,
      status: "ALL",
      queue: "pending-verification",
    });
    assert.equal(
      pending.items.some((item) => item.id === createdIssueId),
      true,
    );
    const pendingCount = await countItemIssuesForQueue(
      corporateChecker,
      "pending-verification",
    );
    assert.equal(pendingCount, pending.totalItems);
    assert.equal(context.pendingIssueVerificationCount, pendingCount);
  });

  it("returns a conflict payload with the existing submitted issue", async () => {
    const result = await api(
      `/api/item-requests/${approvedRequestId}/item-issues`,
      {
        method: "POST",
        token: corporateMakerSession,
        origin: env.FRONTEND_ORIGIN,
        body: {
          remarks: null,
          lines: [{ requestLineId, issueQuantity: "1" }],
        },
      },
    );
    assert.equal(result.status, 409);
    assert.deepEqual(result.json, {
      error: {
        message: "An open item issue already exists for this request.",
        details: {
          code: ITEM_ISSUE_ACTIVE_CONFLICT_CODE,
          issueId: createdIssueId,
          issueNumber: (await getItemIssueById(createdIssueId!, corporateMaker))
            .issueNumber,
          status: "PENDING_VERIFICATION",
        },
      },
    });
  });

  it("does not let the Corporate Maker verify their own issue", async () => {
    assert.ok(createdIssueId);
    const issue = await getItemIssueById(createdIssueId, corporateMaker);
    await assert.rejects(
      () =>
        verifyAndPostItemIssue(createdIssueId, corporateMaker, {
          expectedVersion: issue.version,
          remarks: null,
        }),
      (error: unknown) =>
        isAppError(error, 403, ITEM_ISSUE_SELF_VERIFY_FORBIDDEN_MESSAGE) ||
        isAppError(
          error,
          403,
          "Only a checker assigned to the supplying store can verify this item issue.",
        ),
    );
  });

  it("lets the Corporate Checker verify and post, reducing Corporate Store stock once", async () => {
    assert.ok(createdIssueId);
    const beforeCorporate = await getOperationalAvailableQuantities({
      storeId: corporate.storeId,
      itemIds: [itemId],
    });
    const beforeBranch = await getOperationalAvailableQuantities({
      storeId: requesting.storeId,
      itemIds: [itemId],
    });
    const issue = await getItemIssueById(createdIssueId, corporateChecker);
    const posted = await verifyAndPostItemIssue(createdIssueId, corporateChecker, {
      expectedVersion: issue.version,
      remarks: "Verified for handover",
    });
    assert.equal(posted.status, "POSTED");
    assert.equal(posted.deliveryStatus, "IN_TRANSIT");
    assert.equal(posted.destinationType, "BRANCH_STORE");
    assert.equal(posted.verifiedBy?.id, corporateChecker.id);
    assertIssueAvailabilityQuantities(posted.availability[0], {
      requestedQuantity: "10",
      previouslyIssuedQuantity: "0",
      thisIssueQuantity: "4",
      outstandingBeforeThisIssue: "10",
      remainingQuantity: "6",
      remainingAfterIssue: "6",
    });
    assert.equal(posted.request?.lines[0]?.issuedQuantity, "4");
    assert.equal(posted.request?.lines[0]?.remainingQuantity, "6");

    const afterCorporate = await getOperationalAvailableQuantities({
      storeId: corporate.storeId,
      itemIds: [itemId],
    });
    const afterBranch = await getOperationalAvailableQuantities({
      storeId: requesting.storeId,
      itemIds: [itemId],
    });
    const beforeQty = Number(beforeCorporate[0]?.availableQuantity ?? "0");
    const afterQty = Number(afterCorporate[0]?.availableQuantity ?? "0");
    assert.equal(afterQty, beforeQty - 4);
    assert.deepEqual(afterBranch, beforeBranch);

    const ledgerRows = await getDb()
      .select({ id: stockLedger.id, stockCategory: stockLedger.stockCategory })
      .from(stockLedger)
      .where(eq(stockLedger.referenceId, createdIssueId));
    assert.equal(ledgerRows.length, 1);
    assert.equal(ledgerRows[0]?.stockCategory, "AVAILABLE");
    assert.ok(posted.shipment);
    assert.equal(Number(posted.shipment.lines[0]?.dispatchedQuantity), 4);
    assert.equal(Number(posted.shipment.lines[0]?.confirmedReceivedQuantity), 0);
    assert.equal(Number(posted.shipment.lines[0]?.remainingInTransitQuantity), 4);
    const inTransitLedger = await getDb()
      .select({
        stockCategory: stockLedger.stockCategory,
        quantityIn: stockLedger.quantityIn,
        quantityOut: stockLedger.quantityOut,
      })
      .from(stockLedger)
      .where(eq(stockLedger.referenceId, posted.shipment.id));
    assert.equal(inTransitLedger.length, 1);
    assert.equal(inTransitLedger[0]?.stockCategory, "IN_TRANSIT");
    assert.equal(Number(inTransitLedger[0]?.quantityIn), 4);
    assert.equal(Number(inTransitLedger[0]?.quantityOut), 0);

    const request = await getItemRequestById(approvedRequestId, corporateMaker);
    assert.equal(request.status, "PARTIALLY_ISSUED");
    assert.equal(request.lines[0]?.issuedQuantity, "4");
    assert.equal(request.lines[0]?.remainingQuantity, "6");
    assert.equal(request.totalRemainingQuantity, "6");
    assert.equal(request.canCreateIssue, true);
    assert.equal(request.activeIssue, null);

    const ready = await listItemRequests(corporateMaker, {
      page: 1,
      pageSize: 100,
      status: "ALL",
      queue: "ready-to-issue",
    });
    assert.equal(
      ready.items.some((item) => item.id === approvedRequestId),
      false,
    );

    const partial = await listItemRequests(corporateMaker, {
      page: 1,
      pageSize: 100,
      status: "ALL",
      queue: "partial-pending",
    });
    assert.equal(
      partial.items.some((item) => item.id === approvedRequestId),
      true,
    );
    const partialRow = partial.items.find((item) => item.id === approvedRequestId);
    assert.equal(partialRow?.totalIssuedQuantity, "4");
    assert.equal(partialRow?.totalRemainingQuantity, "6");

    const branchNotes = await listNotifications(requestingMaker.id, {
      page: 1,
      pageSize: 20,
    });
    const postedNote = branchNotes.items.find(
      (item) =>
        item.type === "ITEM_ISSUE_POSTED" && item.relatedEntityId === createdIssueId,
    );
    assert.ok(postedNote);
    assert.equal(postedNote.isRead, false);
    const dispatchedNote = branchNotes.items.find(
      (item) =>
        item.type === "ITEM_ISSUE_DISPATCHED" &&
        item.relatedEntityId === createdIssueId,
    );
    assert.ok(dispatchedNote);
  });

  it("keeps destination store stock unchanged until the branch confirms receipt", async () => {
    assert.ok(createdIssueId);
    const issue = await getItemIssueById(createdIssueId, requestingMaker);
    assert.ok(issue.shipment);
    const shipmentId = issue.shipment.id;
    const shipmentLineId = issue.shipment.lines[0]?.id;
    assert.ok(shipmentLineId);

    const beforeConfirmBranch = await getOperationalAvailableQuantities({
      storeId: requesting.storeId,
      itemIds: [itemId],
    });
    const beforeConfirmCorporate = await getOperationalAvailableQuantities({
      storeId: corporate.storeId,
      itemIds: [itemId],
    });

    const incoming = await listIncomingShipments(requestingMaker, {
      page: 1,
      pageSize: 20,
      queue: "in-transit",
    });
    assert.equal(
      incoming.items.some((item) => item.id === shipmentId),
      true,
    );

    await assert.rejects(
      () => getIncomingShipment(shipmentId, unrelatedMaker),
      (error: unknown) =>
        isAppError(error, 403, ITEM_ISSUE_DESTINATION_FORBIDDEN_MESSAGE),
    );

    const submitted = await submitItemIssueReceipt(shipmentId, requestingMaker, {
      receiptDate: new Date().toISOString(),
      remarks: "Physical count 3",
      discrepancyResolution: "KEEP_IN_TRANSIT",
      lines: [
        {
          shipmentLineId,
          receivedQuantityNow: "3",
          missingQuantity: "1",
          damagedQuantity: "0",
          remarks: null,
        },
      ],
    });
    const afterSubmitBranch = await getOperationalAvailableQuantities({
      storeId: requesting.storeId,
      itemIds: [itemId],
    });
    assert.deepEqual(afterSubmitBranch, beforeConfirmBranch);
    const pendingReceipt = submitted.receipts.find(
      (receipt) => receipt.status === "PENDING_VERIFICATION",
    );
    assert.ok(pendingReceipt);

    await assert.rejects(
      () =>
        confirmItemIssueReceipt(pendingReceipt.id, requestingMaker, {
          expectedVersion: pendingReceipt.version,
          remarks: null,
        }),
      (error: unknown) => error instanceof AppError && error.statusCode === 403,
    );

    const confirmed = await confirmItemIssueReceipt(
      pendingReceipt.id,
      requestingChecker,
      {
        expectedVersion: pendingReceipt.version,
        remarks: null,
        discrepancyResolution: "KEEP_IN_TRANSIT",
      },
    );
    assert.equal(confirmed.deliveryStatus, "PARTIALLY_RECEIVED");
    assert.equal(Number(confirmed.lines[0]?.confirmedReceivedQuantity), 3);
    assert.equal(Number(confirmed.lines[0]?.remainingInTransitQuantity), 1);

    const afterPartialBranch = await getOperationalAvailableQuantities({
      storeId: requesting.storeId,
      itemIds: [itemId],
    });
    const afterPartialCorporate = await getOperationalAvailableQuantities({
      storeId: corporate.storeId,
      itemIds: [itemId],
    });
    assert.equal(
      Number(afterPartialBranch[0]?.availableQuantity ?? "0"),
      Number(beforeConfirmBranch[0]?.availableQuantity ?? "0") + 3,
    );
    assert.deepEqual(afterPartialCorporate, beforeConfirmCorporate);

    await assert.rejects(
      () =>
        confirmItemIssueReceipt(pendingReceipt.id, requestingChecker, {
          expectedVersion: pendingReceipt.version,
          remarks: null,
        }),
      (error: unknown) =>
        error instanceof AppError &&
        error.statusCode === 409 &&
        /already been confirmed/i.test(error.message),
    );

    const checkerNotes = await listNotifications(corporateChecker.id, {
      page: 1,
      pageSize: 20,
    });
    assert.ok(
      checkerNotes.items.some(
        (item) =>
          item.type === "ITEM_ISSUE_RECEIPT_CONFIRMED" &&
          item.relatedEntityId === createdIssueId,
      ),
    );

    const secondSubmit = await submitItemIssueReceipt(shipmentId, requestingMaker, {
      receiptDate: new Date().toISOString(),
      remarks: null,
      lines: [
        {
          shipmentLineId,
          receivedQuantityNow: "1",
          remarks: null,
        },
      ],
    });
    const secondPending = secondSubmit.receipts.find(
      (receipt) => receipt.status === "PENDING_VERIFICATION",
    );
    assert.ok(secondPending);
    const received = await confirmItemIssueReceipt(
      secondPending.id,
      requestingChecker,
      {
        expectedVersion: secondPending.version,
        remarks: null,
      },
    );
    assert.equal(received.deliveryStatus, "RECEIVED");
    assert.equal(Number(received.lines[0]?.remainingInTransitQuantity), 0);
    const afterReceivedBranch = await getOperationalAvailableQuantities({
      storeId: requesting.storeId,
      itemIds: [itemId],
    });
    assert.equal(
      Number(afterReceivedBranch[0]?.availableQuantity ?? "0"),
      Number(beforeConfirmBranch[0]?.availableQuantity ?? "0") + 4,
    );
  });

  it("prevents duplicate verification of a posted issue", async () => {
    assert.ok(createdIssueId);
    const issue = await getItemIssueById(createdIssueId, corporateChecker);
    await assert.rejects(
      () =>
        verifyAndPostItemIssue(createdIssueId, corporateChecker, {
          expectedVersion: issue.version,
          remarks: null,
        }),
      (error: unknown) =>
        error instanceof AppError &&
        error.statusCode === 409 &&
        /already been dispatched/i.test(error.message),
    );
  });

  it("keeps remaining quantity eligible after partial posting and then marks the request issued", async () => {
    assert.ok(createdIssueId);
    const second = await createItemIssueFromRequest(
      approvedRequestId,
      corporateMaker,
      {
        remarks: null,
        lines: [{ requestLineId, issueQuantity: "6" }],
      },
    );
    assertIssueAvailabilityQuantities(second.availability[0], {
      requestedQuantity: "10",
      previouslyIssuedQuantity: "4",
      thisIssueQuantity: "6",
      outstandingBeforeThisIssue: "6",
      remainingQuantity: "6",
      remainingAfterIssue: null,
    });
    const submitted = await submitItemIssue(second.id, corporateMaker, {
      expectedVersion: second.version,
    });
    assertIssueAvailabilityQuantities(submitted.availability[0], {
      requestedQuantity: "10",
      previouslyIssuedQuantity: "4",
      thisIssueQuantity: "6",
      outstandingBeforeThisIssue: "6",
      remainingQuantity: "6",
      remainingAfterIssue: null,
    });
    const submittedRequest = await getItemRequestById(
      approvedRequestId,
      corporateMaker,
    );
    assert.equal(submittedRequest.lines[0]?.remainingQuantity, "6");
    const posted = await verifyAndPostItemIssue(second.id, corporateChecker, {
      expectedVersion: submitted.version,
      remarks: null,
    });
    assert.equal(posted.status, "POSTED");
    assertIssueAvailabilityQuantities(posted.availability[0], {
      requestedQuantity: "10",
      previouslyIssuedQuantity: "4",
      thisIssueQuantity: "6",
      outstandingBeforeThisIssue: "6",
      remainingQuantity: "0",
      remainingAfterIssue: "0",
    });
    const firstPosted = await getItemIssueById(createdIssueId, corporateMaker);
    assertIssueAvailabilityQuantities(firstPosted.availability[0], {
      requestedQuantity: "10",
      previouslyIssuedQuantity: "0",
      thisIssueQuantity: "4",
      outstandingBeforeThisIssue: "10",
      remainingQuantity: "6",
      remainingAfterIssue: "6",
    });
    assert.equal(firstPosted.request?.lines[0]?.issuedQuantity, "10");
    assert.equal(firstPosted.request?.lines[0]?.remainingQuantity, "0");
    const request = await getItemRequestById(approvedRequestId, corporateMaker);
    assert.equal(request.status, "ISSUED");
    assert.equal(request.lines[0]?.remainingQuantity, "0");
    assert.equal(request.totalRemainingQuantity, "0");
    assert.equal(request.canCreateIssue, false);
    assert.equal(request.activeIssue, null);

    const ready = await listItemRequests(corporateMaker, {
      page: 1,
      pageSize: 100,
      status: "ALL",
      queue: "ready-to-issue",
    });
    assert.equal(
      ready.items.some((item) => item.id === approvedRequestId),
      false,
    );
    const partial = await listItemRequests(corporateMaker, {
      page: 1,
      pageSize: 100,
      status: "ALL",
      queue: "partial-pending",
    });
    assert.equal(
      partial.items.some((item) => item.id === approvedRequestId),
      false,
    );
    const issued = await listItemRequests(corporateMaker, {
      page: 1,
      pageSize: 100,
      status: "ALL",
      queue: "issued",
    });
    assert.equal(
      issued.items.some((item) => item.id === approvedRequestId),
      true,
    );
  });

  it("does not change stock when an issue is returned or rejected", async () => {
    const returnRequestId = await insertRequest("APPROVED");
    const returnLine = await getDb()
      .select({ id: itemRequestLines.id })
      .from(itemRequestLines)
      .where(eq(itemRequestLines.itemRequestId, returnRequestId))
      .limit(1);
    const returnLineId = returnLine[0]?.id;
    assert.ok(returnLineId);

    const draft = await createItemIssueFromRequest(returnRequestId, corporateMaker, {
      remarks: null,
      lines: [{ requestLineId: returnLineId, issueQuantity: "2" }],
    });
    const submitted = await submitItemIssue(draft.id, corporateMaker, {
      expectedVersion: draft.version,
    });
    const before = await getOperationalAvailableQuantities({
      storeId: corporate.storeId,
      itemIds: [itemId],
    });
    const returned = await returnItemIssue(draft.id, corporateChecker, {
      expectedVersion: submitted.version,
      remarks: "Correct the issue quantity",
    });
    assert.equal(returned.status, "RETURNED");
    const afterReturn = await getOperationalAvailableQuantities({
      storeId: corporate.storeId,
      itemIds: [itemId],
    });
    assert.deepEqual(afterReturn, before);
    const stillApproved = await getItemRequestById(returnRequestId, corporateMaker);
    assert.equal(stillApproved.status, "APPROVED");
    assert.equal(stillApproved.totalIssuedQuantity, "0");
    assert.equal(stillApproved.canCreateIssue, false);
    assert.equal(stillApproved.activeIssue?.id, draft.id);
    assert.equal(stillApproved.activeIssue?.status, "RETURNED");

    const returnedQueue = await listItemIssues(corporateMaker, {
      page: 1,
      pageSize: 100,
      status: "ALL",
      queue: "returned",
    });
    assert.equal(
      returnedQueue.items.some((item) => item.id === draft.id),
      true,
    );
    const returnedCount = await countItemIssuesForQueue(corporateMaker, "returned");
    assert.equal(returnedCount, returnedQueue.totalItems);

    const readyAfterReturn = await listItemRequests(corporateMaker, {
      page: 1,
      pageSize: 100,
      status: "ALL",
      queue: "ready-to-issue",
    });
    assert.equal(
      readyAfterReturn.items.some((item) => item.id === returnRequestId),
      false,
    );

    const returnEligibility = await getItemIssueEligibility(
      returnRequestId,
      corporateMaker,
    );
    assert.equal(returnEligibility.canCreate, false);
    assert.equal(returnEligibility.draftIssueId, draft.id);
    assert.equal(returnEligibility.activeIssue?.status, "RETURNED");

    await assert.rejects(
      () =>
        createItemIssueFromRequest(returnRequestId, corporateMaker, {
          remarks: null,
          lines: [{ requestLineId: returnLineId, issueQuantity: "1" }],
        }),
      (error: unknown) =>
        error instanceof AppError &&
        error.statusCode === 409 &&
        error.details?.code === ITEM_ISSUE_ACTIVE_CONFLICT_CODE &&
        error.details?.issueId === draft.id &&
        error.details?.status === "RETURNED",
    );

    const makerNotes = await listNotifications(corporateMaker.id, {
      page: 1,
      pageSize: 20,
    });
    assert.ok(
      makerNotes.items.some(
        (item) =>
          item.type === "ITEM_ISSUE_RETURNED" && item.relatedEntityId === draft.id,
      ),
    );

    const resubmitted = await submitItemIssue(draft.id, corporateMaker, {
      expectedVersion: returned.version,
    });
    const rejected = await rejectItemIssue(draft.id, corporateChecker, {
      expectedVersion: resubmitted.version,
      remarks: "Do not issue this request",
    });
    assert.equal(rejected.status, "REJECTED");
    const afterReject = await getOperationalAvailableQuantities({
      storeId: corporate.storeId,
      itemIds: [itemId],
    });
    assert.deepEqual(afterReject, before);
    const stillEligible = await getItemIssueEligibility(
      returnRequestId,
      corporateMaker,
    );
    assert.equal(stillEligible.canCreate, true);
  });

  it("prevents concurrent posting of the same issue", async () => {
    const concurrentRequestId = await insertRequest("APPROVED");
    const concurrentLine = await getDb()
      .select({ id: itemRequestLines.id })
      .from(itemRequestLines)
      .where(eq(itemRequestLines.itemRequestId, concurrentRequestId))
      .limit(1);
    const concurrentLineId = concurrentLine[0]?.id;
    assert.ok(concurrentLineId);

    const draft = await createItemIssueFromRequest(
      concurrentRequestId,
      corporateMaker,
      {
        remarks: null,
        lines: [{ requestLineId: concurrentLineId, issueQuantity: "3" }],
      },
    );
    const submitted = await submitItemIssue(draft.id, corporateMaker, {
      expectedVersion: draft.version,
    });
    const before = await getOperationalAvailableQuantities({
      storeId: corporate.storeId,
      itemIds: [itemId],
    });

    const results = await Promise.allSettled([
      verifyAndPostItemIssue(draft.id, corporateChecker, {
        expectedVersion: submitted.version,
        remarks: null,
      }),
      verifyAndPostItemIssue(draft.id, corporateChecker, {
        expectedVersion: submitted.version,
        remarks: null,
      }),
    ]);
    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);

    const after = await getOperationalAvailableQuantities({
      storeId: corporate.storeId,
      itemIds: [itemId],
    });
    const beforeQty = Number(before[0]?.availableQuantity ?? "0");
    const afterQty = Number(after[0]?.availableQuantity ?? "0");
    assert.equal(afterQty, beforeQty - 3);

    const ledgerRows = await getDb()
      .select({ id: stockLedger.id })
      .from(stockLedger)
      .where(eq(stockLedger.referenceId, draft.id));
    assert.equal(ledgerRows.length, 1);
  });

  it("prevents concurrent creation of two open issues for the same request", async () => {
    const concurrentRequestId = await insertRequest("APPROVED");
    const concurrentLine = await getDb()
      .select({ id: itemRequestLines.id })
      .from(itemRequestLines)
      .where(eq(itemRequestLines.itemRequestId, concurrentRequestId))
      .limit(1);
    const concurrentLineId = concurrentLine[0]?.id;
    assert.ok(concurrentLineId);

    const results = await Promise.allSettled([
      createItemIssueFromRequest(concurrentRequestId, corporateMaker, {
        remarks: null,
        lines: [{ requestLineId: concurrentLineId, issueQuantity: "2" }],
      }),
      createItemIssueFromRequest(concurrentRequestId, corporateMaker, {
        remarks: null,
        lines: [{ requestLineId: concurrentLineId, issueQuantity: "3" }],
      }),
    ]);
    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);

    const rejectedError =
      rejected[0]?.status === "rejected" ? rejected[0].reason : null;
    assert.equal(rejectedError instanceof AppError, true);
    if (rejectedError instanceof AppError) {
      assert.equal(rejectedError.statusCode, 409);
      assert.equal(rejectedError.details?.code, ITEM_ISSUE_ACTIVE_CONFLICT_CODE);
      assert.equal(typeof rejectedError.details?.issueId, "string");
      assert.equal(typeof rejectedError.details?.issueNumber, "string");
      assert.equal(rejectedError.details?.status, "DRAFT");
    }

    const created =
      fulfilled[0]?.status === "fulfilled" ? fulfilled[0].value : null;
    assert.ok(created);
    const openRows = await getDb()
      .select({ id: itemIssues.id, status: itemIssues.status })
      .from(itemIssues)
      .where(eq(itemIssues.requestId, concurrentRequestId));
    const open = openRows.filter((row) =>
      ["DRAFT", "PENDING_VERIFICATION", "RETURNED"].includes(row.status),
    );
    assert.equal(open.length, 1);
    assert.equal(open[0]?.id, created.id);
  });

  it("issues to a corporate department without creating in-transit or destination stock", async () => {
    const insertedDepartment = await getDb()
      .insert(departments)
      .values({
        departmentCode: "TIAUTH-D1",
        departmentName: "General Service",
        isActive: true,
      })
      .returning({ id: departments.id });
    const departmentId = insertedDepartment[0]?.id;
    assert.ok(departmentId);

    try {
      await assert.rejects(
        () =>
          createDepartmentIssue(corporateMaker, {
            fromStoreId: corporate.storeId,
            departmentId,
            consumptionDescription: "",
            remarks: null,
            lines: [{ itemId, issueQuantity: "2" }],
          }),
        (error: unknown) =>
          error instanceof AppError &&
          /Consumption Description is required/i.test(error.message),
      );

      const before = await getOperationalAvailableQuantities({
        storeId: corporate.storeId,
        itemIds: [itemId],
      });
      const beforeBranch = await getOperationalAvailableQuantities({
        storeId: requesting.storeId,
        itemIds: [itemId],
      });
      const draft = await createDepartmentIssue(corporateMaker, {
        fromStoreId: corporate.storeId,
        departmentId,
        consumptionDescription:
          "Registers issued to General Service for maintaining customer account closure records.",
        remarks: null,
        lines: [{ itemId, issueQuantity: "2" }],
      });
      assert.equal(draft.destinationType, "CORPORATE_DEPARTMENT");
      assert.equal(draft.deliveryStatus, null);
      const submitted = await submitItemIssue(draft.id, corporateMaker, {
        expectedVersion: draft.version,
      });
      const issued = await verifyAndPostItemIssue(submitted.id, corporateChecker, {
        expectedVersion: submitted.version,
        remarks: null,
      });
      assert.equal(issued.status, "POSTED");
      assert.equal(issued.shipment, null);
      const after = await getOperationalAvailableQuantities({
        storeId: corporate.storeId,
        itemIds: [itemId],
      });
      const afterBranch = await getOperationalAvailableQuantities({
        storeId: requesting.storeId,
        itemIds: [itemId],
      });
      assert.equal(
        Number(after[0]?.availableQuantity ?? "0"),
        Number(before[0]?.availableQuantity ?? "0") - 2,
      );
      assert.deepEqual(afterBranch, beforeBranch);

      const history = await listDepartmentConsumptions(corporateChecker, {
        page: 1,
        pageSize: 20,
        search: issued.issueNumber,
      });
      assert.equal(history.items.length, 1);
      assert.equal(history.items[0]?.department.departmentName, "General Service");
      assert.equal(Number(history.items[0]?.quantityConsumed), 2);
      const consumptionLine = history.items[0]?.lines[0];
      assert.ok(consumptionLine);
      assert.ok(Number(consumptionLine.unitCost) >= 0);
      assert.equal(
        Number((Number(consumptionLine.unitCost) * Number(consumptionLine.quantity)).toFixed(2)),
        Number(Number(consumptionLine.totalCost).toFixed(2)),
      );
      assert.equal(
        Number(history.items[0]?.totalConsumptionValue),
        Number(consumptionLine.totalCost),
      );
      assert.match(
        history.items[0]?.consumptionDescription ?? "",
        /customer account closure/i,
      );
      const departmentTransit = await getDb()
        .select({ id: stockLedger.id })
        .from(stockLedger)
        .where(
          and(
            eq(stockLedger.referenceId, issued.id),
            eq(stockLedger.stockCategory, "IN_TRANSIT"),
          ),
        );
      assert.equal(departmentTransit.length, 0);

      await assert.rejects(
        () =>
          verifyAndPostItemIssue(issued.id, corporateChecker, {
            expectedVersion: issued.version,
            remarks: null,
          }),
        (error: unknown) =>
          error instanceof AppError &&
          /already been issued/i.test(error.message),
      );
    } finally {
      const issueRows = await getDb()
        .select({ id: itemIssues.id })
        .from(itemIssues)
        .where(eq(itemIssues.departmentId, departmentId));
      await deleteIssuesForRequests([]);
      const issueIds = issueRows.map((row) => row.id);
      if (issueIds.length > 0) {
        const consumptionRows = await getDb()
          .select({ id: departmentConsumptions.id })
          .from(departmentConsumptions)
          .where(inArray(departmentConsumptions.itemIssueId, issueIds));
        const consumptionIds = consumptionRows.map((row) => row.id);
        if (consumptionIds.length > 0) {
          await getDb()
            .delete(departmentConsumptionLines)
            .where(
              inArray(
                departmentConsumptionLines.departmentConsumptionId,
                consumptionIds,
              ),
            );
          await getDb()
            .delete(departmentConsumptions)
            .where(inArray(departmentConsumptions.id, consumptionIds));
        }
        await getDb()
          .delete(stockLedger)
          .where(inArray(stockLedger.referenceId, issueIds));
        await getDb()
          .delete(notifications)
          .where(
            and(
              eq(notifications.relatedEntityType, "ITEM_ISSUE"),
              inArray(notifications.relatedEntityId, issueIds),
            ),
          );
        await getDb()
          .delete(itemIssueActions)
          .where(inArray(itemIssueActions.itemIssueId, issueIds));
        await getDb()
          .delete(itemIssueLines)
          .where(inArray(itemIssueLines.itemIssueId, issueIds));
        await getDb().delete(itemIssues).where(inArray(itemIssues.id, issueIds));
      }
      await getDb().delete(departments).where(eq(departments.id, departmentId));
    }
  });

  it("completes a receipt with discrepancy without restoring Corporate Store stock", async () => {
    const requestId = await insertRequest("APPROVED");
    const lineId = requestLineId;
    const beforeCorporate = await getOperationalAvailableQuantities({
      storeId: corporate.storeId,
      itemIds: [itemId],
    });
    const beforeBranch = await getOperationalAvailableQuantities({
      storeId: requesting.storeId,
      itemIds: [itemId],
    });
    const draft = await createItemIssueFromRequest(requestId, corporateMaker, {
      remarks: null,
      lines: [{ requestLineId: lineId, issueQuantity: "5" }],
    });
    const submitted = await submitItemIssue(draft.id, corporateMaker, {
      expectedVersion: draft.version,
    });
    const dispatched = await verifyAndPostItemIssue(submitted.id, corporateChecker, {
      expectedVersion: submitted.version,
      remarks: null,
    });
    assert.ok(dispatched.shipment);
    const shipmentId = dispatched.shipment.id;
    const shipmentLineId = dispatched.shipment.lines[0]?.id;
    assert.ok(shipmentLineId);
    const afterDispatchCorporate = await getOperationalAvailableQuantities({
      storeId: corporate.storeId,
      itemIds: [itemId],
    });
    assert.equal(
      Number(afterDispatchCorporate[0]?.availableQuantity ?? "0"),
      Number(beforeCorporate[0]?.availableQuantity ?? "0") - 5,
    );

    const submittedReceipt = await submitItemIssueReceipt(shipmentId, requestingMaker, {
      receiptDate: new Date().toISOString(),
      remarks: "3 usable, 1 damaged, 1 missing",
      discrepancyResolution: "COMPLETE_WITH_DISCREPANCY",
      lines: [
        {
          shipmentLineId,
          receivedQuantityNow: "3",
          missingQuantity: "1",
          damagedQuantity: "1",
          discrepancyReason: "MISSING",
          remarks: null,
        },
      ],
    });
    const pending = submittedReceipt.receipts.find(
      (receipt) => receipt.status === "PENDING_VERIFICATION",
    );
    assert.ok(pending);
    const afterSubmitBranch = await getOperationalAvailableQuantities({
      storeId: requesting.storeId,
      itemIds: [itemId],
    });
    assert.deepEqual(afterSubmitBranch, beforeBranch);

    const confirmed = await confirmItemIssueReceipt(pending.id, requestingChecker, {
      expectedVersion: pending.version,
      remarks: null,
      discrepancyResolution: "COMPLETE_WITH_DISCREPANCY",
    });
    assert.equal(confirmed.deliveryStatus, "RECEIVED_WITH_DISCREPANCY");
    assert.equal(Number(confirmed.lines[0]?.confirmedReceivedQuantity), 3);
    assert.equal(Number(confirmed.lines[0]?.remainingInTransitQuantity), 0);
    assert.equal(Number(confirmed.lines[0]?.discrepancyQuantity), 2);

    const afterBranch = await getOperationalAvailableQuantities({
      storeId: requesting.storeId,
      itemIds: [itemId],
    });
    const afterCorporate = await getOperationalAvailableQuantities({
      storeId: corporate.storeId,
      itemIds: [itemId],
    });
    assert.equal(
      Number(afterBranch[0]?.availableQuantity ?? "0"),
      Number(beforeBranch[0]?.availableQuantity ?? "0") + 3,
    );
    assert.deepEqual(afterCorporate, afterDispatchCorporate);

    const discrepancyRows = await getDb()
      .select({
        quantity: itemIssueDiscrepancies.quantity,
        reason: itemIssueDiscrepancies.reason,
      })
      .from(itemIssueDiscrepancies)
      .where(eq(itemIssueDiscrepancies.itemIssueId, dispatched.id));
    assert.equal(discrepancyRows.length, 1);
    assert.equal(Number(discrepancyRows[0]?.quantity), 1);
    assert.equal(discrepancyRows[0]?.reason, "MISSING");

    const damagedLedger = await getDb()
      .select({ quantityIn: stockLedger.quantityIn })
      .from(stockLedger)
      .where(
        and(
          eq(stockLedger.referenceId, pending.id),
          eq(stockLedger.stockCategory, "DAMAGED"),
        ),
      );
    assert.equal(damagedLedger.length, 1);
    assert.equal(Number(damagedLedger[0]?.quantityIn), 1);

    const checkerNotes = await listNotifications(corporateChecker.id, {
      page: 1,
      pageSize: 40,
    });
    assert.ok(
      checkerNotes.items.some(
        (item) =>
          item.type === "ITEM_ISSUE_DISCREPANCY_REPORTED" &&
          item.relatedEntityId === dispatched.id,
      ),
    );
  });

  it("prevents concurrent confirmation of the same receipt from moving stock twice", async () => {
    const requestId = await insertRequest("APPROVED");
    const lineId = requestLineId;
    const beforeBranch = await getOperationalAvailableQuantities({
      storeId: requesting.storeId,
      itemIds: [itemId],
    });
    const draft = await createItemIssueFromRequest(requestId, corporateMaker, {
      remarks: null,
      lines: [{ requestLineId: lineId, issueQuantity: "4" }],
    });
    const submitted = await submitItemIssue(draft.id, corporateMaker, {
      expectedVersion: draft.version,
    });
    const dispatched = await verifyAndPostItemIssue(submitted.id, corporateChecker, {
      expectedVersion: submitted.version,
      remarks: null,
    });
    assert.ok(dispatched.shipment);
    const shipmentLineId = dispatched.shipment.lines[0]?.id;
    assert.ok(shipmentLineId);
    const submittedReceipt = await submitItemIssueReceipt(
      dispatched.shipment.id,
      requestingMaker,
      {
        receiptDate: new Date().toISOString(),
        remarks: null,
        lines: [
          {
            shipmentLineId,
            receivedQuantityNow: "2",
            remarks: null,
          },
        ],
      },
    );
    const pending = submittedReceipt.receipts.find(
      (receipt) => receipt.status === "PENDING_VERIFICATION",
    );
    assert.ok(pending);

    const results = await Promise.allSettled([
      confirmItemIssueReceipt(pending.id, requestingChecker, {
        expectedVersion: pending.version,
        remarks: null,
      }),
      confirmItemIssueReceipt(pending.id, requestingChecker, {
        expectedVersion: pending.version,
        remarks: null,
      }),
    ]);
    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);

    const afterBranch = await getOperationalAvailableQuantities({
      storeId: requesting.storeId,
      itemIds: [itemId],
    });
    assert.equal(
      Number(afterBranch[0]?.availableQuantity ?? "0"),
      Number(beforeBranch[0]?.availableQuantity ?? "0") + 2,
    );
    const winner =
      fulfilled[0]?.status === "fulfilled" ? fulfilled[0].value : null;
    assert.ok(winner);
    assert.equal(winner.deliveryStatus, "PARTIALLY_RECEIVED");
    assert.equal(Number(winner.lines[0]?.remainingInTransitQuantity), 2);
  });
});
