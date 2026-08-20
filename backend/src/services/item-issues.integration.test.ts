import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { eq, inArray, like } from "drizzle-orm";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import type { AuthenticatedUser } from "@printing-stationery/shared";
import { createApp } from "../app.js";
import { loadEnv, type Env } from "../config/env.js";
import { closePool, createDb, getDb } from "../db/client.js";
import {
  applicationUsers,
  authSessions,
  userRoles,
} from "../db/schema/auth.js";
import { branches } from "../db/schema/branches.js";
import { employees } from "../db/schema/employees.js";
import { itemIssueLines, itemIssues } from "../db/schema/item-issues.js";
import { itemRequestLines, itemRequests } from "../db/schema/item-requests.js";
import { items } from "../db/schema/items.js";
import { stores } from "../db/schema/stores.js";
import { storeUsers } from "../db/schema/store-users.js";
import { ITEM_ISSUE_OPERATOR_FORBIDDEN_MESSAGE } from "./item-issue-authorization.js";
import {
  createItemIssueFromRequest,
  getItemIssueById,
  getItemIssueEligibility,
  updateItemIssue,
} from "./item-issues.service.js";
import { getItemRequestById } from "./item-requests.service.js";
import { AppError } from "../utils/errors.js";
import { generateSessionToken, hashPassword, hashSessionToken } from "../utils/password.js";

