import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { eq, inArray } from "drizzle-orm";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
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
import { employeeTransfers } from "../db/schema/employee-transfers.js";
import { itemRequests } from "../db/schema/item-requests.js";
import { stores } from "../db/schema/stores.js";
import { storeUsers } from "../db/schema/store-users.js";
import { AppError } from "../utils/errors.js";
import {
  generateSessionToken,
  hashPassword,
  hashSessionToken,
} from "../utils/password.js";
import {
  listEmployeeTransfers,
  transferEmployee,
} from "./employees.service.js";

const PREFIX = `ETRF-${Date.now().toString(36)}`;

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

function todayIso(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

describe("employee transfer", () => {
  let env: Env;
  let server: Server;
  let baseUrl = "";
  let adminUserId = "";
  let fromBranchId = "";
  let toBranchId = "";
  let fromStoreId = "";
  let toStoreId = "";
  let makerEmployeeId = "";
  let makerUserId = "";
  let fromSupervisorUserId = "";
  let toSupervisorUserId = "";
  let makerSessionToken = "";
  let adminSessionToken = "";
  let requestId = "";
  const createdSessionIds: string[] = [];

  async function cleanup(): Promise<void> {
    const db = getDb();
    if (createdSessionIds.length > 0) {
      await db
        .delete(authSessions)
        .where(inArray(authSessions.id, createdSessionIds));
    }
    const employeeRows = await db
      .select({ id: employees.id })
      .from(employees)
      .where(
        inArray(employees.employeeCode, [
          `${PREFIX}-M`,
          `${PREFIX}-FS`,
          `${PREFIX}-TS`,
        ]),
      );
    const employeeIds = employeeRows.map((row) => row.id);

    const userRows =
      employeeIds.length === 0
        ? []
        : await db
            .select({ id: applicationUsers.id })
            .from(applicationUsers)
            .where(inArray(applicationUsers.employeeId, employeeIds));
    const userIds = userRows.map((row) => row.id);

    if (requestId) {
      await db.delete(itemRequests).where(eq(itemRequests.id, requestId));
    }

    if (employeeIds.length > 0) {
      await db
        .delete(employeeTransfers)
        .where(inArray(employeeTransfers.employeeId, employeeIds));
    }

    const storeRows = await db
      .select({ id: stores.id })
      .from(stores)
      .where(
        inArray(stores.storeCode, [`${PREFIX}-S1`, `${PREFIX}-S2`]),
      );
    const storeIds = storeRows.map((row) => row.id);
    if (storeIds.length > 0) {
      await db.delete(storeUsers).where(inArray(storeUsers.storeId, storeIds));
      await db.delete(stores).where(inArray(stores.id, storeIds));
    }

    if (userIds.length > 0) {
      await db.delete(authSessions).where(inArray(authSessions.userId, userIds));
      await db.delete(userRoles).where(inArray(userRoles.userId, userIds));
      await db
        .delete(applicationUsers)
        .where(inArray(applicationUsers.id, userIds));
    }

    if (employeeIds.length > 0) {
      await db.delete(employees).where(inArray(employees.id, employeeIds));
    }

    await db
      .delete(branches)
      .where(
        inArray(branches.branchCode, [`${PREFIX}-B1`, `${PREFIX}-B2`]),
      );
  }

  before(async () => {
    env = loadEnv();
    createDb(env);
    await cleanup();

    const adminRows = await getDb()
      .select({ id: applicationUsers.id })
      .from(applicationUsers)
      .innerJoin(userRoles, eq(userRoles.userId, applicationUsers.id))
      .where(eq(userRoles.role, "ADMIN"))
      .limit(1);
    const admin = adminRows[0];
    if (!admin) {
      throw new Error("An ADMIN application user is required for transfer tests");
    }
    adminUserId = admin.id;

    const fromBranch = await getDb()
      .insert(branches)
      .values({
        branchCode: `${PREFIX}-B1`,
        branchName: "Transfer From Branch",
        branchType: "BRANCH",
        isActive: true,
      })
      .returning({ id: branches.id });
    const toBranch = await getDb()
      .insert(branches)
      .values({
        branchCode: `${PREFIX}-B2`,
        branchName: "Transfer To Branch",
        branchType: "BRANCH",
        isActive: true,
      })
      .returning({ id: branches.id });
    fromBranchId = fromBranch[0]!.id;
    toBranchId = toBranch[0]!.id;

    const fromStore = await getDb()
      .insert(stores)
      .values({
        storeCode: `${PREFIX}-S1`,
        storeName: "Transfer From Store",
        branchId: fromBranchId,
        isActive: true,
      })
      .returning({ id: stores.id });
    const toStore = await getDb()
      .insert(stores)
      .values({
        storeCode: `${PREFIX}-S2`,
        storeName: "Transfer To Store",
        branchId: toBranchId,
        isActive: true,
      })
      .returning({ id: stores.id });
    fromStoreId = fromStore[0]!.id;
    toStoreId = toStore[0]!.id;

    const makerEmployee = await getDb()
      .insert(employees)
      .values({
        employeeCode: `${PREFIX}-M`,
        employeeName: "Transfer Maker",
        branchId: fromBranchId,
        isActive: true,
      })
      .returning({ id: employees.id });
    const fromSupervisorEmployee = await getDb()
      .insert(employees)
      .values({
        employeeCode: `${PREFIX}-FS`,
        employeeName: "Transfer From Supervisor",
        branchId: fromBranchId,
        isActive: true,
      })
      .returning({ id: employees.id });
    const toSupervisorEmployee = await getDb()
      .insert(employees)
      .values({
        employeeCode: `${PREFIX}-TS`,
        employeeName: "Transfer To Supervisor",
        branchId: toBranchId,
        isActive: true,
      })
      .returning({ id: employees.id });
    makerEmployeeId = makerEmployee[0]!.id;

    const passwordHash = await hashPassword("TransferTest!1a");
    const makerUser = await getDb()
      .insert(applicationUsers)
      .values({
        employeeId: makerEmployeeId,
        username: `${PREFIX}-maker`.toLowerCase(),
        passwordHash,
        mustChangePassword: false,
        isActive: true,
      })
      .returning({ id: applicationUsers.id });
    const fromSupervisorUser = await getDb()
      .insert(applicationUsers)
      .values({
        employeeId: fromSupervisorEmployee[0]!.id,
        username: `${PREFIX}-fromsup`.toLowerCase(),
        passwordHash,
        mustChangePassword: false,
        isActive: true,
      })
      .returning({ id: applicationUsers.id });
    const toSupervisorUser = await getDb()
      .insert(applicationUsers)
      .values({
        employeeId: toSupervisorEmployee[0]!.id,
        username: `${PREFIX}-tosup`.toLowerCase(),
        passwordHash,
        mustChangePassword: false,
        isActive: true,
      })
      .returning({ id: applicationUsers.id });
    makerUserId = makerUser[0]!.id;
    fromSupervisorUserId = fromSupervisorUser[0]!.id;
    toSupervisorUserId = toSupervisorUser[0]!.id;

    await getDb().insert(userRoles).values([
      { userId: makerUserId, role: "MAKER" },
      { userId: fromSupervisorUserId, role: "CHECKER" },
      { userId: toSupervisorUserId, role: "CHECKER" },
    ]);

    await getDb().insert(storeUsers).values({
      storeId: fromStoreId,
      makerApplicationUserId: makerUserId,
      supervisorApplicationUserId: fromSupervisorUserId,
      isActive: true,
    });

    const request = await getDb()
      .insert(itemRequests)
      .values({
        requestNumber: `${PREFIX}-IR`,
        requestingStoreId: fromStoreId,
        createdByApplicationUserId: makerUserId,
        status: "DRAFT",
        remarks: "Historical request must keep original store",
      })
      .returning({ id: itemRequests.id });
    requestId = request[0]!.id;

    const sessionToken = generateSessionToken();
    const makerSession = await getDb()
      .insert(authSessions)
      .values({
        userId: makerUserId,
        tokenHash: hashSessionToken(sessionToken),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      })
      .returning({ id: authSessions.id });
    createdSessionIds.push(makerSession[0]!.id);
    makerSessionToken = sessionToken;

    const adminToken = generateSessionToken();
    const adminSession = await getDb()
      .insert(authSessions)
      .values({
        userId: adminUserId,
        tokenHash: hashSessionToken(adminToken),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      })
      .returning({ id: authSessions.id });
    createdSessionIds.push(adminSession[0]!.id);
    adminSessionToken = adminToken;

    const app = createApp(env);
    server = app.listen(0);
    await new Promise<void>((resolve) =>
      server.once("listening", () => resolve()),
    );
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  after(async () => {
    try {
      await cleanup();
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

  it("rejects changing branch through the normal employee update API", async () => {
    const response = await fetch(
      `${baseUrl}/api/employees/${makerEmployeeId}`,
      {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          origin: env.FRONTEND_ORIGIN,
          cookie: `${env.SESSION_COOKIE_NAME}=${adminSessionToken}`,
        },
        body: JSON.stringify({
          employeeCode: `${PREFIX}-M`,
          employeeName: "Transfer Maker",
          branchId: toBranchId,
        }),
      },
    );
    assert.equal(response.status, 400);
  });

  it("rejects transferring to the current branch", async () => {
    await assert.rejects(
      () =>
        transferEmployee(
          makerEmployeeId,
          {
            toBranchId: fromBranchId,
            effectiveDate: todayIso(),
            reason: "Trying to transfer to the same branch should fail.",
            toStoreId: null,
            toSupervisorApplicationUserId: null,
          },
          adminUserId,
        ),
      (error: unknown) =>
        isAppError(
          error,
          400,
          "Choose a different branch. The employee already belongs to this branch.",
        ),
    );
  });

  it("rejects a store that does not belong to the new branch", async () => {
    await assert.rejects(
      () =>
        transferEmployee(
          makerEmployeeId,
          {
            toBranchId: toBranchId,
            effectiveDate: todayIso(),
            reason: "Store belongs to the old branch instead of the new one.",
            toStoreId: fromStoreId,
            toSupervisorApplicationUserId: toSupervisorUserId,
          },
          adminUserId,
        ),
      (error: unknown) =>
        isAppError(
          error,
          400,
          "The selected store must belong to the new branch.",
        ),
    );
  });

  it("rejects a supervisor who does not belong to the new branch", async () => {
    await assert.rejects(
      () =>
        transferEmployee(
          makerEmployeeId,
          {
            toBranchId: toBranchId,
            effectiveDate: todayIso(),
            reason: "Supervisor still belongs to the originating branch.",
            toStoreId: toStoreId,
            toSupervisorApplicationUserId: fromSupervisorUserId,
          },
          adminUserId,
        ),
      (error: unknown) =>
        isAppError(
          error,
          400,
          "The selected supervisor must belong to the new branch.",
        ),
    );
  });

  it("forbids non-admin callers from transferring an employee", async () => {
    const response = await fetch(
      `${baseUrl}/api/employees/${makerEmployeeId}/transfer`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: env.FRONTEND_ORIGIN,
          cookie: `${env.SESSION_COOKIE_NAME}=${makerSessionToken}`,
        },
        body: JSON.stringify({
          toBranchId,
          effectiveDate: todayIso(),
          reason: "Maker attempting an unauthorized transfer.",
        }),
      },
    );
    assert.equal(response.status, 403);
  });

  it("transfers the employee, records history, and reassigns store users", async () => {
    const employee = await transferEmployee(
      makerEmployeeId,
      {
        toBranchId,
        effectiveDate: todayIso(),
        reason: "Official relocation to the destination branch store.",
        toStoreId,
        toSupervisorApplicationUserId: toSupervisorUserId,
      },
      adminUserId,
    );

    assert.equal(employee.branchId, toBranchId);
    assert.equal(employee.branch.branchCode, `${PREFIX}-B2`);

    const fromAssignment = await getDb()
      .select()
      .from(storeUsers)
      .where(eq(storeUsers.storeId, fromStoreId))
      .limit(1);
    assert.equal(fromAssignment[0]?.isActive, false);

    const toAssignment = await getDb()
      .select()
      .from(storeUsers)
      .where(eq(storeUsers.storeId, toStoreId))
      .limit(1);
    assert.equal(toAssignment[0]?.isActive, true);
    assert.equal(toAssignment[0]?.makerApplicationUserId, makerUserId);
    assert.equal(
      toAssignment[0]?.supervisorApplicationUserId,
      toSupervisorUserId,
    );

    const history = await listEmployeeTransfers(makerEmployeeId);
    assert.equal(history.items.length, 1);
    assert.equal(history.items[0]?.fromBranch.id, fromBranchId);
    assert.equal(history.items[0]?.toBranch.id, toBranchId);
    assert.equal(history.items[0]?.effectiveDate, todayIso());
    assert.equal(history.items[0]?.fromStore?.id, fromStoreId);
    assert.equal(history.items[0]?.toStore?.id, toStoreId);
    assert.equal(history.items[0]?.fromSupervisor?.id, fromSupervisorUserId);
    assert.equal(history.items[0]?.toSupervisor?.id, toSupervisorUserId);
    assert.equal(history.items[0]?.transferredBy.id, adminUserId);

    const requestRows = await getDb()
      .select()
      .from(itemRequests)
      .where(eq(itemRequests.id, requestId))
      .limit(1);
    assert.equal(requestRows[0]?.requestingStoreId, fromStoreId);

    const storeRows = await getDb()
      .select()
      .from(stores)
      .where(eq(stores.id, fromStoreId))
      .limit(1);
    assert.equal(storeRows[0]?.branchId, fromBranchId);
  });

  it("prevents transferring an employee who already belongs to the destination branch", async () => {
    await assert.rejects(
      () =>
        transferEmployee(
          makerEmployeeId,
          {
            toBranchId,
            effectiveDate: todayIso(),
            reason: "Repeating the same official relocation should be blocked.",
            toStoreId: null,
            toSupervisorApplicationUserId: null,
          },
          adminUserId,
        ),
      (error: unknown) =>
        isAppError(
          error,
          400,
          "Choose a different branch. The employee already belongs to this branch.",
        ),
    );
  });
});
