import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { count, eq, inArray } from "drizzle-orm";
import {
  NO_ACTIVE_STORE_FOR_EMPLOYEE_BRANCH_MESSAGE,
  STORE_MUST_MATCH_EMPLOYEE_BRANCH_MESSAGE,
} from "@printing-stationery/shared";
import { loadEnv } from "../config/env.js";
import { closePool, createDb, getDb } from "../db/client.js";
import {
  applicationUsers,
  userRoles,
} from "../db/schema/auth.js";
import { branches } from "../db/schema/branches.js";
import { employees } from "../db/schema/employees.js";
import { employeeTransfers } from "../db/schema/employee-transfers.js";
import { itemRequests } from "../db/schema/item-requests.js";
import { stores } from "../db/schema/stores.js";
import { storeUsers } from "../db/schema/store-users.js";
import { AppError } from "../utils/errors.js";
import { hashPassword } from "../utils/password.js";
import {
  createApplicationUser,
  updateApplicationUser,
} from "./application-users.service.js";
import { transferEmployee } from "./employees.service.js";
import { createStoreUser } from "./store-users.service.js";
import { backfillMissingStoreAssignments } from "./store-users.assignment.js";

const PREFIX = `AUAS-${Date.now().toString(36)}`;
const PASSWORD = "StoreAssign!1a";

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

