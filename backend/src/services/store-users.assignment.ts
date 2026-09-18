import { and, asc, eq, inArray, ne, or, sql, type SQL } from "drizzle-orm";
import type {
  AppRole,
  ApplicationUserAssignedStore,
  AuthenticatedUser,
  StoreManagingRole,
} from "@printing-stationery/shared";
import {
  isStoreManagingRole,
  NO_ACTIVE_STORE_FOR_EMPLOYEE_BRANCH_MESSAGE,
  resolveStoreAssignment,
  STORE_MANAGING_ROLES,
  userHasRole,
} from "@printing-stationery/shared";
import { getDb, type DbExecutor } from "../db/client.js";
import { applicationUsers, userRoles } from "../db/schema/auth.js";
import { branches } from "../db/schema/branches.js";
import { employees } from "../db/schema/employees.js";
import { stores } from "../db/schema/stores.js";
import { storeUsers, type StoreUserRow } from "../db/schema/store-users.js";
import { AppError } from "../utils/errors.js";
import { mapStoreUserDatabaseError } from "../utils/db-errors.js";
import {
  assertAssignablePerson,
  assertMakerAvailable,
  assertUsableStore,
} from "./store-users.service.js";

function useDb(db?: DbExecutor): DbExecutor {
  return db ?? getDb();
}

export type AssignedStoreSummary = ApplicationUserAssignedStore;

export type SyncStoreAssignmentMode = "strict" | "transfer";

export type SyncStoreAssignmentResult = {
  assignedStore: AssignedStoreSummary | null;
  warning: string | null;
};

function toAssignedStore(row: {
  id: string;
  storeCode: string;
  storeName: string;
  isActive: boolean;
}): AssignedStoreSummary {
  return {
    id: row.id,
    storeCode: row.storeCode,
    storeName: row.storeName,
    isActive: row.isActive,
  };
}

export async function listActiveStoresForBranch(
  branchId: string,
  db?: DbExecutor,
): Promise<AssignedStoreSummary[]> {
  const rows = await useDb(db)
    .select({
      id: stores.id,
      storeCode: stores.storeCode,
      storeName: stores.storeName,
      isActive: stores.isActive,
    })
    .from(stores)
    .innerJoin(branches, eq(stores.branchId, branches.id))
    .where(
      and(
        eq(stores.branchId, branchId),
        eq(stores.isActive, true),
        eq(branches.isActive, true),
      ),
    )
    .orderBy(asc(stores.storeName), asc(stores.storeCode), asc(stores.id));

  return rows.map(toAssignedStore);
}

export async function backfillMissingStoreAssignments(
  db?: DbExecutor,
): Promise<{ assigned: number; skipped: number }> {
  const executor = useDb(db);
  const rows = await executor
    .select({
      userId: applicationUsers.id,
      role: userRoles.role,
      branchId: employees.branchId,
    })
    .from(applicationUsers)
    .innerJoin(userRoles, eq(userRoles.userId, applicationUsers.id))
    .innerJoin(employees, eq(applicationUsers.employeeId, employees.id))
    .where(
      and(
        eq(applicationUsers.isActive, true),
        eq(employees.isActive, true),
        inArray(userRoles.role, [...STORE_MANAGING_ROLES]),
      ),
    )
    .orderBy(asc(applicationUsers.createdAt), asc(applicationUsers.id));

  const existingAssignments = await getAssignedStoresByUserIds(
    rows.map((row) => ({ id: row.userId, branchId: row.branchId })),
    executor,
  );

  let assigned = 0;
  let skipped = 0;

  for (const row of rows) {
    if (!isStoreManagingRole(row.role) || existingAssignments.get(row.userId)) {
      skipped += 1;
      continue;
    }

    const activeStores = await listActiveStoresForBranch(row.branchId, executor);
    if (activeStores.length !== 1) {
      skipped += 1;
      continue;
    }

    try {
      const result = await syncApplicationUserStoreAssignment({
        applicationUserId: row.userId,
        role: row.role,
        selectedStoreId: activeStores[0]!.id,
        db: executor,
      });
      if (result.assignedStore) {
        assigned += 1;
      } else {
        skipped += 1;
      }
    } catch (error) {
      if (error instanceof AppError && error.statusCode < 500) {
        skipped += 1;
        continue;
      }
      throw error;
    }
  }

  return { assigned, skipped };
}

