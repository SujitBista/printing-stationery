import {
  and,
  asc,
  count,
  eq,
  inArray,
  isNotNull,
  isNull,
  ne,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type {
  AppRole,
  CreateStoreUserInput,
  EligibleStoreApplicationUser,
  EligibleStoreApplicationUserListQuery,
  EligibleStoreUserStoreListQuery,
  PaginatedEligibleStoreApplicationUserResponse,
  PaginatedEligibleStoreUserStoreResponse,
  PaginatedStoreUserResponse,
  StoreUser,
  StoreUserAssignableRole,
  StoreUserListQuery,
  StoreUserPersonSummary,
  StoreUserStoreSummary,
  UpdateStoreUserInput,
  UpdateStoreUserStatusInput,
} from "@printing-stationery/shared";
import { getDb } from "../db/client.js";
import {
  applicationUsers,
  userRoles,
  type ApplicationUserRow,
} from "../db/schema/auth.js";
import { branches, type BranchRow } from "../db/schema/branches.js";
import { employees, type EmployeeRow } from "../db/schema/employees.js";
import { stores, type StoreRow } from "../db/schema/stores.js";
import {
  storeUsers,
  type StoreUserRow,
} from "../db/schema/store-users.js";
import { AppError } from "../utils/errors.js";
import { mapStoreUserDatabaseError } from "../utils/db-errors.js";

const FORBIDDEN_STORE_USER_ROLES: AppRole[] = ["ADMIN", "HR"];

const makerUsers = alias(applicationUsers, "maker_users");
const supervisorUsers = alias(applicationUsers, "supervisor_users");
const makerEmployees = alias(employees, "maker_employees");
const supervisorEmployees = alias(employees, "supervisor_employees");
const makerRoles = alias(userRoles, "maker_roles");
const supervisorRoles = alias(userRoles, "supervisor_roles");
const makerBranches = alias(branches, "maker_branches");
const supervisorBranches = alias(branches, "supervisor_branches");
const forbiddenRoles = alias(userRoles, "forbidden_store_user_roles");
const activeMakerAssignments = alias(storeUsers, "active_maker_assignments");

type StoreUserJoinedRow = {
  assignment: StoreUserRow;
  store: StoreRow;
  storeBranch: BranchRow;
  maker: ApplicationUserRow;
  makerRole: AppRole;
  makerEmployee: EmployeeRow;
  makerBranch: BranchRow;
  supervisor: ApplicationUserRow;
  supervisorRole: AppRole;
  supervisorEmployee: EmployeeRow;
  supervisorBranch: BranchRow;
};

type EligibleJoinedRow = {
  applicationUser: ApplicationUserRow;
  role: StoreUserAssignableRole;
  employee: EmployeeRow;
  branch: BranchRow;
};

function toPersonSummary(params: {
  user: ApplicationUserRow;
  role: AppRole;
  employee: EmployeeRow;
  branch: BranchRow;
}): StoreUserPersonSummary {
  return {
    id: params.user.id,
    username: params.user.username,
    role: params.role,
    isActive: params.user.isActive,
    employee: {
      id: params.employee.id,
      employeeCode: params.employee.employeeCode,
      employeeName: params.employee.employeeName,
      isActive: params.employee.isActive,
      branch: {
        id: params.branch.id,
        branchCode: params.branch.branchCode,
        branchName: params.branch.branchName,
        branchType: params.branch.branchType,
        isActive: params.branch.isActive,
      },
    },
  };
}

function toStoreSummary(store: StoreRow, branch: BranchRow): StoreUserStoreSummary {
  return {
    id: store.id,
    storeCode: store.storeCode,
    storeName: store.storeName,
    isActive: store.isActive,
    branch: {
      id: branch.id,
      branchCode: branch.branchCode,
      branchName: branch.branchName,
      branchType: branch.branchType,
      isActive: branch.isActive,
    },
  };
}

function toStoreUser(row: StoreUserJoinedRow): StoreUser {
  return {
    id: row.assignment.id,
    storeId: row.assignment.storeId,
    makerApplicationUserId: row.assignment.makerApplicationUserId,
    supervisorApplicationUserId: row.assignment.supervisorApplicationUserId,
    isActive: row.assignment.isActive,
    createdAt: row.assignment.createdAt.toISOString(),
    updatedAt: row.assignment.updatedAt.toISOString(),
    store: toStoreSummary(row.store, row.storeBranch),
    maker: toPersonSummary({
      user: row.maker,
      role: row.makerRole,
      employee: row.makerEmployee,
      branch: row.makerBranch,
    }),
    supervisor: toPersonSummary({
      user: row.supervisor,
      role: row.supervisorRole,
      employee: row.supervisorEmployee,
      branch: row.supervisorBranch,
    }),
  };
}

function toEligibleUser(row: EligibleJoinedRow): EligibleStoreApplicationUser {
  return {
    ...toPersonSummary({
      user: row.applicationUser,
      role: row.role,
      employee: row.employee,
      branch: row.branch,
    }),
    role: row.role,
  };
}

function escapeIlikePattern(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function buildListFilters(query: StoreUserListQuery): SQL | undefined {
  const conditions: SQL[] = [];

  if (query.status === "ACTIVE") {
    conditions.push(eq(storeUsers.isActive, true));
  } else if (query.status === "INACTIVE") {
    conditions.push(eq(storeUsers.isActive, false));
  }

  if (query.storeId) {
    conditions.push(eq(storeUsers.storeId, query.storeId));
  }

  if (query.branchId) {
    conditions.push(eq(stores.branchId, query.branchId));
  }

  if (query.search) {
    const pattern = `%${escapeIlikePattern(query.search)}%`;
    const searchCondition = or(
      sql`${stores.storeCode} ILIKE ${pattern} ESCAPE '\\'`,
      sql`${stores.storeName} ILIKE ${pattern} ESCAPE '\\'`,
      sql`${makerEmployees.employeeCode} ILIKE ${pattern} ESCAPE '\\'`,
      sql`${makerEmployees.employeeName} ILIKE ${pattern} ESCAPE '\\'`,
      sql`${makerUsers.username} ILIKE ${pattern} ESCAPE '\\'`,
      sql`${supervisorEmployees.employeeCode} ILIKE ${pattern} ESCAPE '\\'`,
      sql`${supervisorEmployees.employeeName} ILIKE ${pattern} ESCAPE '\\'`,
      sql`${supervisorUsers.username} ILIKE ${pattern} ESCAPE '\\'`,
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

const storeUserSelect = {
  assignment: storeUsers,
  store: stores,
  storeBranch: branches,
  maker: makerUsers,
  makerRole: makerRoles.role,
  makerEmployee: makerEmployees,
  makerBranch: makerBranches,
  supervisor: supervisorUsers,
  supervisorRole: supervisorRoles.role,
  supervisorEmployee: supervisorEmployees,
  supervisorBranch: supervisorBranches,
};

const eligibleSelect = {
  applicationUser: applicationUsers,
  role: userRoles.role,
  employee: employees,
  branch: branches,
};

function storeUserJoins(where?: SQL) {
  const query = getDb()
    .select(storeUserSelect)
    .from(storeUsers)
    .innerJoin(stores, eq(storeUsers.storeId, stores.id))
    .innerJoin(branches, eq(stores.branchId, branches.id))
    .innerJoin(makerUsers, eq(storeUsers.makerApplicationUserId, makerUsers.id))
    .innerJoin(makerRoles, eq(makerRoles.userId, makerUsers.id))
    .innerJoin(makerEmployees, eq(makerUsers.employeeId, makerEmployees.id))
    .innerJoin(makerBranches, eq(makerEmployees.branchId, makerBranches.id))
    .innerJoin(
      supervisorUsers,
      eq(storeUsers.supervisorApplicationUserId, supervisorUsers.id),
    )
    .innerJoin(supervisorRoles, eq(supervisorRoles.userId, supervisorUsers.id))
    .innerJoin(
      supervisorEmployees,
      eq(supervisorUsers.employeeId, supervisorEmployees.id),
    )
    .innerJoin(
      supervisorBranches,
      eq(supervisorEmployees.branchId, supervisorBranches.id),
    );

  return where ? query.where(where) : query;
}

async function getJoinedStoreUserById(
  id: string,
): Promise<StoreUserJoinedRow | undefined> {
  const rows = await storeUserJoins(eq(storeUsers.id, id)).limit(1);
  return rows[0] as StoreUserJoinedRow | undefined;
}

async function assertUsableStore(
  storeId: string,
  options?: { requireNoExistingConfig?: boolean },
): Promise<{ store: StoreRow; branch: BranchRow }> {
  const rows = await getDb()
    .select({
      store: stores,
      branch: branches,
    })
    .from(stores)
    .innerJoin(branches, eq(stores.branchId, branches.id))
    .where(eq(stores.id, storeId))
    .limit(1);

  const row = rows[0];
  if (!row) {
    throw new AppError("Selected store was not found.", 400);
  }

  if (!row.store.isActive) {
    throw new AppError("Inactive stores cannot receive user assignments.", 400);
  }

  if (!row.branch.isActive) {
    throw new AppError("The store’s branch is inactive.", 400);
  }

  if (options?.requireNoExistingConfig) {
    const existing = await getDb()
      .select({ id: storeUsers.id })
      .from(storeUsers)
      .where(eq(storeUsers.storeId, storeId))
      .limit(1);

    if (existing[0]) {
      throw new AppError("This store already has a user configuration.", 409);
    }
  }

  return row;
}

async function loadApplicationUserContext(applicationUserId: string): Promise<{
  applicationUser: ApplicationUserRow;
  roles: AppRole[];
  employee: EmployeeRow;
}> {
  const rows = await getDb()
    .select({
      applicationUser: applicationUsers,
      employee: employees,
    })
    .from(applicationUsers)
    .innerJoin(employees, eq(applicationUsers.employeeId, employees.id))
    .where(
      and(
        eq(applicationUsers.id, applicationUserId),
        isNotNull(applicationUsers.employeeId),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row) {
    throw new AppError("Selected application user was not found.", 400);
  }

  const roleRows = await getDb()
    .select({ role: userRoles.role })
    .from(userRoles)
    .where(eq(userRoles.userId, applicationUserId));

  return {
    applicationUser: row.applicationUser,
    roles: roleRows.map((item) => item.role),
    employee: row.employee,
  };
}

async function assertAssignablePerson(params: {
  applicationUserId: string;
  requiredRole: StoreUserAssignableRole;
  storeBranchId: string;
  fieldLabel: "maker" | "supervisor";
}): Promise<{
  applicationUser: ApplicationUserRow;
  role: StoreUserAssignableRole;
  employee: EmployeeRow;
}> {
  const label =
    params.fieldLabel === "maker" ? "maker" : "supervisor";
  const title =
    params.fieldLabel === "maker"
      ? "Store User (Maker)"
      : "Supervisor (Checker)";

  let context: {
    applicationUser: ApplicationUserRow;
    roles: AppRole[];
    employee: EmployeeRow;
  };

  try {
    context = await loadApplicationUserContext(params.applicationUserId);
  } catch (error) {
    if (error instanceof AppError && error.statusCode === 400) {
      throw new AppError(`Selected ${label} was not found.`, 400);
    }
    throw error;
  }

  if (!context.applicationUser.isActive) {
    throw new AppError(
      `Inactive application users cannot be assigned as the ${title}.`,
      400,
    );
  }

  if (!context.employee.isActive) {
    throw new AppError(
      `Inactive employees cannot be assigned as the ${title}.`,
      400,
    );
  }

  if (context.roles.some((role) => FORBIDDEN_STORE_USER_ROLES.includes(role))) {
    throw new AppError(
      "ADMIN and HR accounts cannot be assigned as a store maker or supervisor.",
      400,
    );
  }

  if (!context.roles.includes(params.requiredRole)) {
    throw new AppError(
      params.fieldLabel === "maker"
        ? "The store user (maker) must have role MAKER."
        : "The supervisor must have role CHECKER.",
      400,
    );
  }

  if (context.employee.branchId !== params.storeBranchId) {
    throw new AppError(
      params.fieldLabel === "maker"
        ? "The maker’s employee branch must match the store’s branch."
        : "The supervisor’s employee branch must match the store’s branch.",
      400,
    );
  }

  return {
    applicationUser: context.applicationUser,
    role: params.requiredRole,
    employee: context.employee,
  };
}

async function assertMakerAvailable(params: {
  makerApplicationUserId: string;
  excludeAssignmentId?: string;
}): Promise<void> {
  const conditions: SQL[] = [
    eq(storeUsers.makerApplicationUserId, params.makerApplicationUserId),
    eq(storeUsers.isActive, true),
  ];

  if (params.excludeAssignmentId) {
    conditions.push(ne(storeUsers.id, params.excludeAssignmentId));
  }

  const existing = await getDb()
    .select({ id: storeUsers.id })
    .from(storeUsers)
    .where(and(...conditions))
    .limit(1);

  if (existing[0]) {
    throw new AppError(
      "This maker is already assigned to another active store.",
      409,
    );
  }
}

async function assertReactivationEligibility(
  row: StoreUserJoinedRow,
): Promise<void> {
  if (
    row.assignment.makerApplicationUserId ===
    row.assignment.supervisorApplicationUserId
  ) {
    throw new AppError(
      "Cannot reactivate a configuration whose maker and supervisor are the same account.",
      400,
    );
  }

  const { store } = await assertUsableStore(row.assignment.storeId);

  await assertAssignablePerson({
    applicationUserId: row.assignment.makerApplicationUserId,
    requiredRole: "MAKER",
    storeBranchId: store.branchId,
    fieldLabel: "maker",
  });
  await assertMakerAvailable({
    makerApplicationUserId: row.assignment.makerApplicationUserId,
    excludeAssignmentId: row.assignment.id,
  });
  await assertAssignablePerson({
    applicationUserId: row.assignment.supervisorApplicationUserId,
    requiredRole: "CHECKER",
    storeBranchId: store.branchId,
    fieldLabel: "supervisor",
  });
}

export async function listStoreUsers(
  query: StoreUserListQuery,
): Promise<PaginatedStoreUserResponse> {
  const where = buildListFilters(query);

  try {
    const countBase = getDb()
      .select({ value: count() })
      .from(storeUsers)
      .innerJoin(stores, eq(storeUsers.storeId, stores.id))
      .innerJoin(branches, eq(stores.branchId, branches.id))
      .innerJoin(makerUsers, eq(storeUsers.makerApplicationUserId, makerUsers.id))
      .innerJoin(makerRoles, eq(makerRoles.userId, makerUsers.id))
      .innerJoin(makerEmployees, eq(makerUsers.employeeId, makerEmployees.id))
      .innerJoin(makerBranches, eq(makerEmployees.branchId, makerBranches.id))
      .innerJoin(
        supervisorUsers,
        eq(storeUsers.supervisorApplicationUserId, supervisorUsers.id),
      )
      .innerJoin(supervisorRoles, eq(supervisorRoles.userId, supervisorUsers.id))
      .innerJoin(
        supervisorEmployees,
        eq(supervisorUsers.employeeId, supervisorEmployees.id),
      )
      .innerJoin(
        supervisorBranches,
        eq(supervisorEmployees.branchId, supervisorBranches.id),
      );

    const countRows = where ? await countBase.where(where) : await countBase;
    const totalItems = countRows[0]?.value ?? 0;
    const totalPages =
      totalItems === 0 ? 0 : Math.ceil(totalItems / query.pageSize);
    const offset = (query.page - 1) * query.pageSize;

    const rows = await storeUserJoins(where)
      .orderBy(
        asc(stores.storeName),
        asc(makerEmployees.employeeName),
        asc(makerUsers.username),
        asc(storeUsers.id),
      )
      .limit(query.pageSize)
      .offset(offset);

    return {
      items: (rows as StoreUserJoinedRow[]).map(toStoreUser),
      page: query.page,
      pageSize: query.pageSize,
      totalItems,
      totalPages,
    };
  } catch (error) {
    mapStoreUserDatabaseError(error);
  }
}

export async function getStoreUserById(id: string): Promise<StoreUser> {
  try {
    const row = await getJoinedStoreUserById(id);
    if (!row) {
      throw new AppError("Store user configuration not found", 404);
    }

    return toStoreUser(row);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    mapStoreUserDatabaseError(error);
  }
}

export async function listEligibleStores(
  query: EligibleStoreUserStoreListQuery,
): Promise<PaginatedEligibleStoreUserStoreResponse> {
  const conditions: SQL[] = [
    eq(stores.isActive, true),
    eq(branches.isActive, true),
    isNull(storeUsers.id),
  ];

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

  const where = and(...conditions);

  try {
    const countRows = await getDb()
      .select({ value: count() })
      .from(stores)
      .innerJoin(branches, eq(stores.branchId, branches.id))
      .leftJoin(storeUsers, eq(storeUsers.storeId, stores.id))
      .where(where);

    const totalItems = countRows[0]?.value ?? 0;
    const totalPages =
      totalItems === 0 ? 0 : Math.ceil(totalItems / query.pageSize);
    const offset = (query.page - 1) * query.pageSize;

    const rows = await getDb()
      .select({
        store: stores,
        branch: branches,
      })
      .from(stores)
      .innerJoin(branches, eq(stores.branchId, branches.id))
      .leftJoin(storeUsers, eq(storeUsers.storeId, stores.id))
      .where(where)
      .orderBy(asc(stores.storeName), asc(stores.storeCode), asc(stores.id))
      .limit(query.pageSize)
      .offset(offset);

    return {
      items: rows.map((row) => toStoreSummary(row.store, row.branch)),
      page: query.page,
      pageSize: query.pageSize,
      totalItems,
      totalPages,
    };
  } catch (error) {
    mapStoreUserDatabaseError(error);
  }
}

export async function listEligibleStoreApplicationUsers(
  query: EligibleStoreApplicationUserListQuery,
): Promise<PaginatedEligibleStoreApplicationUserResponse> {
  const { store } = await assertUsableStore(query.storeId);

  const conditions: SQL[] = [
    eq(applicationUsers.isActive, true),
    eq(employees.isActive, true),
    eq(employees.branchId, store.branchId),
    isNotNull(applicationUsers.employeeId),
    eq(userRoles.role, query.role),
    isNull(forbiddenRoles.userId),
  ];

  if (query.role === "MAKER") {
    conditions.push(isNull(activeMakerAssignments.id));
  }

  if (query.search) {
    const pattern = `%${escapeIlikePattern(query.search)}%`;
    const searchCondition = or(
      sql`${applicationUsers.username} ILIKE ${pattern} ESCAPE '\\'`,
      sql`${employees.employeeCode} ILIKE ${pattern} ESCAPE '\\'`,
      sql`${employees.employeeName} ILIKE ${pattern} ESCAPE '\\'`,
    );
    if (searchCondition) {
      conditions.push(searchCondition);
    }
  }

  const where = and(...conditions);
  const makerAssignmentJoin = query.excludeAssignmentId
    ? and(
        eq(activeMakerAssignments.makerApplicationUserId, applicationUsers.id),
        eq(activeMakerAssignments.isActive, true),
        ne(activeMakerAssignments.id, query.excludeAssignmentId),
      )
    : and(
        eq(activeMakerAssignments.makerApplicationUserId, applicationUsers.id),
        eq(activeMakerAssignments.isActive, true),
      );

  try {
    const countBase = getDb()
      .select({ value: count() })
      .from(applicationUsers)
      .innerJoin(userRoles, eq(userRoles.userId, applicationUsers.id))
      .innerJoin(employees, eq(applicationUsers.employeeId, employees.id))
      .innerJoin(branches, eq(employees.branchId, branches.id))
      .leftJoin(
        forbiddenRoles,
        and(
          eq(forbiddenRoles.userId, applicationUsers.id),
          inArray(forbiddenRoles.role, FORBIDDEN_STORE_USER_ROLES),
        ),
      )
      .leftJoin(activeMakerAssignments, makerAssignmentJoin);

    const countRows = await countBase.where(where);
    const totalItems = countRows[0]?.value ?? 0;
    const totalPages =
      totalItems === 0 ? 0 : Math.ceil(totalItems / query.pageSize);
    const offset = (query.page - 1) * query.pageSize;

    const rows = await getDb()
      .select(eligibleSelect)
      .from(applicationUsers)
      .innerJoin(userRoles, eq(userRoles.userId, applicationUsers.id))
      .innerJoin(employees, eq(applicationUsers.employeeId, employees.id))
      .innerJoin(branches, eq(employees.branchId, branches.id))
      .leftJoin(
        forbiddenRoles,
        and(
          eq(forbiddenRoles.userId, applicationUsers.id),
          inArray(forbiddenRoles.role, FORBIDDEN_STORE_USER_ROLES),
        ),
      )
      .leftJoin(activeMakerAssignments, makerAssignmentJoin)
      .where(where)
      .orderBy(
        asc(employees.employeeName),
        asc(applicationUsers.username),
        asc(applicationUsers.id),
      )
      .limit(query.pageSize)
      .offset(offset);

    return {
      items: (rows as EligibleJoinedRow[]).map(toEligibleUser),
      page: query.page,
      pageSize: query.pageSize,
      totalItems,
      totalPages,
    };
  } catch (error) {
    mapStoreUserDatabaseError(error);
  }
}

export async function createStoreUser(
  input: CreateStoreUserInput,
): Promise<StoreUser> {
  if (input.makerApplicationUserId === input.supervisorApplicationUserId) {
    throw new AppError(
      "Maker and Supervisor must be different accounts.",
      400,
    );
  }

  const { store } = await assertUsableStore(input.storeId, {
    requireNoExistingConfig: true,
  });

  await assertAssignablePerson({
    applicationUserId: input.makerApplicationUserId,
    requiredRole: "MAKER",
    storeBranchId: store.branchId,
    fieldLabel: "maker",
  });
  await assertMakerAvailable({
    makerApplicationUserId: input.makerApplicationUserId,
  });
  await assertAssignablePerson({
    applicationUserId: input.supervisorApplicationUserId,
    requiredRole: "CHECKER",
    storeBranchId: store.branchId,
    fieldLabel: "supervisor",
  });

  try {
    const inserted = await getDb()
      .insert(storeUsers)
      .values({
        storeId: input.storeId,
        makerApplicationUserId: input.makerApplicationUserId,
        supervisorApplicationUserId: input.supervisorApplicationUserId,
        isActive: true,
      })
      .returning({ id: storeUsers.id });

    const created = inserted[0];
    if (!created) {
      throw new AppError("Failed to create store user configuration", 500);
    }

    return getStoreUserById(created.id);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    mapStoreUserDatabaseError(error);
  }
}

export async function updateStoreUser(
  id: string,
  input: UpdateStoreUserInput,
): Promise<StoreUser> {
  if (input.makerApplicationUserId === input.supervisorApplicationUserId) {
    throw new AppError(
      "Maker and Supervisor must be different accounts.",
      400,
    );
  }

  const existing = await getJoinedStoreUserById(id);
  if (!existing) {
    throw new AppError("Store user configuration not found", 404);
  }

  const { store } = await assertUsableStore(existing.assignment.storeId);

  await assertAssignablePerson({
    applicationUserId: input.makerApplicationUserId,
    requiredRole: "MAKER",
    storeBranchId: store.branchId,
    fieldLabel: "maker",
  });
  await assertMakerAvailable({
    makerApplicationUserId: input.makerApplicationUserId,
    excludeAssignmentId: id,
  });
  await assertAssignablePerson({
    applicationUserId: input.supervisorApplicationUserId,
    requiredRole: "CHECKER",
    storeBranchId: store.branchId,
    fieldLabel: "supervisor",
  });

  try {
    const rows = await getDb()
      .update(storeUsers)
      .set({
        makerApplicationUserId: input.makerApplicationUserId,
        supervisorApplicationUserId: input.supervisorApplicationUserId,
        updatedAt: sql`now()`,
      })
      .where(eq(storeUsers.id, id))
      .returning({ id: storeUsers.id });

    const updated = rows[0];
    if (!updated) {
      throw new AppError("Store user configuration not found", 404);
    }

    return getStoreUserById(updated.id);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    mapStoreUserDatabaseError(error);
  }
}

export async function updateStoreUserStatus(
  id: string,
  input: UpdateStoreUserStatusInput,
): Promise<StoreUser> {
  const existing = await getJoinedStoreUserById(id);
  if (!existing) {
    throw new AppError("Store user configuration not found", 404);
  }

  if (input.isActive) {
    await assertReactivationEligibility(existing);
  }

  try {
    const rows = await getDb()
      .update(storeUsers)
      .set({
        isActive: input.isActive,
        updatedAt: sql`now()`,
      })
      .where(eq(storeUsers.id, id))
      .returning({ id: storeUsers.id });

    const updated = rows[0];
    if (!updated) {
      throw new AppError("Store user configuration not found", 404);
    }

    return getStoreUserById(updated.id);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    mapStoreUserDatabaseError(error);
  }
}