const REQUEST_NUMBER_PREFIX = "IR-TIA-";
const UNRELATED_STORE_CODE = "TIAUTH-S1";
const UNRELATED_MAKER_CODE = "TIAUTH-M1";
const UNRELATED_CHECKER_CODE = "TIAUTH-C1";
const UNRELATED_MAKER_USERNAME = "tiauth_maker";
const UNRELATED_CHECKER_USERNAME = "tiauth_checker";

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

    const leftoverStore = await db
      .select({ id: stores.id })
      .from(stores)
      .where(eq(stores.storeCode, UNRELATED_STORE_CODE))
      .limit(1);
    if (leftoverStore[0]) {
      await db.delete(storeUsers).where(eq(storeUsers.storeId, leftoverStore[0].id));
      await db.delete(stores).where(eq(stores.id, leftoverStore[0].id));
    }

    const leftoverUsers = await db
      .select({ id: applicationUsers.id })
      .from(applicationUsers)
      .where(
        inArray(applicationUsers.username, [
          UNRELATED_MAKER_USERNAME,
          UNRELATED_CHECKER_USERNAME,
        ]),
      );
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
  let unrelatedChecker: AuthenticatedUser;
  let corporateMakerSession: string;
  let itemId: string;

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
      .where(eq(branches.branchType, "HEAD_OFFICE"));
    const corporateRow = corporateRows.find((row) => row.store.underStoreId === null);
    if (!corporateRow) {
      throw new Error("Corporate supplying store is not configured");
    }
    corporate = await loadAssignment(corporateRow.store.id);

    const branchRows = await getDb()
      .select({ store: stores, branch: branches })
      .from(stores)
      .innerJoin(branches, eq(stores.branchId, branches.id))
      .where(eq(branches.branchType, "BRANCH"));
    const branchRow = branchRows[0];
    if (!branchRow) {
      throw new Error("A requesting branch store is required for item issue tests");
    }
    requesting = await loadAssignment(branchRow.store.id);

    const itemRows = await getDb()
      .select({ id: items.id })
      .from(items)
      .where(eq(items.isRequestable, true))
      .limit(1);
    const foundItemId = itemRows[0]?.id;
    if (!foundItemId) {
      throw new Error("No requestable item exists for item issue tests");
    }
    itemId = foundItemId;

    corporateChecker = await loadActor(corporate.checkerUserId);
    corporateMaker = await loadActor(corporate.makerUserId);
    requestingChecker = await loadActor(requesting.checkerUserId);

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

    const unrelatedStore = await getDb()
      .insert(stores)
      .values({
        storeCode: UNRELATED_STORE_CODE,
        storeName: "Issue Auth Unrelated Store",
        branchId: branchRow.branch.id,
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

    approvedRequestId = await insertRequest("APPROVED");
    draftRequestId = await insertRequest("DRAFT");
    corporateMakerSession = await createSession(corporate.makerUserId);

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

  it("lets the supplying-store checker see issue eligibility for an approved request", async () => {
    const eligibility = await getItemIssueEligibility(
      approvedRequestId,
      corporateChecker,
    );
    assert.equal(eligibility.canCreate, true);
    assert.equal(eligibility.request?.corporateStore?.id, corporate.storeId);
  });

  it("lets the supplying-store checker create an item issue draft", async () => {
    const issue = await createItemIssueFromRequest(
      approvedRequestId,
      corporateChecker,
      {
        remarks: null,
        lines: [{ requestLineId, issueQuantity: "4" }],
      },
    );
    createdIssueId = issue.id;
    assert.equal(issue.status, "DRAFT");
    assert.equal(issue.fromStore.id, corporate.storeId);
    assert.equal(issue.toStore.id, requesting.storeId);
    assert.equal(issue.createdBy.id, corporateChecker.id);
    assert.equal(issue.canEdit, true);
  });

  it("records the authenticated supplying-store checker as the creator", async () => {
    assert.ok(createdIssueId);
    const issue = await getItemIssueById(createdIssueId, corporateChecker);
    assert.equal(issue.createdBy.id, corporateChecker.id);
    assert.notEqual(issue.createdBy.id, corporateMaker.id);
  });

  it("hides issue eligibility from the supplying-store maker", async () => {
    await assert.rejects(
      () => getItemIssueEligibility(approvedRequestId, corporateMaker),
      (error: unknown) =>
        isAppError(error, 403, ITEM_ISSUE_OPERATOR_FORBIDDEN_MESSAGE),
    );
  });

  it("returns 403 when the supplying-store maker calls create directly", async () => {
    await assert.rejects(
      () =>
        createItemIssueFromRequest(approvedRequestId, corporateMaker, {
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
        isAppError(error, 403, ITEM_ISSUE_OPERATOR_FORBIDDEN_MESSAGE),
    );
  });

  it("returns 403 when an unrelated-store checker creates the issue", async () => {
    await assert.rejects(
      () =>
        createItemIssueFromRequest(approvedRequestId, unrelatedChecker, {
          remarks: null,
          lines: [{ requestLineId, issueQuantity: "1" }],
        }),
      (error: unknown) =>
        isAppError(error, 403, ITEM_ISSUE_OPERATOR_FORBIDDEN_MESSAGE),
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

  it("returns 403 when the maker posts to the create API with a session cookie", async () => {
    const result = await api(`/api/item-requests/${approvedRequestId}/item-issues`, {
      method: "POST",
      token: corporateMakerSession,
      origin: env.FRONTEND_ORIGIN,
      body: {
        remarks: null,
        lines: [{ requestLineId, issueQuantity: "1" }],
      },
    });
    assert.equal(result.status, 403);
    assert.deepEqual(result.json, {
      error: { message: ITEM_ISSUE_OPERATOR_FORBIDDEN_MESSAGE },
    });
  });

  it("ignores a browser-provided store id and still authorizes from the database request", async () => {
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
    const created = await createItemIssueFromRequest(
      approvedRequestId,
      corporateChecker,
      {
        remarks: null,
        lines: [{ requestLineId, issueQuantity: "1" }],
      },
    );
    assert.equal(created.fromStore.id, corporate.storeId);
    assert.notEqual(created.fromStore.id, requesting.storeId);
  });

  it("rejects a checker creating an issue from a non-approved request", async () => {
    await assert.rejects(
      () =>
        createItemIssueFromRequest(draftRequestId, corporateChecker, {
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

  it("still rejects over-issue against remaining quantity", async () => {
    assert.ok(createdIssueId);
    await assert.rejects(
      () =>
        updateItemIssue(createdIssueId, corporateChecker, {
          expectedVersion: 1,
          lines: [{ requestLineId, issueQuantity: "11" }],
        }),
      (error: unknown) =>
        error instanceof AppError &&
        error.statusCode === 409 &&
        /exceeds the remaining requested quantity/i.test(error.message),
    );
  });

  it("does not let the supplying-store maker continue editing a created draft", async () => {
    assert.ok(createdIssueId);
    await assert.rejects(
      () => getItemIssueById(createdIssueId, corporateMaker),
      (error: unknown) => isAppError(error, 404, "Item issue not found"),
    );
    await assert.rejects(
      () =>
        updateItemIssue(createdIssueId, corporateMaker, {
          expectedVersion: 1,
          remarks: "maker edit",
        }),
      (error: unknown) => isAppError(error, 404, "Item issue not found"),
    );
  });

  it("shows create-issue eligibility on the request for the checker and not the maker", async () => {
    const checkerView = await getItemRequestById(approvedRequestId, corporateChecker);
    const makerView = await getItemRequestById(approvedRequestId, corporateMaker);
    assert.equal(checkerView.canCreateIssue, true);
    assert.equal(makerView.canCreateIssue, false);
  });
});