export async function getAssignedStoresByUserIds(
  users: Array<{ id: string; branchId: string }>,
  db?: DbExecutor,
): Promise<Map<string, AssignedStoreSummary | null>> {
  const result = new Map<string, AssignedStoreSummary | null>();
  for (const user of users) {
    result.set(user.id, null);
  }

  if (users.length === 0) {
    return result;
  }

  const userIds = users.map((user) => user.id);
  const branchByUserId = new Map(
    users.map((user) => [user.id, user.branchId] as const),
  );

  const rows = await useDb(db)
    .select({
      assignment: storeUsers,
      store: stores,
    })
    .from(storeUsers)
    .innerJoin(stores, eq(storeUsers.storeId, stores.id))
    .where(
      and(
        eq(storeUsers.isActive, true),
        eq(stores.isActive, true),
        or(
          inArray(storeUsers.makerApplicationUserId, userIds),
          inArray(storeUsers.supervisorApplicationUserId, userIds),
        ),
      ),
    )
    .orderBy(asc(stores.storeName), asc(stores.storeCode), asc(stores.id));

  for (const row of rows) {
    const candidateUserIds = [
      row.assignment.makerApplicationUserId,
      row.assignment.supervisorApplicationUserId,
    ].filter((value): value is string => Boolean(value));

    for (const userId of candidateUserIds) {
      if (!branchByUserId.has(userId)) {
        continue;
      }
      if (branchByUserId.get(userId) !== row.store.branchId) {
        continue;
      }
      if (result.get(userId)) {
        continue;
      }
      result.set(userId, toAssignedStore(row.store));
    }
  }

  return result;
}

export async function removeUserFromStoreAssignments(params: {
  applicationUserId: string;
  exceptStoreId?: string;
  db?: DbExecutor;
}): Promise<void> {
  const db = useDb(params.db);
  const conditions: SQL[] = [
    eq(storeUsers.isActive, true),
    or(
      eq(storeUsers.makerApplicationUserId, params.applicationUserId),
      eq(storeUsers.supervisorApplicationUserId, params.applicationUserId),
    )!,
  ];

  if (params.exceptStoreId) {
    conditions.push(ne(storeUsers.storeId, params.exceptStoreId));
  }

  const rows = await db
    .select()
    .from(storeUsers)
    .where(and(...conditions));

  for (const row of rows) {
    await detachUserFromAssignment(db, row, params.applicationUserId);
  }
}

async function detachUserFromAssignment(
  db: DbExecutor,
  row: StoreUserRow,
  applicationUserId: string,
): Promise<void> {
  const remainingMaker =
    row.makerApplicationUserId === applicationUserId
      ? null
      : row.makerApplicationUserId;
  const remainingSupervisor =
    row.supervisorApplicationUserId === applicationUserId
      ? null
      : row.supervisorApplicationUserId;

  if (remainingMaker || remainingSupervisor) {
    await db
      .update(storeUsers)
      .set({
        makerApplicationUserId: remainingMaker,
        supervisorApplicationUserId: remainingSupervisor,
        updatedAt: sql`now()`,
      })
      .where(eq(storeUsers.id, row.id));
    return;
  }

  await db
    .update(storeUsers)
    .set({
      isActive: false,
      updatedAt: sql`now()`,
    })
    .where(eq(storeUsers.id, row.id));
}

async function counterpartStillValid(params: {
  applicationUserId: string | null;
  requiredRole: StoreManagingRole;
  storeBranchId: string;
  fieldLabel: "maker" | "supervisor";
  db: DbExecutor;
}): Promise<boolean> {
  if (!params.applicationUserId) {
    return false;
  }

  try {
    await assertAssignablePerson({
      applicationUserId: params.applicationUserId,
      requiredRole: params.requiredRole,
      storeBranchId: params.storeBranchId,
      fieldLabel: params.fieldLabel,
      db: params.db,
    });
    return true;
  } catch (error) {
    if (error instanceof AppError && error.statusCode === 400) {
      return false;
    }
    throw error;
  }
}

