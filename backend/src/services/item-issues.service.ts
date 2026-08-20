import { randomBytes } from "node:crypto";
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
  CreateItemIssueInput,
  ItemIssue,
  ItemIssueEligibility,
  ItemIssueLineAvailability,
  ItemIssueListItem,
  ItemIssueListQuery,
  ItemIssueRequestSummary,
  PaginatedItemIssueResponse,
  UpdateItemIssueInput,
} from "@printing-stationery/shared";
import { userHasRole } from "@printing-stationery/shared";
import { AppError } from "../utils/errors.js";
import {
  isItemIssueNumberUniqueViolation,
  mapItemIssueDatabaseError,
} from "../utils/db-errors.js";
import {
  ADMIN_ITEM_ISSUE_OPERATOR_FORBIDDEN_MESSAGE,
  ITEM_ISSUE_OPERATOR_FORBIDDEN_MESSAGE,
  NON_CORPORATE_SUPPLYING_STORE_MESSAGE,
  actorMayOperateItemIssue,
  isCorporateSupplyingStore,
} from "./item-issue-authorization.js";
import { getDb } from "../db/client.js";
import {
  applicationUsers,
  userRoles,
  type ApplicationUserRow,
} from "../db/schema/auth.js";
import { branches, type BranchRow } from "../db/schema/branches.js";
import { employees, type EmployeeRow } from "../db/schema/employees.js";
import {
  itemIssueLines,
  itemIssues,
  type ItemIssueRow,
} from "../db/schema/item-issues.js";
import {
  itemRequestLines,
  itemRequests,
  type ItemRequestRow,
} from "../db/schema/item-requests.js";
import { items, type ItemRow } from "../db/schema/items.js";
import { stores, type StoreRow } from "../db/schema/stores.js";
import { storeUsers } from "../db/schema/store-users.js";
import { units } from "../db/schema/units.js";

const ISSUE_NUMBER_RETRY_ATTEMPTS = 5;
const STALE_ISSUE_MESSAGE = "This issue has changed. Refresh and try again.";

const fromStores = alias(stores, "from_stores");
const fromBranches = alias(branches, "from_branches");
const toStores = alias(stores, "to_stores");
const toBranches = alias(branches, "to_branches");
const createdByUsers = alias(applicationUsers, "issue_created_by_users");
const createdByEmployees = alias(employees, "issue_created_by_employees");
const submittedByUsers = alias(applicationUsers, "issue_submitted_by_users");
const submittedByEmployees = alias(
  employees,
  "issue_submitted_by_employees",
);
const requestStores = alias(stores, "request_stores");
const requestBranches = alias(branches, "request_branches");
const corporateStores = alias(stores, "request_corporate_stores");
const corporateBranches = alias(branches, "request_corporate_branches");
const requestCreatedByUsers = alias(applicationUsers, "request_created_by_users");
const requestCreatedByEmployees = alias(
  employees,
  "request_created_by_employees",
);

type StoreAssignmentContext = {
  assignment: {
    id: string;
    storeId: string;
    makerApplicationUserId: string;
    supervisorApplicationUserId: string;
    isActive: boolean;
  };
  store: StoreRow;
  branch: BranchRow;
};

type ItemRequestPersonSummary = ItemIssueRequestSummary["createdBy"];
type ItemRequestStoreSummary = ItemIssueRequestSummary["requestingStore"];

type RequestLineRow = {
  line: typeof itemRequestLines.$inferSelect;
  item: ItemRow;
  unitId: string;
  unitName: string;
};

function isAdminUser(actor: AuthenticatedUser): boolean {
  return userHasRole(actor.roles, "ADMIN");
}

function isCheckerUser(actor: AuthenticatedUser): boolean {
  return userHasRole(actor.roles, "CHECKER");
}

function generateIssueNumber(): string {
  const now = new Date();
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");
  const token = randomBytes(4).toString("hex").toUpperCase();
  return `II-${year}${month}${day}-${token}`;
}

