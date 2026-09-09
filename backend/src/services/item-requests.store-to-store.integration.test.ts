import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { eq, inArray, like } from "drizzle-orm";
import type { AuthenticatedUser } from "@printing-stationery/shared";
import { loadEnv } from "../config/env.js";
import { closePool, createDb, getDb } from "../db/client.js";
import {
  applicationUsers,
  authSessions,
  userRoles,
} from "../db/schema/auth.js";
import { branches } from "../db/schema/branches.js";
import { employees } from "../db/schema/employees.js";
import { itemIssueLines, itemIssues } from "../db/schema/item-issues.js";
import { itemRequestActions, itemRequestLines, itemRequests } from "../db/schema/item-requests.js";
import { items } from "../db/schema/items.js";
import { stores } from "../db/schema/stores.js";
import { storeUsers } from "../db/schema/store-users.js";
import {
  createItemIssueFromRequest,
  getItemIssueEligibility,
} from "./item-issues.service.js";
import {
  createItemRequest,
  getItemRequestById,
  getItemRequestContext,
  listEligibleItemRequestSourceStores,
} from "./item-requests.service.js";
import { listEmployees } from "./employees.service.js";
import { getOperationalAvailableQuantities } from "./opening-stocks.service.js";
import { AppError } from "../utils/errors.js";
import { hashPassword } from "../utils/password.js";

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
  let sourceChecker: AuthenticatedUser;
  let unassignedMaker: AuthenticatedUser;
  let sourceStoreId = "";
  let destinationStoreId = "";
  let inactiveStoreId = "";
  let noTransferStoreId = "";
  let beyondFifthStoreId = "";
  let itemId = "";
  let otherEmployeeId = "";
  let inactiveEmployeeId = "";
  let defaultRequestedById = "";
  let createdRequestIds: string[] = [];
  let createdBranchIds: string[] = [];
  let createdStoreIds: string[] = [];
  let createdUserIds: string[] = [];
  let createdEmployeeIds: string[] = [];

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

  async function cleanup(): Promise<void> {
    const db = getDb();
    const requestIds = [...createdRequestIds];
    if (requestIds.length > 0) {
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
      await db
        .delete(itemRequestActions)
        .where(inArray(itemRequestActions.itemRequestId, requestIds));
      await db
        .delete(itemRequestLines)
        .where(inArray(itemRequestLines.itemRequestId, requestIds));
      await db.delete(itemRequests).where(inArray(itemRequests.id, requestIds));
    }

    const leftoverStores = await db
      .select({ id: stores.id })
      .from(stores)
      .where(like(stores.storeCode, `${PREFIX}%`));
    const storeIds = [
      ...new Set([...createdStoreIds, ...leftoverStores.map((row) => row.id)]),
    ];
    if (storeIds.length > 0) {
      await db.delete(storeUsers).where(inArray(storeUsers.storeId, storeIds));
      await db.delete(stores).where(inArray(stores.id, storeIds));
    }

    const leftoverUsers = await db
      .select({ id: applicationUsers.id })
      .from(applicationUsers)
      .where(like(applicationUsers.username, `${PREFIX}%`.toLowerCase()));
    const userIds = [
      ...new Set([...createdUserIds, ...leftoverUsers.map((row) => row.id)]),
    ];
    for (const userId of userIds) {
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

    defaultRequestedById =
      admin.employee?.id ?? destinationMaker.employee!.id;
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
    assert.equal(context.canSelectDestinationStore, true);
    assert.equal(context.canSelectRequestedByEmployee, true);
    assert.equal(context.destinationStore, null);
    if (admin.employee) {
      assert.equal(context.requestedByEmployee?.id, admin.employee.id);
      assert.equal(context.requestedByEmployee?.department, null);
    }

    const created = await trackRequest(
      await createItemRequest(admin, {
        sourceStoreId,
        destinationStoreId,
        requestedByEmployeeId: defaultRequestedById,
        remarks: null,
        lines: [{ itemId, requestedQuantity: "3" }],
      }),
    );

    assert.equal(created.sourceStoreId, sourceStoreId);
    assert.equal(created.destinationStoreId, destinationStoreId);
    assert.equal(created.corporateStoreId, sourceStoreId);
    assert.equal(created.requestingStoreId, destinationStoreId);
    assert.equal(created.sourceStore?.id, sourceStoreId);
    assert.equal(created.destinationStore.id, destinationStoreId);
    assert.equal(created.status, "DRAFT");
    assert.equal(created.requestedBy?.id, defaultRequestedById);
    assert.equal(created.createdBy.id, admin.id);
    assert.equal(created.requestedBy?.department, null);
  });

  it("lets an admin create a request for another active employee", async () => {
    const created = await trackRequest(
      await createItemRequest(admin, {
        sourceStoreId,
        destinationStoreId,
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

  it("lets an admin search a supplying store beyond the first five results and submit it", async () => {
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
      !firstPage.items.some((store) =>
        /inactive|notransfer/i.test(store.storeName),
      ),
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
    assert.ok(
      !hidden.items.some((store) =>
        store.storeName.includes("NoTransfer Needle"),
      ),
    );

    const created = await trackRequest(
      await createItemRequest(admin, {
        sourceStoreId: beyondFifthStoreId,
        destinationStoreId,
        requestedByEmployeeId: defaultRequestedById,
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
          sourceStoreId,
          destinationStoreId,
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
          sourceStoreId,
          destinationStoreId,
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

  it("lets a normal maker request only for their assigned receiving store", async () => {
    const context = await getItemRequestContext(destinationMaker);
    assert.equal(context.canCreate, true);
    assert.equal(context.canSelectDestinationStore, false);
    assert.equal(context.canSelectRequestedByEmployee, false);
    assert.equal(context.destinationStore?.id, destinationStoreId);
    assert.equal(context.requestedByEmployee?.id, destinationMaker.employee!.id);

    const created = await trackRequest(
      await createItemRequest(destinationMaker, {
        sourceStoreId,
        destinationStoreId,
        requestedByEmployeeId: destinationMaker.employee!.id,
        remarks: null,
        lines: [{ itemId, requestedQuantity: "2" }],
      }),
    );
    assert.equal(created.destinationStoreId, destinationStoreId);
    assert.equal(created.sourceStoreId, sourceStoreId);
    assert.equal(created.requestedBy?.id, destinationMaker.employee!.id);
    assert.equal(created.createdBy.id, destinationMaker.id);
  });

  it("rejects unauthorized destination store selection from a normal user", async () => {
    await assert.rejects(
      () =>
        createItemRequest(destinationMaker, {
          sourceStoreId,
          destinationStoreId: sourceStoreId,
          requestedByEmployeeId: destinationMaker.employee!.id,
          remarks: null,
          lines: [{ itemId, requestedQuantity: "1" }],
        }),
      (error: unknown) =>
        isAppError(
          error,
          403,
          "You can create a request only for your assigned store.",
        ),
    );
  });

  it("rejects a maker without an active store assignment", async () => {
    const context = await getItemRequestContext(unassignedMaker);
    assert.equal(context.canCreate, false);
    await assert.rejects(
      () =>
        createItemRequest(unassignedMaker, {
          sourceStoreId,
          destinationStoreId,
          requestedByEmployeeId: unassignedMaker.employee!.id,
          remarks: null,
          lines: [{ itemId, requestedQuantity: "1" }],
        }),
      (error: unknown) =>
        isAppError(
          error,
          403,
          "You can create a request only when you are an active maker of a store.",
        ),
    );
  });

  it("rejects same-store requests", async () => {
    await assert.rejects(
      () =>
        createItemRequest(admin, {
          sourceStoreId,
          destinationStoreId: sourceStoreId,
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
          destinationStoreId,
          requestedByEmployeeId: defaultRequestedById,
          remarks: null,
          lines: [{ itemId, requestedQuantity: "1" }],
        }),
      (error: unknown) =>
        isAppError(error, 400, /inactive/i),
    );
  });

  it("rejects a supplying store that is not allowed to transfer", async () => {
    await assert.rejects(
      () =>
        createItemRequest(admin, {
          sourceStoreId: noTransferStoreId,
          destinationStoreId,
          requestedByEmployeeId: defaultRequestedById,
          remarks: null,
          lines: [{ itemId, requestedQuantity: "1" }],
        }),
      (error: unknown) =>
        isAppError(
          error,
          400,
          "The supplying store is not allowed to transfer or issue stock.",
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
        sourceStoreId,
        destinationStoreId,
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
    const requested = await trackRequest(
      await createItemRequest(admin, {
        sourceStoreId,
        destinationStoreId,
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
        corporateMakerApplicationUserId: sourceChecker.id,
        corporateCheckerApplicationUserId: sourceChecker.id,
        branchCheckerApplicationUserId: destinationMaker.id,
      })
      .where(eq(itemRequests.id, requested.id));

    const detail = await getItemRequestById(requested.id, admin);
    const requestLineId = detail.lines[0]?.id;
    assert.ok(requestLineId);

    const firstIssue = await createItemIssueFromRequest(
      requested.id,
      sourceChecker,
      {
        remarks: null,
        lines: [{ requestLineId, issueQuantity: "4" }],
      },
    );
    assert.equal(firstIssue.fromStore.id, sourceStoreId);
    assert.equal(firstIssue.toStore.id, destinationStoreId);

    await getDb()
      .update(itemIssues)
      .set({
        status: "SUBMITTED",
        submittedByApplicationUserId: sourceChecker.id,
        submittedAt: new Date(),
      })
      .where(eq(itemIssues.id, firstIssue.id));

    const afterPartial = await getItemRequestById(requested.id, admin);
    assert.equal(afterPartial.lines[0]?.issuedQuantity, "4");
    assert.equal(afterPartial.lines[0]?.remainingQuantity, "6");

    await assert.rejects(
      () =>
        createItemIssueFromRequest(requested.id, sourceChecker, {
          remarks: null,
          lines: [{ requestLineId, issueQuantity: "7" }],
        }),
      (error: unknown) =>
        isAppError(error, 409, /exceeds the remaining requested quantity/i),
    );

    const secondIssue = await createItemIssueFromRequest(
      requested.id,
      sourceChecker,
      {
        remarks: null,
        lines: [{ requestLineId, issueQuantity: "6" }],
      },
    );
    await getDb()
      .update(itemIssues)
      .set({
        status: "SUBMITTED",
        submittedByApplicationUserId: sourceChecker.id,
        submittedAt: new Date(),
      })
      .where(eq(itemIssues.id, secondIssue.id));

    const eligibility = await getItemIssueEligibility(requested.id, sourceChecker);
    assert.equal(eligibility.canCreate, false);

    await assert.rejects(
      () =>
        createItemIssueFromRequest(requested.id, sourceChecker, {
          remarks: null,
          lines: [{ requestLineId, issueQuantity: "1" }],
        }),
      (error: unknown) => isAppError(error, 409),
    );
  });
});