describe("application user store assignment", () => {
  let adminUserId = "";
  let branchWithStoreId = "";
  let branchWithoutStoreId = "";
  let otherBranchId = "";
  let destBranchId = "";
  let storeId = "";
  let otherStoreId = "";
  let destStoreId = "";
  let makerEmployeeId = "";
  let checkerEmployeeId = "";
  let hrEmployeeId = "";
  let noStoreEmployeeId = "";
  let otherBranchEmployeeId = "";
  let makerUserId = "";
  let checkerUserId = "";
  let requestId = "";

  async function cleanup(): Promise<void> {
    const db = getDb();
    const employeeRows = await db
      .select({ id: employees.id })
      .from(employees)
      .where(
        inArray(employees.employeeCode, [
          `${PREFIX}-M`,
          `${PREFIX}-C`,
          `${PREFIX}-H`,
          `${PREFIX}-N`,
          `${PREFIX}-O`,
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
      requestId = "";
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
        inArray(stores.storeCode, [
          `${PREFIX}-S1`,
          `${PREFIX}-S2`,
          `${PREFIX}-S3`,
        ]),
      );
    const storeIds = storeRows.map((row) => row.id);
    if (storeIds.length > 0) {
      await db.delete(storeUsers).where(inArray(storeUsers.storeId, storeIds));
      await db.delete(stores).where(inArray(stores.id, storeIds));
    }

    if (userIds.length > 0) {
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
        inArray(branches.branchCode, [
          `${PREFIX}-B1`,
          `${PREFIX}-B2`,
          `${PREFIX}-B3`,
          `${PREFIX}-B4`,
        ]),
      );
  }

  before(async () => {
    const env = loadEnv();
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
      throw new Error(
        "An ADMIN application user is required for store assignment tests",
      );
    }
    adminUserId = admin.id;

    const [branchWithStore, branchWithoutStore, otherBranch, destBranch] =
      await Promise.all([
        getDb()
          .insert(branches)
          .values({
            branchCode: `${PREFIX}-B1`,
            branchName: "Assignment Branch",
            branchType: "BRANCH",
            isActive: true,
          })
          .returning({ id: branches.id }),
        getDb()
          .insert(branches)
          .values({
            branchCode: `${PREFIX}-B2`,
            branchName: "No Store Branch",
            branchType: "BRANCH",
            isActive: true,
          })
          .returning({ id: branches.id }),
        getDb()
          .insert(branches)
          .values({
            branchCode: `${PREFIX}-B3`,
            branchName: "Other Branch",
            branchType: "BRANCH",
            isActive: true,
          })
          .returning({ id: branches.id }),
        getDb()
          .insert(branches)
          .values({
            branchCode: `${PREFIX}-B4`,
            branchName: "Destination Branch",
            branchType: "BRANCH",
            isActive: true,
          })
          .returning({ id: branches.id }),
      ]);
    branchWithStoreId = branchWithStore[0]!.id;
    branchWithoutStoreId = branchWithoutStore[0]!.id;
    otherBranchId = otherBranch[0]!.id;
    destBranchId = destBranch[0]!.id;

    const [store, otherStore, destStore] = await Promise.all([
      getDb()
        .insert(stores)
        .values({
          storeCode: `${PREFIX}-S1`,
          storeName: "Assignment Store",
          branchId: branchWithStoreId,
          isActive: true,
        })
        .returning({ id: stores.id }),
      getDb()
        .insert(stores)
        .values({
          storeCode: `${PREFIX}-S2`,
          storeName: "Other Branch Store",
          branchId: otherBranchId,
          isActive: true,
        })
        .returning({ id: stores.id }),
      getDb()
        .insert(stores)
        .values({
          storeCode: `${PREFIX}-S3`,
          storeName: "Destination Store",
          branchId: destBranchId,
          isActive: true,
        })
        .returning({ id: stores.id }),
    ]);
    storeId = store[0]!.id;
    otherStoreId = otherStore[0]!.id;
    destStoreId = destStore[0]!.id;

    const [
      makerEmployee,
      checkerEmployee,
      hrEmployee,
      noStoreEmployee,
      otherBranchEmployee,
    ] = await Promise.all([
      getDb()
        .insert(employees)
        .values({
          employeeCode: `${PREFIX}-M`,
          employeeName: "Assignment Maker",
          branchId: branchWithStoreId,
          isActive: true,
        })
        .returning({ id: employees.id }),
      getDb()
        .insert(employees)
        .values({
          employeeCode: `${PREFIX}-C`,
          employeeName: "Assignment Checker",
          branchId: branchWithStoreId,
          isActive: true,
        })
        .returning({ id: employees.id }),
      getDb()
        .insert(employees)
        .values({
          employeeCode: `${PREFIX}-H`,
          employeeName: "Assignment HR",
          branchId: destBranchId,
          isActive: true,
        })
        .returning({ id: employees.id }),
      getDb()
        .insert(employees)
        .values({
          employeeCode: `${PREFIX}-N`,
          employeeName: "No Store Employee",
          branchId: branchWithoutStoreId,
          isActive: true,
        })
        .returning({ id: employees.id }),
      getDb()
        .insert(employees)
        .values({
          employeeCode: `${PREFIX}-O`,
          employeeName: "Other Branch Employee",
          branchId: otherBranchId,
          isActive: true,
        })
        .returning({ id: employees.id }),
    ]);
    makerEmployeeId = makerEmployee[0]!.id;
    checkerEmployeeId = checkerEmployee[0]!.id;
    hrEmployeeId = hrEmployee[0]!.id;
    noStoreEmployeeId = noStoreEmployee[0]!.id;
    otherBranchEmployeeId = otherBranchEmployee[0]!.id;
  });

  after(async () => {
    try {
      await cleanup();
    } finally {
      await closePool();
    }
  });

  it("automatically assigns a MAKER when the branch has one active store", async () => {
    const user = await createApplicationUser({
      employeeId: makerEmployeeId,
      username: `${PREFIX}-maker`,
      role: "MAKER",
      temporaryPassword: PASSWORD,
      confirmTemporaryPassword: PASSWORD,
      storeId: null,
    });
    makerUserId = user.id;

    assert.equal(user.assignedStore?.id, storeId);

    const assignments = await getDb()
      .select()
      .from(storeUsers)
      .where(eq(storeUsers.storeId, storeId));
    assert.equal(assignments.length, 1);
    assert.equal(assignments[0]?.makerApplicationUserId, user.id);
    assert.equal(assignments[0]?.isActive, true);
  });

  it("automatically assigns a CHECKER to the same branch store without duplicating the row", async () => {
    const user = await createApplicationUser({
      employeeId: checkerEmployeeId,
      username: `${PREFIX}-checker`,
      role: "CHECKER",
      temporaryPassword: PASSWORD,
      confirmTemporaryPassword: PASSWORD,
      storeId: null,
    });
    checkerUserId = user.id;

    assert.equal(user.assignedStore?.id, storeId);

    const assignments = await getDb()
      .select()
      .from(storeUsers)
      .where(eq(storeUsers.storeId, storeId));
    assert.equal(assignments.length, 1);
    assert.equal(assignments[0]?.makerApplicationUserId, makerUserId);
    assert.equal(assignments[0]?.supervisorApplicationUserId, user.id);
    assert.equal(assignments[0]?.isActive, true);
  });

  it("rejects creating a MAKER when the employee’s branch has no active store", async () => {
    await assert.rejects(
      () =>
        createApplicationUser({
          employeeId: noStoreEmployeeId,
          username: `${PREFIX}-nostore`,
          role: "MAKER",
          temporaryPassword: PASSWORD,
          confirmTemporaryPassword: PASSWORD,
          storeId: null,
        }),
      (error: unknown) =>
        isAppError(error, 400, NO_ACTIVE_STORE_FOR_EMPLOYEE_BRANCH_MESSAGE),
    );

    const leftover = await getDb()
      .select({ id: applicationUsers.id })
      .from(applicationUsers)
      .where(eq(applicationUsers.username, `${PREFIX}-nostore`));
    assert.equal(leftover.length, 0);
  });

  it("rejects a store that belongs to another branch and rolls back the user", async () => {
    await assert.rejects(
      () =>
        createApplicationUser({
          employeeId: otherBranchEmployeeId,
          username: `${PREFIX}-wrongstore`,
          role: "MAKER",
          temporaryPassword: PASSWORD,
          confirmTemporaryPassword: PASSWORD,
          storeId,
        }),
      (error: unknown) =>
        isAppError(error, 400, STORE_MUST_MATCH_EMPLOYEE_BRANCH_MESSAGE),
    );

    const leftover = await getDb()
      .select({ id: applicationUsers.id })
      .from(applicationUsers)
      .where(
        eq(applicationUsers.username, `${PREFIX}-wrongstore`),
      );
    assert.equal(leftover.length, 0);
  });

  it("backfills a MAKER created before automatic store assignment", async () => {
    const inserted = await getDb()
      .insert(applicationUsers)
      .values({
        employeeId: otherBranchEmployeeId,
        username: `${PREFIX}-backfill`,
        passwordHash: await hashPassword(PASSWORD),
        mustChangePassword: true,
        isActive: true,
      })
      .returning({ id: applicationUsers.id });
    const userId = inserted[0]!.id;
    await getDb().insert(userRoles).values({
      userId,
      role: "MAKER",
    });

    const before = await getDb()
      .select()
      .from(storeUsers)
      .where(eq(storeUsers.makerApplicationUserId, userId));
    assert.equal(before.length, 0);

    const result = await backfillMissingStoreAssignments();
    assert.ok(result.assigned >= 1);

    const after = await getDb()
      .select()
      .from(storeUsers)
      .where(eq(storeUsers.makerApplicationUserId, userId));
    assert.equal(after.length, 1);
    assert.equal(after[0]?.storeId, otherStoreId);
    assert.equal(after[0]?.isActive, true);
  });

  it("prevents a duplicate store user configuration for the same store", async () => {
    await assert.rejects(
      () =>
        createStoreUser({
          storeId,
          makerApplicationUserId: makerUserId,
          supervisorApplicationUserId: checkerUserId,
        }),
      (error: unknown) =>
        isAppError(
          error,
          409,
          "This store already has a user configuration.",
        ),
    );

    const assignmentCount = await getDb()
      .select({ value: count() })
      .from(storeUsers)
      .where(eq(storeUsers.storeId, storeId));
    assert.equal(assignmentCount[0]?.value, 1);
  });

  it("does not create a second assignment row when the application user is edited", async () => {
    const updated = await updateApplicationUser(
      makerUserId,
      {
        username: `${PREFIX}-maker`,
        role: "MAKER",
        storeId: null,
      },
      adminUserId,
    );

    assert.equal(updated.assignedStore?.id, storeId);

    const assignments = await getDb()
      .select()
      .from(storeUsers)
      .where(eq(storeUsers.storeId, storeId));
    assert.equal(assignments.length, 1);
    assert.equal(assignments[0]?.makerApplicationUserId, makerUserId);
  });

  it("leaves historical item requests unchanged when the assignment is updated", async () => {
    const request = await getDb()
      .insert(itemRequests)
      .values({
        requestNumber: `${PREFIX}-IR`,
        requestingStoreId: storeId,
        createdByApplicationUserId: makerUserId,
        status: "DRAFT",
        remarks: "Historical request must keep original store",
      })
      .returning({
        id: itemRequests.id,
        requestingStoreId: itemRequests.requestingStoreId,
        status: itemRequests.status,
      });
    requestId = request[0]!.id;

    await updateApplicationUser(
      makerUserId,
      {
        username: `${PREFIX}-maker`,
        role: "MAKER",
        storeId: null,
      },
      adminUserId,
    );

    const requestRows = await getDb()
      .select({
        requestingStoreId: itemRequests.requestingStoreId,
        status: itemRequests.status,
        createdByApplicationUserId: itemRequests.createdByApplicationUserId,
      })
      .from(itemRequests)
      .where(eq(itemRequests.id, requestId))
      .limit(1);

    assert.equal(requestRows[0]?.requestingStoreId, storeId);
    assert.equal(requestRows[0]?.status, "DRAFT");
    assert.equal(requestRows[0]?.createdByApplicationUserId, makerUserId);
  });

  it("allows transferring a store user to a branch with no store and does not assign one", async () => {
    await transferEmployee(
      checkerEmployeeId,
      {
        toBranchId: branchWithoutStoreId,
        effectiveDate: todayIso(),
        reason: "Moved to a branch that does not yet have a store.",
        toStoreId: null,
        toSupervisorApplicationUserId: null,
      },
      adminUserId,
    );

    const assignmentRows = await getDb()
      .select()
      .from(storeUsers)
      .where(eq(storeUsers.supervisorApplicationUserId, checkerUserId));
    for (const row of assignmentRows) {
      assert.equal(row.isActive && row.storeId === storeId, false);
    }
  });

  it("deactivates the assignment when the role changes to a non-store role", async () => {
    const hrUser = await createApplicationUser({
      employeeId: hrEmployeeId,
      username: `${PREFIX}-hr`,
      role: "MAKER",
      temporaryPassword: PASSWORD,
      confirmTemporaryPassword: PASSWORD,
      storeId: null,
    });

    const updated = await updateApplicationUser(
      hrUser.id,
      {
        username: `${PREFIX}-hr`,
        role: "HR",
        storeId: null,
      },
      adminUserId,
    );
    assert.equal(updated.assignedStore, null);
    assert.equal(updated.role, "HR");

    const assignmentRows = await getDb()
      .select()
      .from(storeUsers)
      .where(eq(storeUsers.makerApplicationUserId, hrUser.id));
    for (const row of assignmentRows) {
      assert.equal(row.isActive, false);
    }
  });

  it("deactivates the previous assignment and assigns the new branch store on transfer", async () => {
    await transferEmployee(
      makerEmployeeId,
      {
        toBranchId: destBranchId,
        effectiveDate: todayIso(),
        reason: "Official relocation to the destination branch store.",
        toStoreId: null,
        toSupervisorApplicationUserId: null,
      },
      adminUserId,
    );

    const oldAssignments = await getDb()
      .select()
      .from(storeUsers)
      .where(eq(storeUsers.storeId, storeId));
    assert.ok(
      !oldAssignments[0]?.isActive ||
        oldAssignments[0]?.makerApplicationUserId !== makerUserId,
    );

    const newAssignments = await getDb()
      .select()
      .from(storeUsers)
      .where(eq(storeUsers.storeId, destStoreId));
    assert.equal(newAssignments[0]?.isActive, true);
    assert.equal(newAssignments[0]?.makerApplicationUserId, makerUserId);

    const requestRows = await getDb()
      .select({ requestingStoreId: itemRequests.requestingStoreId })
      .from(itemRequests)
      .where(eq(itemRequests.id, requestId))
      .limit(1);
    assert.equal(requestRows[0]?.requestingStoreId, storeId);
  });
});