function escapeIlikePattern(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function parseQuantityToScaled(value: string): bigint {
  const trimmed = value.trim();
  if (!/^\d+(?:\.\d{1,4})?$/.test(trimmed)) {
    throw new AppError("Invalid quantity format", 400);
  }

  const [wholePart = "0", fractionPart = ""] = trimmed.split(".");
  const normalizedWhole = wholePart.replace(/^0+(?=\d)/, "") || "0";
  const normalizedFraction = fractionPart.padEnd(4, "0");
  return BigInt(normalizedWhole) * 10_000n + BigInt(normalizedFraction);
}

function scaledToQuantity(value: bigint): string {
  const sign = value < 0n ? "-" : "";
  const absolute = value < 0n ? -value : value;
  const whole = absolute / 10_000n;
  const fraction = (absolute % 10_000n).toString().padStart(4, "0");
  const trimmedFraction = fraction.replace(/0+$/, "");
  return trimmedFraction.length > 0
    ? `${sign}${whole.toString()}.${trimmedFraction}`
    : `${sign}${whole.toString()}`;
}

function toStoreSummary(
  store: StoreRow,
  branch: BranchRow,
): ItemRequestStoreSummary {
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

function toPersonSummary(
  user: ApplicationUserRow | null | undefined,
  employee: EmployeeRow | null | undefined,
): ItemRequestPersonSummary | null {
  if (!user) {
    return null;
  }

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

async function getActiveCheckerAssignment(
  applicationUserId: string,
  storeId: string,
): Promise<StoreAssignmentContext | undefined> {
  const rows = await getDb()
    .select({
      assignment: storeUsers,
      store: stores,
      branch: branches,
    })
    .from(storeUsers)
    .innerJoin(stores, eq(storeUsers.storeId, stores.id))
    .innerJoin(branches, eq(stores.branchId, branches.id))
    .where(
      and(
        eq(storeUsers.supervisorApplicationUserId, applicationUserId),
        eq(storeUsers.storeId, storeId),
        eq(storeUsers.isActive, true),
        eq(stores.isActive, true),
        eq(branches.isActive, true),
      ),
    )
    .limit(1);

  return rows[0];
}

async function listSupervisedStoreIds(applicationUserId: string): Promise<string[]> {
  const rows = await getDb()
    .select({ storeId: storeUsers.storeId })
    .from(storeUsers)
    .innerJoin(stores, eq(storeUsers.storeId, stores.id))
    .innerJoin(branches, eq(stores.branchId, branches.id))
    .where(
      and(
        eq(storeUsers.supervisorApplicationUserId, applicationUserId),
        eq(storeUsers.isActive, true),
        eq(stores.isActive, true),
        eq(branches.isActive, true),
      ),
    );

  return rows.map((row) => row.storeId);
}

async function assertActiveParticipant(
  applicationUserId: string,
  label: string,
): Promise<{
  user: ApplicationUserRow;
  employee: EmployeeRow;
  roles: AuthenticatedUser["roles"];
}> {
  const rows = await getDb()
    .select({
      user: applicationUsers,
      employee: employees,
    })
    .from(applicationUsers)
    .innerJoin(employees, eq(applicationUsers.employeeId, employees.id))
    .where(eq(applicationUsers.id, applicationUserId))
    .limit(1);

  const row = rows[0];
  if (!row) {
    throw new AppError(`${label} was not found.`, 400);
  }
  if (!row.user.isActive) {
    throw new AppError(`${label} is inactive.`, 400);
  }
  if (!row.employee.isActive) {
    throw new AppError(`${label} employee record is inactive.`, 400);
  }

  const roleRows = await getDb()
    .select({ role: userRoles.role })
    .from(userRoles)
    .where(eq(userRoles.userId, applicationUserId));

  return {
    user: row.user,
    employee: row.employee,
    roles: roleRows.map((item) => item.role),
  };
}

async function requireSupplyingStoreChecker(
  actor: AuthenticatedUser,
  supplyingStoreId: string,
): Promise<StoreAssignmentContext> {
  if (isAdminUser(actor)) {
    throw new AppError(ADMIN_ITEM_ISSUE_OPERATOR_FORBIDDEN_MESSAGE, 403);
  }
  if (!isCheckerUser(actor)) {
    throw new AppError(ITEM_ISSUE_OPERATOR_FORBIDDEN_MESSAGE, 403);
  }

  await assertActiveParticipant(actor.id, "Checker");
  const assignment = await getActiveCheckerAssignment(actor.id, supplyingStoreId);
  if (!assignment) {
    throw new AppError(ITEM_ISSUE_OPERATOR_FORBIDDEN_MESSAGE, 403);
  }

  if (
    !isCorporateSupplyingStore({
      underStoreId: assignment.store.underStoreId,
      branchType: assignment.branch.branchType,
    })
  ) {
    throw new AppError(ITEM_ISSUE_OPERATOR_FORBIDDEN_MESSAGE, 403);
  }

  return assignment;
}

async function loadRequestLineRows(requestId: string): Promise<RequestLineRow[]> {
  return getDb()
    .select({
      line: itemRequestLines,
      item: items,
      unitId: units.id,
      unitName: units.unitName,
    })
    .from(itemRequestLines)
    .innerJoin(items, eq(itemRequestLines.itemId, items.id))
    .innerJoin(units, eq(items.unitId, units.id))
    .where(eq(itemRequestLines.itemRequestId, requestId))
    .orderBy(asc(items.itemName), asc(items.itemCode), asc(itemRequestLines.id));
}

async function loadApprovedRequestOrThrow(requestId: string): Promise<{
  request: ItemRequestRow;
  requestingStore: StoreRow;
  requestingBranch: BranchRow;
  corporateStore: StoreRow;
  corporateBranch: BranchRow;
  createdByUser: ApplicationUserRow;
  createdByEmployee: EmployeeRow | null;
}> {
  const rows = await getDb()
    .select({
      request: itemRequests,
      requestingStore: requestStores,
      requestingBranch: requestBranches,
      corporateStore: corporateStores,
      corporateBranch: corporateBranches,
      createdByUser: requestCreatedByUsers,
      createdByEmployee: requestCreatedByEmployees,
    })
    .from(itemRequests)
    .innerJoin(requestStores, eq(itemRequests.requestingStoreId, requestStores.id))
    .innerJoin(requestBranches, eq(requestStores.branchId, requestBranches.id))
    .innerJoin(corporateStores, eq(itemRequests.corporateStoreId, corporateStores.id))
    .innerJoin(corporateBranches, eq(corporateStores.branchId, corporateBranches.id))
    .innerJoin(
      requestCreatedByUsers,
      eq(itemRequests.createdByApplicationUserId, requestCreatedByUsers.id),
    )
    .leftJoin(
      requestCreatedByEmployees,
      eq(requestCreatedByUsers.employeeId, requestCreatedByEmployees.id),
    )
    .where(eq(itemRequests.id, requestId))
    .limit(1);

  const row = rows[0];
  if (!row) {
    throw new AppError("Item request not found", 404);
  }
  if (row.request.status !== "APPROVED") {
    throw new AppError(
      "An item issue can be created only from an approved request.",
      409,
    );
  }
  if (!row.requestingStore.isActive) {
    throw new AppError("The requesting store is inactive.", 409);
  }
  if (!row.corporateStore.isActive) {
    throw new AppError("The supplying store is inactive.", 409);
  }
  if (
    !isCorporateSupplyingStore({
      underStoreId: row.corporateStore.underStoreId,
      branchType: row.corporateBranch.branchType,
    })
  ) {
    throw new AppError(NON_CORPORATE_SUPPLYING_STORE_MESSAGE, 409);
  }

  return row;
}

async function loadSubmittedIssueTotalsByRequestLine(
  requestId: string,
  excludeIssueId?: string,
): Promise<Map<string, bigint>> {
  const conditions: SQL[] = [
    eq(itemIssues.requestId, requestId),
    eq(itemIssues.status, "SUBMITTED"),
  ];
  if (excludeIssueId) {
    conditions.push(sql`${itemIssues.id} <> ${excludeIssueId}`);
  }

  const rows = await getDb()
    .select({
      requestLineId: itemIssueLines.requestLineId,
      totalQuantity: sql<string>`coalesce(sum(${itemIssueLines.issueQuantity}), 0)::text`,
    })
    .from(itemIssueLines)
    .innerJoin(itemIssues, eq(itemIssueLines.itemIssueId, itemIssues.id))
    .where(and(...conditions))
    .groupBy(itemIssueLines.requestLineId);

  return new Map(
    rows.map((row) => [row.requestLineId, parseQuantityToScaled(row.totalQuantity)]),
  );
}

async function buildAvailability(
  requestId: string,
  excludeIssueId?: string,
): Promise<ItemIssueLineAvailability[]> {
  const [requestLineRows, submittedTotals] = await Promise.all([
    loadRequestLineRows(requestId),
    loadSubmittedIssueTotalsByRequestLine(requestId, excludeIssueId),
  ]);

  return requestLineRows.map((row) => {
    const requested = parseQuantityToScaled(String(row.line.requestedQuantity));
    const previouslyIssued = submittedTotals.get(row.line.id) ?? 0n;
    const remaining = requested - previouslyIssued;

    return {
      requestLineId: row.line.id,
      itemId: row.item.id,
      itemCode: row.item.itemCode,
      itemName: row.item.itemName,
      unit: {
        id: row.unitId,
        unitName: row.unitName,
      },
      requestedQuantity: scaledToQuantity(requested),
      previouslyIssuedQuantity: scaledToQuantity(previouslyIssued),
      remainingQuantity: scaledToQuantity(remaining < 0n ? 0n : remaining),
      availableStockQuantity: null,
      stockBalanceKnown: false,
    };
  });
}

export function canCreateIssueFromAvailability(
  availability: ItemIssueLineAvailability[],
): boolean {
  return availability.some(
    (line) => parseQuantityToScaled(line.remainingQuantity) > 0n,
  );
}

export function validateIssueLinesAgainstAvailability(params: {
  lines: Array<{ requestLineId: string; issueQuantity: string }>;
  availability: ItemIssueLineAvailability[];
}): void {
  const availabilityByLine = new Map(
    params.availability.map((line) => [line.requestLineId, line]),
  );

  let positiveLineCount = 0;

  for (const line of params.lines) {
    const available = availabilityByLine.get(line.requestLineId);
    if (!available) {
      throw new AppError("Issue lines must belong to the selected request.", 400);
    }

    let issueQuantity: bigint;
    try {
      issueQuantity = parseQuantityToScaled(line.issueQuantity);
    } catch {
      throw new AppError("Issue quantity must be a valid positive decimal string", 400);
    }

    if (issueQuantity <= 0n) {
      throw new AppError("Issue quantity must be greater than zero", 400);
    }

    const remaining = parseQuantityToScaled(available.remainingQuantity);
    if (issueQuantity > remaining) {
      throw new AppError(
        `Issue quantity for ${available.itemCode} exceeds the remaining requested quantity.`,
        409,
      );
    }

    positiveLineCount += 1;
  }

  if (positiveLineCount === 0) {
    throw new AppError("At least one line must have an issue quantity greater than zero.", 400);
  }
}

async function createDraftWithRetry(
  values: Omit<typeof itemIssues.$inferInsert, "issueNumber">,
  lines: Array<{ requestLineId: string; itemId: string; issueQuantity: string }>,
): Promise<string> {
  let lastError: unknown;

  for (let attempt = 0; attempt < ISSUE_NUMBER_RETRY_ATTEMPTS; attempt += 1) {
    const issueNumber = generateIssueNumber();
    try {
      const createdId = await getDb().transaction(async (tx) => {
        const inserted = await tx
          .insert(itemIssues)
          .values({
            ...values,
            issueNumber,
          })
          .returning({ id: itemIssues.id });

        const created = inserted[0];
        if (!created) {
          throw new AppError("Failed to create item issue", 500);
        }

        await tx.insert(itemIssueLines).values(
          lines.map((line) => ({
            itemIssueId: created.id,
            requestLineId: line.requestLineId,
            itemId: line.itemId,
            issueQuantity: line.issueQuantity,
          })),
        );

        return created.id;
      });

      return createdId;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      if (isItemIssueNumberUniqueViolation(error)) {
        lastError = error;
        continue;
      }
      mapItemIssueDatabaseError(error);
    }
  }

  throw new AppError("Failed to generate a unique issue number.", 409, {
    cause: lastError,
  });
}

async function loadIssueVisibilityIds(actor: AuthenticatedUser): Promise<string[]> {
  if (isAdminUser(actor) || !isCheckerUser(actor)) {
    return [];
  }

  return listSupervisedStoreIds(actor.id);
}

function issueListWhere(
  actor: AuthenticatedUser,
  visibleStoreIds: string[],
  query: ItemIssueListQuery,
): SQL | undefined {
  const conditions: SQL[] = [];

  if (!isAdminUser(actor)) {
    if (visibleStoreIds.length === 0) {
      conditions.push(sql`1 = 0`);
    } else {
      conditions.push(
        inArray(itemIssues.fromStoreId, visibleStoreIds),
      );
    }
  }

  if (query.status !== "ALL") {
    conditions.push(eq(itemIssues.status, query.status));
  }

  if (query.search) {
    const pattern = `%${escapeIlikePattern(query.search)}%`;
    conditions.push(
      or(
        sql`${itemIssues.issueNumber} ILIKE ${pattern} ESCAPE '\\'`,
        sql`${itemRequests.requestNumber} ILIKE ${pattern} ESCAPE '\\'`,
        sql`${fromStores.storeCode} ILIKE ${pattern} ESCAPE '\\'`,
        sql`${fromStores.storeName} ILIKE ${pattern} ESCAPE '\\'`,
        sql`${toStores.storeCode} ILIKE ${pattern} ESCAPE '\\'`,
        sql`${toStores.storeName} ILIKE ${pattern} ESCAPE '\\'`,
      )!,
    );
  }

  if (conditions.length === 0) {
    return undefined;
  }
  return conditions.length === 1 ? conditions[0] : and(...conditions);
}

const issueHeaderSelect = {
  issue: itemIssues,
  request: itemRequests,
  fromStore: fromStores,
  fromBranch: fromBranches,
  toStore: toStores,
  toBranch: toBranches,
  createdByUser: createdByUsers,
  createdByEmployee: createdByEmployees,
  submittedByUser: submittedByUsers,
  submittedByEmployee: submittedByEmployees,
};

function issueHeaderBase() {
  return getDb()
    .select(issueHeaderSelect)
    .from(itemIssues)
    .innerJoin(itemRequests, eq(itemIssues.requestId, itemRequests.id))
    .innerJoin(fromStores, eq(itemIssues.fromStoreId, fromStores.id))
    .innerJoin(fromBranches, eq(fromStores.branchId, fromBranches.id))
    .innerJoin(toStores, eq(itemIssues.toStoreId, toStores.id))
    .innerJoin(toBranches, eq(toStores.branchId, toBranches.id))
    .innerJoin(
      createdByUsers,
      eq(itemIssues.createdByApplicationUserId, createdByUsers.id),
    )
    .leftJoin(
      createdByEmployees,
      eq(createdByUsers.employeeId, createdByEmployees.id),
    )
    .leftJoin(
      submittedByUsers,
      eq(itemIssues.submittedByApplicationUserId, submittedByUsers.id),
    )
    .leftJoin(
      submittedByEmployees,
      eq(submittedByUsers.employeeId, submittedByEmployees.id),
    );
}

type IssueHeaderRow = {
  issue: ItemIssueRow;
  request: ItemRequestRow;
  fromStore: StoreRow;
  fromBranch: BranchRow;
  toStore: StoreRow;
  toBranch: BranchRow;
  createdByUser: ApplicationUserRow;
  createdByEmployee: EmployeeRow | null;
  submittedByUser: ApplicationUserRow | null;
  submittedByEmployee: EmployeeRow | null;
};

function toIssueListItem(
  row: IssueHeaderRow,
  actor: AuthenticatedUser,
  supervisedStoreIds: string[],
): ItemIssueListItem {
  const createdBy = toPersonSummary(row.createdByUser, row.createdByEmployee)!;
  const submittedBy = toPersonSummary(row.submittedByUser, row.submittedByEmployee);
  const canEdit =
    row.issue.status === "DRAFT" &&
    isCorporateSupplyingStore({
      underStoreId: row.fromStore.underStoreId,
      branchType: row.fromBranch.branchType,
    }) &&
    actorMayOperateItemIssue({
      actor,
      supplyingStoreId: row.issue.fromStoreId,
      supervisedStoreIds,
    });

  return {
    id: row.issue.id,
    issueNumber: row.issue.issueNumber,
    requestId: row.issue.requestId,
    requestNumber: row.request.requestNumber,
    status: row.issue.status,
    version: row.issue.version,
    remarks: row.issue.remarks ?? null,
    createdAt: row.issue.createdAt.toISOString(),
    updatedAt: row.issue.updatedAt.toISOString(),
    submittedAt: row.issue.submittedAt?.toISOString() ?? null,
    fromStore: toStoreSummary(row.fromStore, row.fromBranch),
    toStore: toStoreSummary(row.toStore, row.toBranch),
    createdBy,
    submittedBy,
    canEdit,
    canSubmit: canEdit,
  };
}

export async function getItemIssueEligibility(
  requestId: string,
  actor: AuthenticatedUser,
): Promise<ItemIssueEligibility> {
  const request = await loadApprovedRequestOrThrow(requestId);
  const assignment = await requireSupplyingStoreChecker(
    actor,
    request.corporateStore.id,
  );
  const availability = await buildAvailability(requestId);

  const draftRows = await getDb()
    .select({ id: itemIssues.id })
    .from(itemIssues)
    .where(
      and(
        eq(itemIssues.requestId, requestId),
        eq(itemIssues.fromStoreId, assignment.store.id),
        eq(itemIssues.status, "DRAFT"),
      ),
    )
    .orderBy(desc(itemIssues.updatedAt), desc(itemIssues.createdAt), desc(itemIssues.id))
    .limit(1);

  const canCreate = canCreateIssueFromAvailability(availability);

  return {
    canCreate,
    reason: canCreate
      ? null
      : "This request has no remaining quantity available for a new issue.",
    draftIssueId: draftRows[0]?.id ?? null,
    request: {
      id: request.request.id,
      requestNumber: request.request.requestNumber,
      status: request.request.status,
      remarks: request.request.remarks ?? null,
      createdAt: request.request.createdAt.toISOString(),
      approvedAt: request.request.approvedAt?.toISOString() ?? null,
      requestingStore: toStoreSummary(
        request.requestingStore,
        request.requestingBranch,
      ),
      corporateStore: toStoreSummary(
        request.corporateStore,
        request.corporateBranch,
      ),
      createdBy: toPersonSummary(
        request.createdByUser,
        request.createdByEmployee,
      )!,
      lines: (await loadRequestLineRows(requestId)).map((row) => ({
        id: row.line.id,
        itemId: row.line.itemId,
        requestedQuantity: String(row.line.requestedQuantity),
        createdAt: row.line.createdAt.toISOString(),
        updatedAt: row.line.updatedAt.toISOString(),
        item: {
          id: row.item.id,
          itemCode: row.item.itemCode,
          itemName: row.item.itemName,
          isActive: row.item.isActive,
          isRequestable: row.item.isRequestable,
          unit: {
            id: row.unitId,
            unitName: row.unitName,
          },
        },
      })),
    },
    lines: availability,
  };
}

export async function createItemIssueFromRequest(
  requestId: string,
  actor: AuthenticatedUser,
  input: CreateItemIssueInput,
): Promise<ItemIssue> {
  const eligibility = await getItemIssueEligibility(requestId, actor);
  if (!eligibility.canCreate || !eligibility.request) {
    throw new AppError(
      eligibility.reason ?? "This request is not eligible for a new issue.",
      409,
    );
  }

  validateIssueLinesAgainstAvailability({
    lines: input.lines,
    availability: eligibility.lines,
  });

  const availabilityByLine = new Map(
    eligibility.lines.map((line) => [line.requestLineId, line]),
  );
  const supplyingStoreId = eligibility.request.corporateStore?.id;
  if (!supplyingStoreId) {
    throw new AppError(NON_CORPORATE_SUPPLYING_STORE_MESSAGE, 409);
  }

  const createdId = await createDraftWithRetry(
    {
      requestId,
      fromStoreId: supplyingStoreId,
      toStoreId: eligibility.request.requestingStore.id,
      status: "DRAFT",
      remarks: input.remarks,
      createdByApplicationUserId: actor.id,
      version: 1,
    },
    input.lines.map((line) => {
      const available = availabilityByLine.get(line.requestLineId);
      if (!available) {
        throw new AppError("Issue lines must belong to the selected request.", 400);
      }
      return {
        requestLineId: line.requestLineId,
        itemId: available.itemId,
        issueQuantity: line.issueQuantity,
      };
    }),
  );

  return getItemIssueById(createdId, actor);
}

export async function listItemIssues(
  actor: AuthenticatedUser,
  query: ItemIssueListQuery,
): Promise<PaginatedItemIssueResponse> {
  const visibleStoreIds = await loadIssueVisibilityIds(actor);
  const where = issueListWhere(actor, visibleStoreIds, query);

  try {
    const countBase = getDb()
      .select({ value: count() })
      .from(itemIssues)
      .innerJoin(itemRequests, eq(itemIssues.requestId, itemRequests.id))
      .innerJoin(fromStores, eq(itemIssues.fromStoreId, fromStores.id))
      .innerJoin(toStores, eq(itemIssues.toStoreId, toStores.id));

    const countRows = where ? await countBase.where(where) : await countBase;
    const totalItems = countRows[0]?.value ?? 0;
    const totalPages =
      totalItems === 0 ? 0 : Math.ceil(totalItems / query.pageSize);
    const offset = (query.page - 1) * query.pageSize;

    const listBase = issueHeaderBase()
      .orderBy(
        desc(itemIssues.createdAt),
        desc(itemIssues.issueNumber),
        desc(itemIssues.id),
      )
      .limit(query.pageSize)
      .offset(offset);

    const rows = where ? await listBase.where(where) : await listBase;

    return {
      items: rows.map((row) => toIssueListItem(row, actor, visibleStoreIds)),
      page: query.page,
      pageSize: query.pageSize,
      totalItems,
      totalPages,
    };
  } catch (error) {
    mapItemIssueDatabaseError(error);
  }
}

export async function getItemIssueById(
  issueId: string,
  actor: AuthenticatedUser,
): Promise<ItemIssue> {
  const visibleStoreIds = await loadIssueVisibilityIds(actor);

  const visibility = isAdminUser(actor)
    ? undefined
    : visibleStoreIds.length > 0
      ? inArray(itemIssues.fromStoreId, visibleStoreIds)
      : sql`1 = 0`;

  const where = visibility
    ? and(eq(itemIssues.id, issueId), visibility)
    : eq(itemIssues.id, issueId);

  try {
    const headerRows = await issueHeaderBase().where(where).limit(1);
    const header = headerRows[0];
    if (!header) {
      throw new AppError("Item issue not found", 404);
    }

    const requestHeader = await loadApprovedRequestOrThrow(header.issue.requestId);
    const [lineRows, availability] = await Promise.all([
      getDb()
        .select({
          line: itemIssueLines,
          requestLine: itemRequestLines,
          item: items,
          unitId: units.id,
          unitName: units.unitName,
        })
        .from(itemIssueLines)
        .innerJoin(itemRequestLines, eq(itemIssueLines.requestLineId, itemRequestLines.id))
        .innerJoin(items, eq(itemIssueLines.itemId, items.id))
        .innerJoin(units, eq(items.unitId, units.id))
        .where(eq(itemIssueLines.itemIssueId, issueId))
        .orderBy(asc(items.itemName), asc(items.itemCode), asc(itemIssueLines.id)),
      buildAvailability(header.issue.requestId, header.issue.id),
    ]);

    return {
      ...toIssueListItem(header, actor, visibleStoreIds),
      request: {
        id: requestHeader.request.id,
        requestNumber: requestHeader.request.requestNumber,
        status: requestHeader.request.status,
        remarks: requestHeader.request.remarks ?? null,
        createdAt: requestHeader.request.createdAt.toISOString(),
        approvedAt: requestHeader.request.approvedAt?.toISOString() ?? null,
        requestingStore: toStoreSummary(
          requestHeader.requestingStore,
          requestHeader.requestingBranch,
        ),
        corporateStore: toStoreSummary(
          requestHeader.corporateStore,
          requestHeader.corporateBranch,
        ),
        createdBy: toPersonSummary(
          requestHeader.createdByUser,
          requestHeader.createdByEmployee,
        )!,
        lines: (await loadRequestLineRows(header.issue.requestId)).map((row) => ({
          id: row.line.id,
          itemId: row.line.itemId,
          requestedQuantity: String(row.line.requestedQuantity),
          createdAt: row.line.createdAt.toISOString(),
          updatedAt: row.line.updatedAt.toISOString(),
          item: {
            id: row.item.id,
            itemCode: row.item.itemCode,
            itemName: row.item.itemName,
            isActive: row.item.isActive,
            isRequestable: row.item.isRequestable,
            unit: {
              id: row.unitId,
              unitName: row.unitName,
            },
          },
        })),
      },
      lines: lineRows.map((row) => ({
        id: row.line.id,
        requestLineId: row.line.requestLineId,
        itemId: row.line.itemId,
        issueQuantity: String(row.line.issueQuantity),
        createdAt: row.line.createdAt.toISOString(),
        updatedAt: row.line.updatedAt.toISOString(),
        requestLine: {
          id: row.requestLine.id,
          requestedQuantity: String(row.requestLine.requestedQuantity),
          item: {
            id: row.item.id,
            itemCode: row.item.itemCode,
            itemName: row.item.itemName,
            isActive: row.item.isActive,
            isRequestable: row.item.isRequestable,
            isIssuable: row.item.isIssuable,
            unit: {
              id: row.unitId,
              unitName: row.unitName,
            },
          },
        },
      })),
      availability,
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    mapItemIssueDatabaseError(error);
  }
}

export async function updateItemIssue(
  issueId: string,
  actor: AuthenticatedUser,
  input: UpdateItemIssueInput,
): Promise<ItemIssue> {
  const existing = await getItemIssueById(issueId, actor);
  const supplyingStoreId = existing.request.corporateStore?.id;
  if (!supplyingStoreId || existing.fromStore.id !== supplyingStoreId) {
    throw new AppError(ITEM_ISSUE_OPERATOR_FORBIDDEN_MESSAGE, 403);
  }
  await requireSupplyingStoreChecker(actor, supplyingStoreId);
  if (!existing.canEdit) {
    throw new AppError("This issue cannot be edited.", 403);
  }

  validateIssueLinesAgainstAvailability({
    lines:
      input.lines ??
      existing.lines.map((line) => ({
        requestLineId: line.requestLineId,
        issueQuantity: line.issueQuantity,
      })),
    availability: existing.availability,
  });

  const availabilityByLine = new Map(
    existing.availability.map((line) => [line.requestLineId, line]),
  );

  try {
    await getDb().transaction(async (tx) => {
      const updated = await tx
        .update(itemIssues)
        .set({
          ...(input.remarks !== undefined ? { remarks: input.remarks } : {}),
          version: existing.version + 1,
          updatedAt: sql`now()`,
        })
        .where(
          and(
            eq(itemIssues.id, issueId),
            eq(itemIssues.version, input.expectedVersion),
            eq(itemIssues.status, "DRAFT"),
          ),
        )
        .returning({ id: itemIssues.id });

      if (!updated[0]) {
        throw new AppError(STALE_ISSUE_MESSAGE, 409);
      }

      if (input.lines) {
        await tx
          .delete(itemIssueLines)
          .where(eq(itemIssueLines.itemIssueId, issueId));
        await tx.insert(itemIssueLines).values(
          input.lines.map((line) => {
            const available = availabilityByLine.get(line.requestLineId);
            if (!available) {
              throw new AppError(
                "Issue lines must belong to the selected request.",
                400,
              );
            }
            return {
              itemIssueId: issueId,
              requestLineId: line.requestLineId,
              itemId: available.itemId,
              issueQuantity: line.issueQuantity,
            };
          }),
        );
      }
    });

    return getItemIssueById(issueId, actor);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    mapItemIssueDatabaseError(error);
  }
}

export async function submitItemIssue(
  issueId: string,
  actor: AuthenticatedUser,
  input: { expectedVersion: number },
): Promise<ItemIssue> {
  try {
    await getDb().transaction(async (tx) => {
      const issueRows = await tx
        .select()
        .from(itemIssues)
        .where(eq(itemIssues.id, issueId))
        .for("update");
      const issue = issueRows[0];
      if (!issue) {
        throw new AppError("Item issue not found", 404);
      }
      if (issue.status === "SUBMITTED") {
        throw new AppError("This issue has already been submitted.", 409);
      }
      if (issue.version !== input.expectedVersion) {
        throw new AppError(STALE_ISSUE_MESSAGE, 409);
      }

      const requestRows = await tx
        .select({
          request: itemRequests,
          requestingStore: requestStores,
          corporateStore: corporateStores,
        })
        .from(itemRequests)
        .innerJoin(requestStores, eq(itemRequests.requestingStoreId, requestStores.id))
        .innerJoin(corporateStores, eq(itemRequests.corporateStoreId, corporateStores.id))
        .where(eq(itemRequests.id, issue.requestId))
        .for("update");

      const requestRow = requestRows[0];
      if (!requestRow) {
        throw new AppError("Item request not found", 404);
      }
      if (requestRow.request.status !== "APPROVED") {
        throw new AppError(
          "An item issue can be submitted only while the request is approved.",
          409,
        );
      }
      if (!requestRow.requestingStore.isActive) {
        throw new AppError("The requesting store is inactive.", 409);
      }
      if (!requestRow.corporateStore.isActive) {
        throw new AppError("The supplying store is inactive.", 409);
      }

      await requireSupplyingStoreChecker(actor, requestRow.corporateStore.id);
      if (issue.fromStoreId !== requestRow.corporateStore.id) {
        throw new AppError(ITEM_ISSUE_OPERATOR_FORBIDDEN_MESSAGE, 403);
      }

      const issueLineRows = await tx
        .select({
          requestLineId: itemIssueLines.requestLineId,
          issueQuantity: itemIssueLines.issueQuantity,
        })
        .from(itemIssueLines)
        .where(eq(itemIssueLines.itemIssueId, issueId));

      if (issueLineRows.length === 0) {
        throw new AppError("At least one issue line is required.", 400);
      }

      const requestLineRows = await tx
        .select({
          id: itemRequestLines.id,
          requestedQuantity: itemRequestLines.requestedQuantity,
        })
        .from(itemRequestLines)
        .where(eq(itemRequestLines.itemRequestId, issue.requestId));
      const requestLineMap = new Map(
        requestLineRows.map((line) => [
          line.id,
          parseQuantityToScaled(String(line.requestedQuantity)),
        ]),
      );

      const submittedTotals = await tx
        .select({
          requestLineId: itemIssueLines.requestLineId,
          totalQuantity: sql<string>`coalesce(sum(${itemIssueLines.issueQuantity}), 0)::text`,
        })
        .from(itemIssueLines)
        .innerJoin(itemIssues, eq(itemIssueLines.itemIssueId, itemIssues.id))
        .where(
          and(
            eq(itemIssues.requestId, issue.requestId),
            eq(itemIssues.status, "SUBMITTED"),
            sql`${itemIssues.id} <> ${issueId}`,
          ),
        )
        .groupBy(itemIssueLines.requestLineId);
      const submittedMap = new Map(
        submittedTotals.map((row) => [
          row.requestLineId,
          parseQuantityToScaled(row.totalQuantity),
        ]),
      );

      let positiveLineCount = 0;
      for (const line of issueLineRows) {
        const requested = requestLineMap.get(line.requestLineId);
        if (requested === undefined) {
          throw new AppError("Issue lines must belong to the selected request.", 400);
        }
        const alreadyIssued = submittedMap.get(line.requestLineId) ?? 0n;
        const remaining = requested - alreadyIssued;
        const issueQuantity = parseQuantityToScaled(String(line.issueQuantity));

        if (issueQuantity <= 0n) {
          throw new AppError("Issue quantity must be greater than zero", 400);
        }
        if (issueQuantity > remaining) {
          throw new AppError(
            "One or more issue lines exceed the remaining requested quantity.",
            409,
          );
        }
        positiveLineCount += 1;
      }

      if (positiveLineCount === 0) {
        throw new AppError(
          "At least one line must have an issue quantity greater than zero.",
          400,
        );
      }

      const updated = await tx
        .update(itemIssues)
        .set({
          status: "SUBMITTED",
          submittedByApplicationUserId: actor.id,
          submittedAt: new Date(),
          updatedAt: new Date(),
          version: issue.version + 1,
        })
        .where(
          and(
            eq(itemIssues.id, issueId),
            eq(itemIssues.status, "DRAFT"),
            eq(itemIssues.version, input.expectedVersion),
          ),
        )
        .returning({ id: itemIssues.id });

      if (!updated[0]) {
        throw new AppError(STALE_ISSUE_MESSAGE, 409);
      }
    });

    return getItemIssueById(issueId, actor);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    mapItemIssueDatabaseError(error);
  }
}