async function upsertStoreAssignmentSlot(params: {
  applicationUserId: string;
  role: StoreManagingRole;
  storeId: string;
  storeBranchId: string;
  db: DbExecutor;
}): Promise<AssignedStoreSummary> {
  const existingRows = await params.db
    .select()
    .from(storeUsers)
    .where(eq(storeUsers.storeId, params.storeId))
    .limit(1);
  const existing = existingRows[0];

  if (params.role === "MAKER") {
    await assertMakerAvailable({
      makerApplicationUserId: params.applicationUserId,
      excludeAssignmentId: existing?.id,
      db: params.db,
    });
  }

  if (
    existing?.isActive &&
    params.role === "MAKER" &&
    existing.makerApplicationUserId &&
    existing.makerApplicationUserId !== params.applicationUserId
  ) {
    throw new AppError(
      "This store already has an active maker assignment.",
      409,
    );
  }

  if (
    existing?.isActive &&
    params.role === "CHECKER" &&
    existing.supervisorApplicationUserId &&
    existing.supervisorApplicationUserId !== params.applicationUserId
  ) {
    throw new AppError(
      "This store already has an active supervisor assignment.",
      409,
    );
  }

  let nextMaker =
    params.role === "MAKER"
      ? params.applicationUserId
      : existing?.makerApplicationUserId &&
          existing.makerApplicationUserId !== params.applicationUserId
        ? existing.makerApplicationUserId
        : null;
  let nextSupervisor =
    params.role === "CHECKER"
      ? params.applicationUserId
      : existing?.supervisorApplicationUserId &&
          existing.supervisorApplicationUserId !== params.applicationUserId
        ? existing.supervisorApplicationUserId
        : null;

  if (nextMaker && nextMaker !== params.applicationUserId) {
    const makerValid = await counterpartStillValid({
      applicationUserId: nextMaker,
      requiredRole: "MAKER",
      storeBranchId: params.storeBranchId,
      fieldLabel: "maker",
      db: params.db,
    });
    if (!makerValid) {
      nextMaker = null;
    }
  }

  if (nextSupervisor && nextSupervisor !== params.applicationUserId) {
    const supervisorValid = await counterpartStillValid({
      applicationUserId: nextSupervisor,
      requiredRole: "CHECKER",
      storeBranchId: params.storeBranchId,
      fieldLabel: "supervisor",
      db: params.db,
    });
    if (!supervisorValid) {
      nextSupervisor = null;
    }
  }

  if (nextMaker && nextSupervisor && nextMaker === nextSupervisor) {
    if (params.role === "MAKER") {
      nextSupervisor = null;
    } else {
      nextMaker = null;
    }
  }

  try {
    if (existing) {
      await params.db
        .update(storeUsers)
        .set({
          makerApplicationUserId: nextMaker,
          supervisorApplicationUserId: nextSupervisor,
          isActive: true,
          updatedAt: sql`now()`,
        })
        .where(eq(storeUsers.id, existing.id));
    } else {
      await params.db.insert(storeUsers).values({
        storeId: params.storeId,
        makerApplicationUserId: nextMaker,
        supervisorApplicationUserId: nextSupervisor,
        isActive: true,
      });
    }
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    mapStoreUserDatabaseError(error);
  }

  const storeRows = await params.db
    .select({
      id: stores.id,
      storeCode: stores.storeCode,
      storeName: stores.storeName,
      isActive: stores.isActive,
    })
    .from(stores)
    .where(eq(stores.id, params.storeId))
    .limit(1);

  const store = storeRows[0];
  if (!store) {
    throw new AppError("Selected store was not found.", 400);
  }

  return toAssignedStore(store);
}

export async function setStoreAssignmentSupervisor(params: {
  storeId: string;
  supervisorApplicationUserId: string;
  makerApplicationUserId: string;
  db?: DbExecutor;
}): Promise<void> {
  if (params.supervisorApplicationUserId === params.makerApplicationUserId) {
    throw new AppError(
      "The new supervisor must be different from the transferred employee.",
      400,
    );
  }

  const db = useDb(params.db);
  const { store } = await assertUsableStore(params.storeId, { db });
  await assertAssignablePerson({
    applicationUserId: params.supervisorApplicationUserId,
    requiredRole: "CHECKER",
    storeBranchId: store.branchId,
    fieldLabel: "supervisor",
    db,
  });

  const existingRows = await db
    .select()
    .from(storeUsers)
    .where(eq(storeUsers.storeId, params.storeId))
    .limit(1);
  const existing = existingRows[0];
  if (!existing) {
    throw new AppError("Store user configuration not found", 404);
  }

  try {
    await db
      .update(storeUsers)
      .set({
        supervisorApplicationUserId: params.supervisorApplicationUserId,
        updatedAt: sql`now()`,
      })
      .where(eq(storeUsers.id, existing.id));
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    mapStoreUserDatabaseError(error);
  }
}

export async function syncApplicationUserStoreAssignment(params: {
  applicationUserId: string;
  role: AppRole;
  selectedStoreId?: string | null;
  mode?: SyncStoreAssignmentMode;
  db?: DbExecutor;
}): Promise<SyncStoreAssignmentResult> {
  const db = useDb(params.db);
  const mode = params.mode ?? "strict";

  if (!isStoreManagingRole(params.role)) {
    await removeUserFromStoreAssignments({
      applicationUserId: params.applicationUserId,
      db,
    });
    return { assignedStore: null, warning: null };
  }

  const userRows = await db
    .select({
      user: applicationUsers,
      employee: employees,
    })
    .from(applicationUsers)
    .innerJoin(employees, eq(applicationUsers.employeeId, employees.id))
    .where(eq(applicationUsers.id, params.applicationUserId))
    .limit(1);
  const userRow = userRows[0];
  if (!userRow) {
    throw new AppError("Selected application user was not found.", 400);
  }

  const activeStores = await listActiveStoresForBranch(
    userRow.employee.branchId,
    db,
  );
  const resolution = resolveStoreAssignment({
    activeStores,
    selectedStoreId: params.selectedStoreId,
  });

  if (resolution.status === "NONE") {
    await removeUserFromStoreAssignments({
      applicationUserId: params.applicationUserId,
      db,
    });
    if (mode === "transfer") {
      return {
        assignedStore: null,
        warning: NO_ACTIVE_STORE_FOR_EMPLOYEE_BRANCH_MESSAGE,
      };
    }
    throw new AppError(NO_ACTIVE_STORE_FOR_EMPLOYEE_BRANCH_MESSAGE, 400);
  }

  if (resolution.status === "SELECTION_REQUIRED") {
    throw new AppError(resolution.message, 400);
  }

  if (resolution.status === "INVALID") {
    throw new AppError(resolution.message, 400);
  }

  const storeId = resolution.storeId;
  const { store } = await assertUsableStore(storeId, { db });
  await assertAssignablePerson({
    applicationUserId: params.applicationUserId,
    requiredRole: params.role,
    storeBranchId: store.branchId,
    fieldLabel: params.role === "MAKER" ? "maker" : "supervisor",
    db,
  });

  await removeUserFromStoreAssignments({
    applicationUserId: params.applicationUserId,
    exceptStoreId: storeId,
    db,
  });

  const assignedStore = await upsertStoreAssignmentSlot({
    applicationUserId: params.applicationUserId,
    role: params.role,
    storeId,
    storeBranchId: store.branchId,
    db,
  });

  return { assignedStore, warning: null };
}

export type VisibleInventoryStore = {
  id: string;
  storeCode: string;
  storeName: string;
  isActive: boolean;
  branchId: string;
  branchCode: string;
  branchName: string;
};

export type InventoryStoreAccess = {
  unrestricted: boolean;
  stores: VisibleInventoryStore[];
};

function toVisibleInventoryStore(row: {
  store: {
    id: string;
    storeCode: string;
    storeName: string;
    isActive: boolean;
    branchId: string;
  };
  branch: {
    branchCode: string;
    branchName: string;
  };
}): VisibleInventoryStore {
  return {
    id: row.store.id,
    storeCode: row.store.storeCode,
    storeName: row.store.storeName,
    isActive: row.store.isActive,
    branchId: row.store.branchId,
    branchCode: row.branch.branchCode,
    branchName: row.branch.branchName,
  };
}

export async function listVisibleInventoryStores(
  actor: AuthenticatedUser,
  db?: DbExecutor,
): Promise<InventoryStoreAccess> {
  const executor = useDb(db);
  if (userHasRole(actor.roles, "ADMIN")) {
    const rows = await executor
      .select({
        store: stores,
        branch: branches,
      })
      .from(stores)
      .innerJoin(branches, eq(stores.branchId, branches.id))
      .orderBy(asc(stores.storeName), asc(stores.storeCode), asc(stores.id));
    return {
      unrestricted: true,
      stores: rows.map(toVisibleInventoryStore),
    };
  }

  const rows = await executor
    .select({
      store: stores,
      branch: branches,
    })
    .from(storeUsers)
    .innerJoin(stores, eq(storeUsers.storeId, stores.id))
    .innerJoin(branches, eq(stores.branchId, branches.id))
    .where(
      and(
        eq(storeUsers.isActive, true),
        eq(stores.isActive, true),
        eq(branches.isActive, true),
        or(
          eq(storeUsers.makerApplicationUserId, actor.id),
          eq(storeUsers.supervisorApplicationUserId, actor.id),
        ),
      ),
    )
    .orderBy(asc(stores.storeName), asc(stores.storeCode), asc(stores.id));

  const unique = new Map<string, VisibleInventoryStore>();
  for (const row of rows) {
    if (!unique.has(row.store.id)) {
      unique.set(row.store.id, toVisibleInventoryStore(row));
    }
  }

  return {
    unrestricted: false,
    stores: [...unique.values()],
  };
}
