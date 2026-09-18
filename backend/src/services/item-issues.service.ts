import { randomBytes } from "node:crypto";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  lte,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type {
  AuthenticatedUser,
  CreateDepartmentIssueInput,
  CreateItemIssueInput,
  DepartmentConsumptionListItem,
  DepartmentConsumptionListQuery,
  ItemIssue,
  ItemIssueAction,
  ItemIssueEligibility,
  ItemIssueLineAvailability,
  ItemIssueListItem,
  ItemIssueListQuery,
  ItemIssueRequestSummary,
  ItemIssueStatus,
  ItemRequestWorkflowRole,
  PaginatedDepartmentConsumptionResponse,
  PaginatedItemIssueResponse,
  RejectItemIssueInput,
  ReturnItemIssueInput,
  UpdateDepartmentIssueInput,
  UpdateItemIssueInput,
  VerifyItemIssueInput,
} from "@printing-stationery/shared";
import {
  ITEM_ISSUE_ACTIVE_CONFLICT_CODE,
  ITEM_ISSUE_OPEN_STATUSES,
  ITEM_ISSUE_QUEUE_STATUSES,
  itemIssueLineQuantities,
  itemIssueStatusIsEditable,
  itemIssueStatusIsPosted,
  remainingRequestedQuantity,
  requestStatusAllowsItemIssue,
  userHasRole,
} from "@printing-stationery/shared";
import { AppError } from "../utils/errors.js";
import {
  isItemIssueNumberUniqueViolation,
  isItemIssueOpenDuplicateViolation,
  mapItemIssueDatabaseError,
} from "../utils/db-errors.js";
import {
  ADMIN_ITEM_ISSUE_OPERATOR_FORBIDDEN_MESSAGE,
  ADMIN_ITEM_ISSUE_VERIFIER_FORBIDDEN_MESSAGE,
  INELIGIBLE_SUPPLYING_STORE_MESSAGE,
  ITEM_ISSUE_CHECKER_CREATE_FORBIDDEN_MESSAGE,
  ITEM_ISSUE_OPERATOR_FORBIDDEN_MESSAGE,
  ITEM_ISSUE_SELF_VERIFY_FORBIDDEN_MESSAGE,
  ITEM_ISSUE_VERIFIER_FORBIDDEN_MESSAGE,
  NON_CORPORATE_SUPPLYING_STORE_MESSAGE,
  actorMayCreateItemIssue,
  actorMayVerifyItemIssue,
  isEligibleSupplyingStore,
} from "./item-issue-authorization.js";
import { insertItemIssueWorkflowNotifications } from "./item-issue-notifications.js";
import { toRequestedByEmployeeSummary } from "./item-request-requested-by.js";
import {
  getOperationalAvailableQuantities,
  lockStoreStockForUpdate,
  operationalStockKey,
} from "./opening-stocks.service.js";
import { allocateFifoCost, stockLedgerSourceKey } from "./stock-ledger.js";
import { getShipmentDetailForIssue } from "./item-issue-receipts.service.js";
import { getDb } from "../db/client.js";
import {
  applicationUsers,
  userRoles,
  type ApplicationUserRow,
} from "../db/schema/auth.js";
import { branches, type BranchRow } from "../db/schema/branches.js";
import { departments, type DepartmentRow } from "../db/schema/departments.js";
import { employees, type EmployeeRow } from "../db/schema/employees.js";
import {
  itemIssueActions,
  itemIssueLines,
  itemIssues,
  type ItemIssueRow,
} from "../db/schema/item-issues.js";
import {
  departmentConsumptionLines,
  departmentConsumptions,
  itemIssueShipmentLines,
  itemIssueShipments,
} from "../db/schema/item-issue-delivery.js";
import {
  itemRequestActions,
  itemRequestLines,
  itemRequests,
  type ItemRequestRow,
} from "../db/schema/item-requests.js";
import { items, type ItemRow } from "../db/schema/items.js";
import { stockLedger } from "../db/schema/opening-stocks.js";
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
const verifiedByUsers = alias(applicationUsers, "issue_verified_by_users");
const verifiedByEmployees = alias(employees, "issue_verified_by_employees");
const issueDepartments = alias(departments, "issue_departments");
const consumedByEmployees = alias(employees, "issue_consumed_by_employees");
const requestStores = alias(stores, "request_stores");
const requestBranches = alias(branches, "request_branches");
const corporateStores = alias(stores, "request_corporate_stores");
const corporateBranches = alias(branches, "request_corporate_branches");
const requestCreatedByUsers = alias(applicationUsers, "request_created_by_users");
const requestCreatedByEmployees = alias(
  employees,
  "request_created_by_employees",
);
const requestRequestedByEmployees = alias(
  employees,
  "request_requested_by_employees",
);
const requestRequestedByBranches = alias(
  branches,
  "request_requested_by_branches",
);

type StoreAssignmentContext = {
  assignment: {
    id: string;
    storeId: string;
    makerApplicationUserId: string | null;
    supervisorApplicationUserId: string | null;
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

function isMakerUser(actor: AuthenticatedUser): boolean {
  return userHasRole(actor.roles, "MAKER");
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

async function getActiveMakerAssignment(
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
        eq(storeUsers.makerApplicationUserId, applicationUserId),
        eq(storeUsers.storeId, storeId),
        eq(storeUsers.isActive, true),
        eq(stores.isActive, true),
        eq(branches.isActive, true),
      ),
    )
    .limit(1);

  return rows[0];
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

async function listMakerStoreIds(applicationUserId: string): Promise<string[]> {
  const rows = await getDb()
    .select({ storeId: storeUsers.storeId })
    .from(storeUsers)
    .innerJoin(stores, eq(storeUsers.storeId, stores.id))
    .innerJoin(branches, eq(stores.branchId, branches.id))
    .where(
      and(
        eq(storeUsers.makerApplicationUserId, applicationUserId),
        eq(storeUsers.isActive, true),
        eq(stores.isActive, true),
        eq(branches.isActive, true),
      ),
    );

  return rows.map((row) => row.storeId);
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

async function requireSupplyingStoreMaker(
  actor: AuthenticatedUser,
  supplyingStoreId: string,
): Promise<StoreAssignmentContext> {
  if (isAdminUser(actor)) {
    throw new AppError(ADMIN_ITEM_ISSUE_OPERATOR_FORBIDDEN_MESSAGE, 403);
  }
  if (isCheckerUser(actor) && !isMakerUser(actor)) {
    throw new AppError(ITEM_ISSUE_CHECKER_CREATE_FORBIDDEN_MESSAGE, 403);
  }
  if (!isMakerUser(actor)) {
    throw new AppError(ITEM_ISSUE_OPERATOR_FORBIDDEN_MESSAGE, 403);
  }

  await assertActiveParticipant(actor.id, "Maker");
  const assignment = await getActiveMakerAssignment(actor.id, supplyingStoreId);
  if (!assignment) {
    throw new AppError(ITEM_ISSUE_OPERATOR_FORBIDDEN_MESSAGE, 403);
  }

  return assignment;
}

async function requireSupplyingStoreVerifier(
  actor: AuthenticatedUser,
  supplyingStoreId: string,
  createdByApplicationUserId: string,
): Promise<StoreAssignmentContext> {
  if (isAdminUser(actor)) {
    throw new AppError(ADMIN_ITEM_ISSUE_VERIFIER_FORBIDDEN_MESSAGE, 403);
  }
  if (!isCheckerUser(actor)) {
    throw new AppError(ITEM_ISSUE_VERIFIER_FORBIDDEN_MESSAGE, 403);
  }
  if (actor.id === createdByApplicationUserId) {
    throw new AppError(ITEM_ISSUE_SELF_VERIFY_FORBIDDEN_MESSAGE, 403);
  }

  await assertActiveParticipant(actor.id, "Checker");
  const assignment = await getActiveCheckerAssignment(actor.id, supplyingStoreId);
  if (!assignment) {
    throw new AppError(ITEM_ISSUE_VERIFIER_FORBIDDEN_MESSAGE, 403);
  }

  return assignment;
}

function issueActorWorkflowRole(
  actor: AuthenticatedUser,
  kind: "MAKER" | "CHECKER",
  branchType: string,
): ItemRequestWorkflowRole {
  if (isAdminUser(actor)) {
    return "ADMIN";
  }
  const corporate = branchType === "HEAD_OFFICE";
  if (kind === "MAKER") {
    return corporate ? "CORPORATE_MAKER" : "BRANCH_MAKER";
  }
  return corporate ? "CORPORATE_CHECKER" : "BRANCH_CHECKER";
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

async function loadIssueSourceRequest(requestId: string): Promise<{
  request: ItemRequestRow;
  requestingStore: StoreRow;
  requestingBranch: BranchRow;
  corporateStore: StoreRow;
  corporateBranch: BranchRow;
  createdByUser: ApplicationUserRow;
  createdByEmployee: EmployeeRow | null;
  requestedByEmployee: EmployeeRow | null;
  requestedByBranch: BranchRow | null;
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
      requestedByEmployee: requestRequestedByEmployees,
      requestedByBranch: requestRequestedByBranches,
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
    .leftJoin(
      requestRequestedByEmployees,
      eq(itemRequests.requestedByEmployeeId, requestRequestedByEmployees.id),
    )
    .leftJoin(
      requestRequestedByBranches,
      eq(requestRequestedByEmployees.branchId, requestRequestedByBranches.id),
    )
    .where(eq(itemRequests.id, requestId))
    .limit(1);

  const row = rows[0];
  if (!row) {
    throw new AppError("Item request not found", 404);
  }
  if (!row.requestingStore.isActive) {
    throw new AppError("The requesting store is inactive.", 409);
  }
  if (!row.corporateStore.isActive) {
    throw new AppError("The processing store is inactive.", 409);
  }
  if (
    !isEligibleSupplyingStore({
      isActive: row.corporateStore.isActive && row.corporateBranch.isActive,
      allowTransfer: row.corporateStore.allowTransfer,
      underStoreId: row.corporateStore.underStoreId,
      branchType: row.corporateBranch.branchType,
    })
  ) {
    throw new AppError(INELIGIBLE_SUPPLYING_STORE_MESSAGE, 409);
  }

  return row;
}

function assertRequestCanCreateIssue(status: string): void {
  if (!requestStatusAllowsItemIssue(status as "APPROVED" | "PARTIALLY_ISSUED")) {
    throw new AppError(
      "An item issue can be created only from an approved request.",
      409,
    );
  }
}

type PostedIssueTotalOptions = {
  excludeIssueId?: string;
  earlierThanIssue?: {
    id: string;
    verifiedAt: Date | null;
    createdAt: Date;
  };
};

async function loadPostedIssueTotalsByRequestLine(
  requestId: string,
  options?: PostedIssueTotalOptions,
): Promise<Map<string, bigint>> {
  const conditions: SQL[] = [
    eq(itemIssues.requestId, requestId),
    eq(itemIssues.status, "POSTED"),
  ];
  if (options?.excludeIssueId) {
    conditions.push(sql`${itemIssues.id} <> ${options.excludeIssueId}`);
  }
  if (options?.earlierThanIssue) {
    const earlier = options.earlierThanIssue;
    const earlierInstant = earlier.verifiedAt ?? earlier.createdAt;
    conditions.push(
      sql`(
        coalesce(${itemIssues.verifiedAt}, ${itemIssues.createdAt}),
        ${itemIssues.createdAt},
        ${itemIssues.id}
      ) < (
        ${earlierInstant},
        ${earlier.createdAt},
        ${earlier.id}::uuid
      )`,
    );
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
    rows
      .filter((row): row is { requestLineId: string; totalQuantity: string } =>
        Boolean(row.requestLineId),
      )
      .map((row) => [row.requestLineId, parseQuantityToScaled(row.totalQuantity)]),
  );
}

function availabilityFromPostedTotals(params: {
  requestLineRows: RequestLineRow[];
  postedTotals: Map<string, bigint>;
  fromStoreId: string;
  stockByItemUnit: Map<string, string>;
}): ItemIssueLineAvailability[] {
  return params.requestLineRows.map((row) => {
    const requested = parseQuantityToScaled(String(row.line.requestedQuantity));
    const previouslyIssued = params.postedTotals.get(row.line.id) ?? 0n;
    const quantities = itemIssueLineQuantities({
      requestedQuantity: scaledToQuantity(requested),
      previouslyIssuedQuantity: scaledToQuantity(previouslyIssued),
      thisIssueQuantity: "0",
      currentIssuePosted: false,
    });
    const stockKey = operationalStockKey(
      params.fromStoreId,
      row.item.id,
      row.unitId,
    );

    return {
      requestLineId: row.line.id,
      itemId: row.item.id,
      itemCode: row.item.itemCode,
      itemName: row.item.itemName,
      unit: {
        id: row.unitId,
        unitName: row.unitName,
      },
      requestedQuantity: quantities.requestedQuantity,
      previouslyIssuedQuantity: quantities.previouslyIssuedQuantity,
      thisIssueQuantity: quantities.thisIssueQuantity,
      outstandingBeforeThisIssue: quantities.outstandingBeforeThisIssue,
      remainingQuantity: quantities.remainingQuantity,
      remainingAfterIssue: quantities.remainingAfterIssue,
      availableStockQuantity: params.stockByItemUnit.get(stockKey) ?? "0",
      stockBalanceKnown: true,
    };
  });
}

async function buildAvailability(
  requestId: string,
  fromStoreId: string,
  options?: PostedIssueTotalOptions,
): Promise<ItemIssueLineAvailability[]> {
  const [requestLineRows, submittedTotals] = await Promise.all([
    loadRequestLineRows(requestId),
    loadPostedIssueTotalsByRequestLine(requestId, options),
  ]);

  const itemIds = [...new Set(requestLineRows.map((row) => row.item.id))];
  const stockRows = await getOperationalAvailableQuantities({
    storeId: fromStoreId,
    itemIds,
  });
  const stockByItemUnit = new Map(
    stockRows.map((row) => [
      operationalStockKey(row.storeId, row.itemId, row.unitId),
      row.availableQuantity,
    ]),
  );

  return availabilityFromPostedTotals({
    requestLineRows,
    postedTotals: submittedTotals,
    fromStoreId,
    stockByItemUnit,
  });
}

export function canCreateIssueFromAvailability(
  availability: ItemIssueLineAvailability[],
): boolean {
  return availability.some(
    (line) => parseQuantityToScaled(line.remainingQuantity ?? "0") > 0n,
  );
}

export type ActiveItemIssueSummary = {
  id: string;
  issueNumber: string;
  status: ItemIssueStatus;
};

function activeItemIssueConflict(issue: ActiveItemIssueSummary): AppError {
  return new AppError(
    "An open item issue already exists for this request.",
    409,
    {
      details: {
        code: ITEM_ISSUE_ACTIVE_CONFLICT_CODE,
        issueId: issue.id,
        issueNumber: issue.issueNumber,
        status: issue.status,
      },
    },
  );
}

async function loadActiveIssueForRequest(
  requestId: string,
  executor: Pick<ReturnType<typeof getDb>, "select"> = getDb(),
): Promise<ActiveItemIssueSummary | null> {
  const rows = await executor
    .select({
      id: itemIssues.id,
      issueNumber: itemIssues.issueNumber,
      status: itemIssues.status,
    })
    .from(itemIssues)
    .where(
      and(
        eq(itemIssues.requestId, requestId),
        inArray(itemIssues.status, [...ITEM_ISSUE_OPEN_STATUSES]),
      ),
    )
    .orderBy(
      desc(itemIssues.updatedAt),
      desc(itemIssues.createdAt),
      desc(itemIssues.id),
    )
    .limit(1);

  return rows[0] ?? null;
}

export function validateIssueLinesAgainstAvailability(params: {
  lines: Array<{ requestLineId: string | null; issueQuantity: string }>;
  availability: ItemIssueLineAvailability[];
  enforceStock?: boolean;
}): void {
  const availabilityByLine = new Map(
    params.availability.map((line) => [line.requestLineId, line]),
  );

  let positiveLineCount = 0;

  for (const line of params.lines) {
    const available = availabilityByLine.get(line.requestLineId);
    if (!available || !line.requestLineId) {
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

    const remaining = parseQuantityToScaled(
      available.outstandingBeforeThisIssue ||
        available.remainingQuantity ||
        "0",
    );
    if (issueQuantity > remaining) {
        throw new AppError(
          `Quantity exceeds request remainder.`,
          409,
        );
    }

    if (params.enforceStock) {
      const stock = parseQuantityToScaled(available.availableStockQuantity ?? "0");
      if (issueQuantity > stock) {
        throw new AppError(
          `Insufficient Corporate Store stock.`,
          409,
        );
      }
    }

    positiveLineCount += 1;
  }

  if (positiveLineCount === 0) {
    throw new AppError("At least one line must have an issue quantity greater than zero.", 400);
  }
}

async function createDraftWithRetry(
  values: Omit<typeof itemIssues.$inferInsert, "issueNumber">,
  lines: Array<{
    requestLineId: string | null;
    itemId: string;
    issueQuantity: string;
  }>,
  action: {
    actorUserId: string;
    actorWorkflowRole: ItemRequestWorkflowRole;
  },
): Promise<string> {
  let lastError: unknown;

  for (let attempt = 0; attempt < ISSUE_NUMBER_RETRY_ATTEMPTS; attempt += 1) {
    const issueNumber = generateIssueNumber();
    try {
      const createdId = await getDb().transaction(async (tx) => {
        if (values.requestId) {
          const lockedRequest = await tx
            .select({ id: itemRequests.id })
            .from(itemRequests)
            .where(eq(itemRequests.id, values.requestId))
            .for("update");
          if (!lockedRequest[0]) {
            throw new AppError("Item request not found", 404);
          }

          const existing = await loadActiveIssueForRequest(values.requestId, tx);
          if (existing) {
            throw activeItemIssueConflict(existing);
          }
        }

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

        await tx.insert(itemIssueActions).values({
          itemIssueId: created.id,
          action: "CREATE",
          fromStatus: null,
          toStatus: "DRAFT",
          actorApplicationUserId: action.actorUserId,
          actorWorkflowRole: action.actorWorkflowRole,
          remarks: values.remarks ?? null,
        });

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
      if (isItemIssueOpenDuplicateViolation(error) && values.requestId) {
        const existing = await loadActiveIssueForRequest(values.requestId);
        if (existing) {
          throw activeItemIssueConflict(existing);
        }
      }
      mapItemIssueDatabaseError(error);
    }
  }

  throw new AppError("Failed to generate a unique issue number.", 409, {
    cause: lastError,
  });
}

type IssueAccessContext = {
  makerStoreIds: string[];
  supervisedStoreIds: string[];
  visibleStoreIds: string[];
};

async function loadIssueAccessContext(
  actor: AuthenticatedUser,
): Promise<IssueAccessContext> {
  if (isAdminUser(actor)) {
    return { makerStoreIds: [], supervisedStoreIds: [], visibleStoreIds: [] };
  }

  const [makerStoreIds, supervisedStoreIds] = await Promise.all([
    listMakerStoreIds(actor.id),
    listSupervisedStoreIds(actor.id),
  ]);
  const visibleStoreIds = [...new Set([...makerStoreIds, ...supervisedStoreIds])];
  return { makerStoreIds, supervisedStoreIds, visibleStoreIds };
}

function issueVisibilityCondition(
  actor: AuthenticatedUser,
  visibleStoreIds: string[],
): SQL | undefined {
  if (isAdminUser(actor)) {
    return undefined;
  }

  const conditions: SQL[] = [];
  if (visibleStoreIds.length > 0) {
    conditions.push(inArray(itemIssues.fromStoreId, visibleStoreIds));
    conditions.push(
      and(
        eq(itemIssues.status, "POSTED"),
        inArray(itemIssues.toStoreId, visibleStoreIds),
      )!,
    );
  }
  conditions.push(eq(itemRequests.createdByApplicationUserId, actor.id));
  conditions.push(eq(itemRequests.branchCheckerApplicationUserId, actor.id));
  conditions.push(eq(itemRequests.corporateMakerApplicationUserId, actor.id));
  conditions.push(eq(itemRequests.corporateCheckerApplicationUserId, actor.id));
  return or(...conditions);
}

function issueListWhere(
  actor: AuthenticatedUser,
  visibleStoreIds: string[],
  query: ItemIssueListQuery,
): SQL | undefined {
  const conditions: SQL[] = [];
  const visibility = issueVisibilityCondition(actor, visibleStoreIds);
  if (visibility) {
    conditions.push(visibility);
  }

  if (query.queue) {
    conditions.push(
      inArray(itemIssues.status, [...ITEM_ISSUE_QUEUE_STATUSES[query.queue]]),
    );
  } else if (query.status !== "ALL") {
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
  department: issueDepartments,
  consumedByEmployee: consumedByEmployees,
  createdByUser: createdByUsers,
  createdByEmployee: createdByEmployees,
  submittedByUser: submittedByUsers,
  submittedByEmployee: submittedByEmployees,
  verifiedByUser: verifiedByUsers,
  verifiedByEmployee: verifiedByEmployees,
};

function issueHeaderBase() {
  return getDb()
    .select(issueHeaderSelect)
    .from(itemIssues)
    .leftJoin(itemRequests, eq(itemIssues.requestId, itemRequests.id))
    .innerJoin(fromStores, eq(itemIssues.fromStoreId, fromStores.id))
    .innerJoin(fromBranches, eq(fromStores.branchId, fromBranches.id))
    .leftJoin(toStores, eq(itemIssues.toStoreId, toStores.id))
    .leftJoin(toBranches, eq(toStores.branchId, toBranches.id))
    .leftJoin(issueDepartments, eq(itemIssues.departmentId, issueDepartments.id))
    .leftJoin(
      consumedByEmployees,
      eq(itemIssues.consumedByEmployeeId, consumedByEmployees.id),
    )
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
    )
    .leftJoin(
      verifiedByUsers,
      eq(itemIssues.verifiedByApplicationUserId, verifiedByUsers.id),
    )
    .leftJoin(
      verifiedByEmployees,
      eq(verifiedByUsers.employeeId, verifiedByEmployees.id),
    );
}

type IssueHeaderRow = {
  issue: ItemIssueRow;
  request: ItemRequestRow | null;
  fromStore: StoreRow;
  fromBranch: BranchRow;
  toStore: StoreRow | null;
  toBranch: BranchRow | null;
  department: DepartmentRow | null;
  consumedByEmployee: EmployeeRow | null;
  createdByUser: ApplicationUserRow;
  createdByEmployee: EmployeeRow | null;
  submittedByUser: ApplicationUserRow | null;
  submittedByEmployee: EmployeeRow | null;
  verifiedByUser: ApplicationUserRow | null;
  verifiedByEmployee: EmployeeRow | null;
};

function toIssueListItem(
  row: IssueHeaderRow,
  actor: AuthenticatedUser,
  access: IssueAccessContext,
): ItemIssueListItem {
  const createdBy = toPersonSummary(row.createdByUser, row.createdByEmployee)!;
  const submittedBy = toPersonSummary(row.submittedByUser, row.submittedByEmployee);
  const verifiedBy = toPersonSummary(row.verifiedByUser, row.verifiedByEmployee);
  const canCreate = actorMayCreateItemIssue({
    actor,
    supplyingStoreId: row.issue.fromStoreId,
    makerStoreIds: access.makerStoreIds,
  });
  const canVerifyRole = actorMayVerifyItemIssue({
    actor,
    supplyingStoreId: row.issue.fromStoreId,
    supervisedStoreIds: access.supervisedStoreIds,
    createdByApplicationUserId: row.issue.createdByApplicationUserId,
    actorUserId: actor.id,
  });
  const canEdit = itemIssueStatusIsEditable(row.issue.status) && canCreate;
  const pendingVerification = row.issue.status === "PENDING_VERIFICATION";

  return {
    id: row.issue.id,
    issueNumber: row.issue.issueNumber,
    requestId: row.issue.requestId ?? null,
    requestNumber: row.request?.requestNumber ?? null,
    destinationType: row.issue.destinationType,
    deliveryStatus: row.issue.deliveryStatus ?? null,
    status: row.issue.status,
    version: row.issue.version,
    remarks: row.issue.remarks ?? null,
    consumptionDescription: row.issue.consumptionDescription ?? null,
    createdAt: row.issue.createdAt.toISOString(),
    updatedAt: row.issue.updatedAt.toISOString(),
    issueDate: row.issue.issueDate.toISOString(),
    submittedAt: row.issue.submittedAt?.toISOString() ?? null,
    verifiedAt: row.issue.verifiedAt?.toISOString() ?? null,
    returnedAt: row.issue.returnedAt?.toISOString() ?? null,
    rejectedAt: row.issue.rejectedAt?.toISOString() ?? null,
    fromStore: toStoreSummary(row.fromStore, row.fromBranch),
    toStore:
      row.toStore && row.toBranch
        ? toStoreSummary(row.toStore, row.toBranch)
        : null,
    department: row.department
      ? {
          id: row.department.id,
          departmentCode: row.department.departmentCode,
          departmentName: row.department.departmentName,
          isActive: row.department.isActive,
        }
      : null,
    consumedBy: row.consumedByEmployee
      ? {
          id: row.consumedByEmployee.id,
          employeeCode: row.consumedByEmployee.employeeCode,
          employeeName: row.consumedByEmployee.employeeName,
          isActive: row.consumedByEmployee.isActive,
        }
      : null,
    createdBy,
    submittedBy,
    verifiedBy,
    canEdit,
    canSubmit: canEdit,
    canVerify: pendingVerification && canVerifyRole,
    canReturn: pendingVerification && canVerifyRole,
    canReject: pendingVerification && canVerifyRole,
  };
}

function toIssueRequestLines(
  rows: RequestLineRow[],
  postedTotals: Map<string, bigint>,
  availability: ItemIssueLineAvailability[],
) {
  const availabilityByLine = new Map(
    availability.map((line) => [line.requestLineId, line]),
  );

  return rows.map((row) => {
    const available = availabilityByLine.get(row.line.id);
    const requested = parseQuantityToScaled(String(row.line.requestedQuantity));
    const issued = postedTotals.get(row.line.id) ?? 0n;
    return {
      id: row.line.id,
      itemId: row.line.itemId,
      requestedQuantity: String(row.line.requestedQuantity),
      issuedQuantity: scaledToQuantity(issued),
      remainingQuantity: remainingRequestedQuantity(
        scaledToQuantity(requested),
        scaledToQuantity(issued),
      ),
      availableStockQuantity: available?.availableStockQuantity ?? "0",
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
    };
  });
}

async function loadRequestActionRows(requestId: string) {
  const actionActorUsers = alias(applicationUsers, "issue_request_action_users");
  const actionActorEmployees = alias(employees, "issue_request_action_employees");
  const rows = await getDb()
    .select({
      action: itemRequestActions,
      actorUser: actionActorUsers,
      actorEmployee: actionActorEmployees,
    })
    .from(itemRequestActions)
    .innerJoin(
      actionActorUsers,
      eq(itemRequestActions.actorApplicationUserId, actionActorUsers.id),
    )
    .leftJoin(
      actionActorEmployees,
      eq(actionActorUsers.employeeId, actionActorEmployees.id),
    )
    .where(eq(itemRequestActions.itemRequestId, requestId))
    .orderBy(asc(itemRequestActions.createdAt), asc(itemRequestActions.id));

  return rows.map((row) => ({
    id: row.action.id,
    action: row.action.action,
    fromStatus: row.action.fromStatus,
    toStatus: row.action.toStatus,
    actorWorkflowRole: row.action.actorWorkflowRole,
    remarks: row.action.remarks ?? null,
    createdAt: row.action.createdAt.toISOString(),
    actor: toPersonSummary(row.actorUser, row.actorEmployee)!,
  }));
}

async function loadIssueActionRows(issueId: string): Promise<ItemIssueAction[]> {
  const actionActorUsers = alias(applicationUsers, "issue_action_users");
  const actionActorEmployees = alias(employees, "issue_action_employees");
  const rows = await getDb()
    .select({
      action: itemIssueActions,
      actorUser: actionActorUsers,
      actorEmployee: actionActorEmployees,
    })
    .from(itemIssueActions)
    .innerJoin(
      actionActorUsers,
      eq(itemIssueActions.actorApplicationUserId, actionActorUsers.id),
    )
    .leftJoin(
      actionActorEmployees,
      eq(actionActorUsers.employeeId, actionActorEmployees.id),
    )
    .where(eq(itemIssueActions.itemIssueId, issueId))
    .orderBy(asc(itemIssueActions.createdAt), asc(itemIssueActions.id));

  return rows.map((row) => ({
    id: row.action.id,
    action: row.action.action,
    fromStatus: row.action.fromStatus ?? null,
    toStatus: row.action.toStatus,
    actorWorkflowRole: row.action.actorWorkflowRole,
    remarks: row.action.remarks ?? null,
    stockLedgerReferenceId: row.action.stockLedgerReferenceId ?? null,
    createdAt: row.action.createdAt.toISOString(),
    actor: toPersonSummary(row.actorUser, row.actorEmployee)!,
  }));
}

export async function getItemIssueEligibility(
  requestId: string,
  actor: AuthenticatedUser,
): Promise<ItemIssueEligibility> {
  const request = await loadIssueSourceRequest(requestId);
  await requireSupplyingStoreMaker(actor, request.corporateStore.id);
  const availability = await buildAvailability(
    requestId,
    request.corporateStore.id,
  );

  const openIssue = await loadActiveIssueForRequest(requestId);
  const remainingOk = canCreateIssueFromAvailability(availability);
  const statusOk = requestStatusAllowsItemIssue(request.request.status);
  let canCreate = statusOk && remainingOk && !openIssue;
  let reason: string | null = null;
  if (!statusOk) {
    reason = "An item issue can be created only from an approved request.";
    canCreate = false;
  } else if (!remainingOk) {
    reason = "This request has no remaining quantity available for a new issue.";
    canCreate = false;
  } else if (openIssue?.status === "PENDING_VERIFICATION") {
    reason = "An item issue for this request is already pending verification.";
  } else if (openIssue?.status === "RETURNED") {
    reason =
      "A returned item issue already exists for this request. Correct and resubmit it instead of creating a new one.";
  } else if (openIssue?.status === "DRAFT") {
    reason = "A draft item issue already exists for this request.";
  }

  return {
    canCreate,
    reason,
    activeIssue: openIssue,
    draftIssueId:
      openIssue && openIssue.status !== "PENDING_VERIFICATION"
        ? openIssue.id
        : null,
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
      sourceStore: toStoreSummary(
        request.requestingStore,
        request.requestingBranch,
      ),
      destinationStore: toStoreSummary(
        request.corporateStore,
        request.corporateBranch,
      ),
      createdBy: toPersonSummary(
        request.createdByUser,
        request.createdByEmployee,
      )!,
      requestedBy: toRequestedByEmployeeSummary(
        request.requestedByEmployee,
        request.requestedByBranch,
      ),
      lines: toIssueRequestLines(
        await loadRequestLineRows(requestId),
        new Map(
          availability.map((line) => [
            line.requestLineId ?? "",
            parseQuantityToScaled(line.previouslyIssuedQuantity ?? "0"),
          ]),
        ),
        availability,
      ),
      actions: [],
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
  if (eligibility.activeIssue) {
    throw activeItemIssueConflict(eligibility.activeIssue);
  }
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
  if (supplyingStoreId === eligibility.request.requestingStore.id) {
    throw new AppError(
      "Stock cannot be deducted from the Request From Store to fulfil its own request.",
      409,
    );
  }

  const createdId = await createDraftWithRetry(
    {
      requestId,
      fromStoreId: supplyingStoreId,
      toStoreId: eligibility.request.requestingStore.id,
      destinationType: "BRANCH_STORE",
      status: "DRAFT",
      remarks: input.remarks,
      createdByApplicationUserId: actor.id,
      issueDate: new Date(),
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
    {
      actorUserId: actor.id,
      actorWorkflowRole: issueActorWorkflowRole(
        actor,
        "MAKER",
        eligibility.request.corporateStore?.branch.branchType ?? "BRANCH",
      ),
    },
  );

  return getItemIssueById(createdId, actor);
}

export async function listItemIssues(
  actor: AuthenticatedUser,
  query: ItemIssueListQuery,
): Promise<PaginatedItemIssueResponse> {
  const access = await loadIssueAccessContext(actor);
  const where = issueListWhere(actor, access.visibleStoreIds, query);

  try {
    const countBase = getDb()
      .select({ value: count() })
      .from(itemIssues)
      .leftJoin(itemRequests, eq(itemIssues.requestId, itemRequests.id))
      .innerJoin(fromStores, eq(itemIssues.fromStoreId, fromStores.id))
      .leftJoin(toStores, eq(itemIssues.toStoreId, toStores.id));

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
      items: rows.map((row) => toIssueListItem(row, actor, access)),
      page: query.page,
      pageSize: query.pageSize,
      totalItems,
      totalPages,
    };
  } catch (error) {
    mapItemIssueDatabaseError(error);
  }
}

export async function countItemIssuesForQueue(
  actor: AuthenticatedUser,
  queue: NonNullable<ItemIssueListQuery["queue"]>,
): Promise<number> {
  const result = await listItemIssues(actor, {
    page: 1,
    pageSize: 1,
    status: "ALL",
    queue,
  });
  return result.totalItems;
}

export async function getItemIssueById(
  issueId: string,
  actor: AuthenticatedUser,
): Promise<ItemIssue> {
  const access = await loadIssueAccessContext(actor);
  const visibility = issueVisibilityCondition(actor, access.visibleStoreIds);
  const where = visibility
    ? and(eq(itemIssues.id, issueId), visibility)
    : eq(itemIssues.id, issueId);

  try {
    const headerRows = await issueHeaderBase().where(where).limit(1);
    const header = headerRows[0];
    if (!header) {
      throw new AppError("Item issue not found", 404);
    }

    const requestHeader = header.issue.requestId
      ? await loadIssueSourceRequest(header.issue.requestId)
      : null;
    const postedIssue = itemIssueStatusIsPosted(header.issue.status);
    const [lineRows, baseAvailability, requestLineRows, postedTotals, requestActions, issueActions, shipment] =
      await Promise.all([
        getDb()
          .select({
            line: itemIssueLines,
            requestLine: itemRequestLines,
            item: items,
            unitId: units.id,
            unitName: units.unitName,
          })
          .from(itemIssueLines)
          .leftJoin(itemRequestLines, eq(itemIssueLines.requestLineId, itemRequestLines.id))
          .innerJoin(items, eq(itemIssueLines.itemId, items.id))
          .innerJoin(units, eq(items.unitId, units.id))
          .where(eq(itemIssueLines.itemIssueId, issueId))
          .orderBy(asc(items.itemName), asc(items.itemCode), asc(itemIssueLines.id)),
        header.issue.requestId
          ? buildAvailability(header.issue.requestId, header.issue.fromStoreId, {
              excludeIssueId: header.issue.id,
              earlierThanIssue: postedIssue
                ? {
                    id: header.issue.id,
                    verifiedAt: header.issue.verifiedAt,
                    createdAt: header.issue.createdAt,
                  }
                : undefined,
            })
          : Promise.resolve([] as ItemIssueLineAvailability[]),
        header.issue.requestId
          ? loadRequestLineRows(header.issue.requestId)
          : Promise.resolve([]),
        header.issue.requestId
          ? loadPostedIssueTotalsByRequestLine(header.issue.requestId)
          : Promise.resolve(new Map<string, bigint>()),
        header.issue.requestId
          ? loadRequestActionRows(header.issue.requestId)
          : Promise.resolve([]),
        loadIssueActionRows(issueId),
        getShipmentDetailForIssue(issueId, actor, access),
      ]);

    const thisIssueByLine = new Map(
      lineRows
        .filter((row) => row.line.requestLineId)
        .map((row) => [
          row.line.requestLineId as string,
          scaledToQuantity(parseQuantityToScaled(String(row.line.issueQuantity))),
        ]),
    );
    const availability =
      baseAvailability.length > 0
        ? baseAvailability.map((line) => {
            const quantities = itemIssueLineQuantities({
              requestedQuantity: line.requestedQuantity ?? "0",
              previouslyIssuedQuantity: line.previouslyIssuedQuantity ?? "0",
              thisIssueQuantity:
                (line.requestLineId
                  ? thisIssueByLine.get(line.requestLineId)
                  : undefined) ?? "0",
              currentIssuePosted: postedIssue,
            });
            return {
              ...line,
              requestedQuantity: quantities.requestedQuantity,
              previouslyIssuedQuantity: quantities.previouslyIssuedQuantity,
              thisIssueQuantity: quantities.thisIssueQuantity,
              outstandingBeforeThisIssue: quantities.outstandingBeforeThisIssue,
              remainingQuantity: quantities.remainingQuantity,
              remainingAfterIssue: quantities.remainingAfterIssue,
            };
          })
        : lineRows.map((row) => ({
            requestLineId: row.line.requestLineId,
            itemId: row.item.id,
            itemCode: row.item.itemCode,
            itemName: row.item.itemName,
            unit: { id: row.unitId, unitName: row.unitName },
            requestedQuantity: null,
            previouslyIssuedQuantity: null,
            thisIssueQuantity: String(row.line.issueQuantity),
            outstandingBeforeThisIssue: null,
            remainingQuantity: null,
            remainingAfterIssue: null,
            availableStockQuantity: "0",
            stockBalanceKnown: true,
          }));

    const shipmentLinesByIssueLine = new Map(
      (shipment?.lines ?? []).map((line) => [line.itemIssueLineId, line]),
    );

    return {
      ...toIssueListItem(header, actor, access),
      request: requestHeader
        ? {
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
            sourceStore: toStoreSummary(
              requestHeader.requestingStore,
              requestHeader.requestingBranch,
            ),
            destinationStore: toStoreSummary(
              requestHeader.corporateStore,
              requestHeader.corporateBranch,
            ),
            createdBy: toPersonSummary(
              requestHeader.createdByUser,
              requestHeader.createdByEmployee,
            )!,
            requestedBy: toRequestedByEmployeeSummary(
              requestHeader.requestedByEmployee,
              requestHeader.requestedByBranch,
            ),
            lines: toIssueRequestLines(requestLineRows, postedTotals, availability),
            actions: requestActions,
          }
        : null,
      lines: lineRows.map((row) => {
        const shipped = shipmentLinesByIssueLine.get(row.line.id);
        return {
          id: row.line.id,
          requestLineId: row.line.requestLineId,
          itemId: row.line.itemId,
          issueQuantity: String(row.line.issueQuantity),
          createdAt: row.line.createdAt.toISOString(),
          updatedAt: row.line.updatedAt.toISOString(),
          unit: { id: row.unitId, unitName: row.unitName },
          dispatchedQuantity: shipped?.dispatchedQuantity ?? null,
          confirmedReceivedQuantity: shipped?.confirmedReceivedQuantity ?? null,
          remainingInTransitQuantity: shipped?.remainingInTransitQuantity ?? null,
          discrepancyQuantity: shipped?.discrepancyQuantity ?? null,
          requestLine: row.requestLine
            ? {
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
              }
            : null,
        };
      }),
      availability,
      actions: issueActions,
      shipment,
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
  const supplyingStoreId = existing.fromStore.id;
  await requireSupplyingStoreMaker(actor, supplyingStoreId);
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
            inArray(itemIssues.status, ["DRAFT", "RETURNED"]),
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

      await tx.insert(itemIssueActions).values({
        itemIssueId: issueId,
        action: "UPDATE",
        fromStatus: existing.status,
        toStatus: existing.status,
        actorApplicationUserId: actor.id,
        actorWorkflowRole: issueActorWorkflowRole(
          actor,
          "MAKER",
          existing.fromStore.branch.branchType,
        ),
        remarks: input.remarks ?? existing.remarks,
      });
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
    const actorRecord = await assertActiveParticipant(actor.id, "Maker");
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
      if (issue.status === "PENDING_VERIFICATION") {
        throw new AppError("This issue has already been submitted.", 409);
      }
      if (issue.status === "POSTED") {
        throw new AppError(
          issue.destinationType === "CORPORATE_DEPARTMENT"
            ? "This issue has already been issued."
            : "This issue has already been dispatched.",
          409,
        );
      }
      if (issue.status !== "DRAFT" && issue.status !== "RETURNED") {
        throw new AppError(
          "This item issue cannot be submitted from its current status.",
          409,
        );
      }
      if (issue.version !== input.expectedVersion) {
        throw new AppError(STALE_ISSUE_MESSAGE, 409);
      }

      if (issue.destinationType === "CORPORATE_DEPARTMENT") {
        if (!issue.consumptionDescription) {
          throw new AppError("Consumption Description is required.", 400);
        }
        const assignment = await requireSupplyingStoreMaker(actor, issue.fromStoreId);
        const issueLineRows = await tx
          .select({ id: itemIssueLines.id })
          .from(itemIssueLines)
          .where(eq(itemIssueLines.itemIssueId, issueId));
        if (issueLineRows.length === 0) {
          throw new AppError("At least one issue line is required.", 400);
        }

        const updated = await tx
          .update(itemIssues)
          .set({
            status: "PENDING_VERIFICATION",
            submittedByApplicationUserId: actor.id,
            submittedAt: new Date(),
            returnedAt: null,
            updatedAt: new Date(),
            version: issue.version + 1,
          })
          .where(
            and(
              eq(itemIssues.id, issueId),
              inArray(itemIssues.status, ["DRAFT", "RETURNED"]),
              eq(itemIssues.version, input.expectedVersion),
            ),
          )
          .returning({ id: itemIssues.id });
        if (!updated[0]) {
          throw new AppError(STALE_ISSUE_MESSAGE, 409);
        }

        await tx.insert(itemIssueActions).values({
          itemIssueId: issueId,
          action: "SUBMIT",
          fromStatus: issue.status,
          toStatus: "PENDING_VERIFICATION",
          actorApplicationUserId: actor.id,
          actorWorkflowRole: issueActorWorkflowRole(
            actor,
            "MAKER",
            assignment.branch.branchType,
          ),
          remarks: issue.remarks,
        });

        const supervisors = await tx
          .select({
            supervisorApplicationUserId: storeUsers.supervisorApplicationUserId,
          })
          .from(storeUsers)
          .where(
            and(eq(storeUsers.storeId, issue.fromStoreId), eq(storeUsers.isActive, true)),
          );
        const actorName =
          actorRecord.employee.employeeName ?? actorRecord.user.username;
        await insertItemIssueWorkflowNotifications(tx, {
          type: "ITEM_ISSUE_SUBMITTED",
          issueId,
          issueNumber: issue.issueNumber,
          requestNumber: "",
          actorUserId: actor.id,
          actorName,
          remarks: issue.remarks ?? null,
          createdByApplicationUserId: issue.createdByApplicationUserId,
          corporateCheckerApplicationUserId:
            supervisors[0]?.supervisorApplicationUserId ?? null,
          branchMakerApplicationUserId: null,
          branchCheckerApplicationUserId: null,
          extraRecipientIds: supervisors
            .map((row) => row.supervisorApplicationUserId)
            .filter((id): id is string => Boolean(id)),
        });
        return;
      }

      if (!issue.requestId) {
        throw new AppError("Item request not found", 404);
      }

      const requestRows = await tx
        .select({
          request: itemRequests,
          requestingStore: requestStores,
          corporateStore: corporateStores,
          corporateBranch: corporateBranches,
        })
        .from(itemRequests)
        .innerJoin(requestStores, eq(itemRequests.requestingStoreId, requestStores.id))
        .innerJoin(corporateStores, eq(itemRequests.corporateStoreId, corporateStores.id))
        .innerJoin(corporateBranches, eq(corporateStores.branchId, corporateBranches.id))
        .where(eq(itemRequests.id, issue.requestId))
        .for("update");

      const requestRow = requestRows[0];
      if (!requestRow) {
        throw new AppError("Item request not found", 404);
      }
      assertRequestCanCreateIssue(requestRow.request.status);
      if (!requestRow.requestingStore.isActive) {
        throw new AppError("The requesting store is inactive.", 409);
      }
      if (!requestRow.corporateStore.isActive) {
        throw new AppError("The processing store is inactive.", 409);
      }

      await requireSupplyingStoreMaker(actor, requestRow.corporateStore.id);
      if (issue.fromStoreId !== requestRow.corporateStore.id) {
        throw new AppError(ITEM_ISSUE_OPERATOR_FORBIDDEN_MESSAGE, 403);
      }
      if (issue.fromStoreId === requestRow.request.requestingStoreId) {
        throw new AppError(
          "Stock cannot be deducted from the Request From Store to fulfil its own request.",
          409,
        );
      }

      const availability = await buildAvailability(
        issue.requestId,
        issue.fromStoreId,
        { excludeIssueId: issue.id },
      );

      const issueLineRows = await tx
        .select({
          id: itemIssueLines.id,
          requestLineId: itemIssueLines.requestLineId,
          itemId: itemIssueLines.itemId,
          issueQuantity: itemIssueLines.issueQuantity,
        })
        .from(itemIssueLines)
        .where(eq(itemIssueLines.itemIssueId, issueId));

      if (issueLineRows.length === 0) {
        throw new AppError("At least one issue line is required.", 400);
      }

      validateIssueLinesAgainstAvailability({
        lines: issueLineRows.map((line) => ({
          requestLineId: line.requestLineId,
          issueQuantity: String(line.issueQuantity),
        })),
        availability,
      });

      const updated = await tx
        .update(itemIssues)
        .set({
          status: "PENDING_VERIFICATION",
          submittedByApplicationUserId: actor.id,
          submittedAt: new Date(),
          returnedAt: null,
          updatedAt: new Date(),
          version: issue.version + 1,
        })
        .where(
          and(
            eq(itemIssues.id, issueId),
            inArray(itemIssues.status, ["DRAFT", "RETURNED"]),
            eq(itemIssues.version, input.expectedVersion),
          ),
        )
        .returning({ id: itemIssues.id });

      if (!updated[0]) {
        throw new AppError(STALE_ISSUE_MESSAGE, 409);
      }

      await tx.insert(itemIssueActions).values({
        itemIssueId: issueId,
        action: "SUBMIT",
        fromStatus: issue.status,
        toStatus: "PENDING_VERIFICATION",
        actorApplicationUserId: actor.id,
        actorWorkflowRole: issueActorWorkflowRole(
          actor,
          "MAKER",
          requestRow.corporateBranch.branchType,
        ),
        remarks: issue.remarks,
      });

      const actorName =
        actorRecord.employee.employeeName ?? actorRecord.user.username;
      await insertItemIssueWorkflowNotifications(tx, {
        type: "ITEM_ISSUE_SUBMITTED",
        issueId,
        issueNumber: issue.issueNumber,
        requestNumber: requestRow.request.requestNumber,
        actorUserId: actor.id,
        actorName,
        remarks: issue.remarks ?? null,
        createdByApplicationUserId: issue.createdByApplicationUserId,
        corporateCheckerApplicationUserId:
          requestRow.request.corporateCheckerApplicationUserId,
        branchMakerApplicationUserId:
          requestRow.request.createdByApplicationUserId,
        branchCheckerApplicationUserId:
          requestRow.request.branchCheckerApplicationUserId,
      });
    });

    return getItemIssueById(issueId, actor);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    mapItemIssueDatabaseError(error);
  }
}

export async function verifyAndPostItemIssue(
  issueId: string,
  actor: AuthenticatedUser,
  input: VerifyItemIssueInput,
): Promise<ItemIssue> {
  try {
    const actorRecord = await assertActiveParticipant(actor.id, "Checker");
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
      if (issue.status === "POSTED") {
        throw new AppError(
          issue.destinationType === "CORPORATE_DEPARTMENT"
            ? "This issue has already been issued."
            : "This issue has already been dispatched.",
          409,
        );
      }
      if (issue.status !== "PENDING_VERIFICATION") {
        throw new AppError(
          "Only an item issue pending verification can be posted.",
          409,
        );
      }
      if (issue.version !== input.expectedVersion) {
        throw new AppError(STALE_ISSUE_MESSAGE, 409);
      }

      if (issue.destinationType === "CORPORATE_DEPARTMENT") {
        await confirmDepartmentConsumption(tx, {
          issue,
          actor,
          actorRecord,
          input,
        });
        return;
      }

      if (!issue.requestId) {
        throw new AppError("Item request not found", 404);
      }

      const requestRows = await tx
        .select({
          request: itemRequests,
          requestingStore: requestStores,
          corporateStore: corporateStores,
          corporateBranch: corporateBranches,
        })
        .from(itemRequests)
        .innerJoin(requestStores, eq(itemRequests.requestingStoreId, requestStores.id))
        .innerJoin(corporateStores, eq(itemRequests.corporateStoreId, corporateStores.id))
        .innerJoin(corporateBranches, eq(corporateStores.branchId, corporateBranches.id))
        .where(eq(itemRequests.id, issue.requestId))
        .for("update");

      const requestRow = requestRows[0];
      if (!requestRow) {
        throw new AppError("Item request not found", 404);
      }
      assertRequestCanCreateIssue(requestRow.request.status);
      if (!requestRow.requestingStore.isActive) {
        throw new AppError("The requesting store is inactive.", 409);
      }
      if (!requestRow.corporateStore.isActive) {
        throw new AppError("The processing store is inactive.", 409);
      }

      await requireSupplyingStoreVerifier(
        actor,
        requestRow.corporateStore.id,
        issue.createdByApplicationUserId,
      );
      if (issue.fromStoreId !== requestRow.corporateStore.id) {
        throw new AppError(ITEM_ISSUE_VERIFIER_FORBIDDEN_MESSAGE, 403);
      }
      if (issue.fromStoreId === requestRow.request.requestingStoreId) {
        throw new AppError(
          "Stock cannot be deducted from the Request From Store to fulfil its own request.",
          409,
        );
      }

      const issueLineRows = await tx
        .select({
          id: itemIssueLines.id,
          requestLineId: itemIssueLines.requestLineId,
          itemId: itemIssueLines.itemId,
          issueQuantity: itemIssueLines.issueQuantity,
          unitId: units.id,
          purchaseRate: items.purchaseRate,
        })
        .from(itemIssueLines)
        .innerJoin(items, eq(itemIssueLines.itemId, items.id))
        .innerJoin(units, eq(items.unitId, units.id))
        .where(eq(itemIssueLines.itemIssueId, issueId));

      if (issueLineRows.length === 0) {
        throw new AppError("At least one issue line is required.", 400);
      }

      await lockStoreStockForUpdate(
        tx,
        issue.fromStoreId,
        issueLineRows.map((line) => line.itemId),
      );

      const availability = await buildAvailability(
        issue.requestId,
        issue.fromStoreId,
        { excludeIssueId: issue.id },
      );
      const lockedStock = await getOperationalAvailableQuantities(
        {
          storeId: issue.fromStoreId,
          itemIds: issueLineRows.map((line) => line.itemId),
        },
        tx,
      );
      const stockByItemUnit = new Map(
        lockedStock.map((row) => [
          operationalStockKey(row.storeId, row.itemId, row.unitId),
          row.availableQuantity,
        ]),
      );
      const availabilityWithLockedStock = availability.map((line) => {
        const stockKey = operationalStockKey(
          issue.fromStoreId,
          line.itemId,
          line.unit.id,
        );
        return {
          ...line,
          availableStockQuantity: stockByItemUnit.get(stockKey) ?? "0",
          stockBalanceKnown: true,
        };
      });

      validateIssueLinesAgainstAvailability({
        lines: issueLineRows.map((line) => ({
          requestLineId: line.requestLineId ?? "",
          issueQuantity: String(line.issueQuantity),
        })),
        availability: availabilityWithLockedStock,
        enforceStock: true,
      });

      if (!issue.toStoreId) {
        throw new AppError("Destination Branch Store is required.", 400);
      }

      const postedAt = new Date();
      const updated = await tx
        .update(itemIssues)
        .set({
          status: "POSTED",
          deliveryStatus: "IN_TRANSIT",
          verifiedByApplicationUserId: actor.id,
          verifiedAt: postedAt,
          updatedAt: postedAt,
          version: issue.version + 1,
        })
        .where(
          and(
            eq(itemIssues.id, issueId),
            eq(itemIssues.status, "PENDING_VERIFICATION"),
            eq(itemIssues.version, input.expectedVersion),
          ),
        )
        .returning({ id: itemIssues.id });

      if (!updated[0]) {
        throw new AppError(STALE_ISSUE_MESSAGE, 409);
      }

      const ledgerValues = [];
      for (const line of issueLineRows) {
        const fifo = await allocateFifoCost(
          {
            storeId: issue.fromStoreId,
            itemId: line.itemId,
            unitId: line.unitId,
            quantity: String(line.issueQuantity),
          },
          tx,
        );
        for (const allocation of fifo.allocations) {
          ledgerValues.push({
            storeId: issue.fromStoreId,
            itemId: line.itemId,
            unitId: line.unitId,
            rate: allocation.rate,
            movementType: "ITEM_ISSUE" as const,
            stockCategory: "AVAILABLE" as const,
            quantityIn: "0",
            quantityOut: allocation.quantity,
            amountIn: "0",
            amountOut: allocation.amount,
            transactionDate: postedAt,
            referenceType: "ITEM_ISSUE" as const,
            referenceId: issueId,
            referenceLineId: line.id,
            sourceKey: stockLedgerSourceKey({
              referenceType: "ITEM_ISSUE",
              referenceLineId: line.id,
              storeId: issue.fromStoreId,
              movementType: "ITEM_ISSUE",
              stockCategory: "AVAILABLE",
              rate: allocation.rate,
            }),
            postedByApplicationUserId: actor.id,
            postedAt,
          });
        }
      }

      const ledgerRows = await tx
        .insert(stockLedger)
        .values(ledgerValues)
        .returning({ id: stockLedger.id });

      const shipmentRows = await tx
        .insert(itemIssueShipments)
        .values({
          itemIssueId: issueId,
          requestId: issue.requestId,
          fromStoreId: issue.fromStoreId,
          toStoreId: issue.toStoreId,
          deliveryStatus: "IN_TRANSIT",
          dispatchedAt: postedAt,
          dispatchedByApplicationUserId: actor.id,
        })
        .returning({ id: itemIssueShipments.id });
      const shipmentId = shipmentRows[0]?.id;
      if (!shipmentId) {
        throw new AppError("Failed to create in-transit shipment.", 500);
      }

      const shipmentLineRows = await tx
        .insert(itemIssueShipmentLines)
        .values(
          issueLineRows.map((line) => ({
            shipmentId,
            itemIssueLineId: line.id,
            itemId: line.itemId,
            unitId: line.unitId,
            dispatchedQuantity: String(line.issueQuantity),
            confirmedReceivedQuantity: "0",
            remainingInTransitQuantity: String(line.issueQuantity),
            discrepancyQuantity: "0",
          })),
        )
        .returning({
          id: itemIssueShipmentLines.id,
          itemId: itemIssueShipmentLines.itemId,
          unitId: itemIssueShipmentLines.unitId,
          dispatchedQuantity: itemIssueShipmentLines.dispatchedQuantity,
        });

      await tx.insert(stockLedger).values(
        shipmentLineRows.map((line) => ({
          storeId: issue.toStoreId!,
          itemId: line.itemId,
          unitId: line.unitId,
          rate: "0",
          movementType: "ITEM_ISSUE_IN_TRANSIT" as const,
          stockCategory: "IN_TRANSIT" as const,
          quantityIn: String(line.dispatchedQuantity),
          quantityOut: "0",
          amountIn: "0",
          amountOut: "0",
          transactionDate: postedAt,
          referenceType: "ITEM_ISSUE_IN_TRANSIT" as const,
          referenceId: shipmentId,
          referenceLineId: line.id,
          sourceKey: stockLedgerSourceKey({
            referenceType: "ITEM_ISSUE_IN_TRANSIT",
            referenceLineId: line.id,
            storeId: issue.toStoreId!,
            movementType: "ITEM_ISSUE_IN_TRANSIT",
            stockCategory: "IN_TRANSIT",
            rate: "0",
          }),
          postedByApplicationUserId: actor.id,
          postedAt,
        })),
      );

      if (issue.requestId) {
        await applyRequestFulfilmentStatus(tx, issue.requestId);
      }

      await tx.insert(itemIssueActions).values({
        itemIssueId: issueId,
        action: "DISPATCH",
        fromStatus: "PENDING_VERIFICATION",
        toStatus: "POSTED",
        actorApplicationUserId: actor.id,
        actorWorkflowRole: issueActorWorkflowRole(
          actor,
          "CHECKER",
          requestRow.corporateBranch.branchType,
        ),
        remarks: input.remarks,
        stockLedgerReferenceId: ledgerRows[0]?.id ?? null,
      });

      const destinationAssignees = await tx
        .select({
          makerApplicationUserId: storeUsers.makerApplicationUserId,
          supervisorApplicationUserId: storeUsers.supervisorApplicationUserId,
        })
        .from(storeUsers)
        .where(
          and(eq(storeUsers.storeId, issue.toStoreId), eq(storeUsers.isActive, true)),
        );
      const extraRecipientIds = destinationAssignees.flatMap((row) =>
        [row.makerApplicationUserId, row.supervisorApplicationUserId].filter(
          (id): id is string => Boolean(id),
        ),
      );

      const firstLine = issueLineRows[0];
      const itemNameRow = firstLine
        ? await tx
            .select({ itemName: items.itemName, itemCode: items.itemCode, unitName: units.unitName })
            .from(items)
            .innerJoin(units, eq(items.unitId, units.id))
            .where(eq(items.id, firstLine.itemId))
            .limit(1)
        : [];
      const fromStoreName = (
        await tx
          .select({ storeName: stores.storeName })
          .from(stores)
          .where(eq(stores.id, issue.fromStoreId))
          .limit(1)
      )[0]?.storeName ?? "Corporate Store";
      const toStoreName = (
        await tx
          .select({ storeName: stores.storeName })
          .from(stores)
          .where(eq(stores.id, issue.toStoreId))
          .limit(1)
      )[0]?.storeName ?? "Branch Store";
      const qtyLabel = firstLine ? String(firstLine.issueQuantity) : "";
      const itemLabel = itemNameRow[0]
        ? `${qtyLabel} ${itemNameRow[0].unitName} of ${itemNameRow[0].itemName}`
        : `issue ${issue.issueNumber}`;
      const requestPart = requestRow.request.requestNumber
        ? ` against request ${requestRow.request.requestNumber}`
        : "";
      const dispatchMessage = `${fromStoreName} dispatched ${itemLabel} to ${toStoreName}${requestPart}.`;

      const actorName =
        actorRecord.employee.employeeName ?? actorRecord.user.username;
      await insertItemIssueWorkflowNotifications(tx, {
        type: "ITEM_ISSUE_POSTED",
        issueId,
        issueNumber: issue.issueNumber,
        requestNumber: requestRow.request.requestNumber,
        actorUserId: actor.id,
        actorName,
        remarks: input.remarks,
        createdByApplicationUserId: issue.createdByApplicationUserId,
        corporateCheckerApplicationUserId:
          requestRow.request.corporateCheckerApplicationUserId,
        branchMakerApplicationUserId:
          requestRow.request.createdByApplicationUserId,
        branchCheckerApplicationUserId:
          requestRow.request.branchCheckerApplicationUserId,
        extraRecipientIds,
        customMessage: dispatchMessage,
      });
      await insertItemIssueWorkflowNotifications(tx, {
        type: "ITEM_ISSUE_DISPATCHED",
        issueId,
        issueNumber: issue.issueNumber,
        requestNumber: requestRow.request.requestNumber,
        actorUserId: actor.id,
        actorName,
        remarks: input.remarks,
        createdByApplicationUserId: issue.createdByApplicationUserId,
        corporateCheckerApplicationUserId:
          requestRow.request.corporateCheckerApplicationUserId,
        branchMakerApplicationUserId:
          requestRow.request.createdByApplicationUserId,
        branchCheckerApplicationUserId:
          requestRow.request.branchCheckerApplicationUserId,
        extraRecipientIds,
        customMessage: dispatchMessage,
      });
    });

    return getItemIssueById(issueId, actor);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    mapItemIssueDatabaseError(error);
  }
}

export async function returnItemIssue(
  issueId: string,
  actor: AuthenticatedUser,
  input: ReturnItemIssueInput,
): Promise<ItemIssue> {
  return concludePendingIssue(issueId, actor, {
    action: "RETURN",
    toStatus: "RETURNED",
    remarks: input.remarks,
    expectedVersion: input.expectedVersion,
  });
}

export async function rejectItemIssue(
  issueId: string,
  actor: AuthenticatedUser,
  input: RejectItemIssueInput,
): Promise<ItemIssue> {
  return concludePendingIssue(issueId, actor, {
    action: "REJECT",
    toStatus: "REJECTED",
    remarks: input.remarks,
    expectedVersion: input.expectedVersion,
  });
}

async function concludePendingIssue(
  issueId: string,
  actor: AuthenticatedUser,
  params: {
    action: "RETURN" | "REJECT";
    toStatus: "RETURNED" | "REJECTED";
    remarks: string | null;
    expectedVersion: number;
  },
): Promise<ItemIssue> {
  try {
    const actorRecord = await assertActiveParticipant(actor.id, "Checker");
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
      if (issue.status !== "PENDING_VERIFICATION") {
        throw new AppError(
          params.action === "RETURN"
            ? "Only an item issue pending verification can be returned."
            : "Only an item issue pending verification can be rejected.",
          409,
        );
      }
      if (issue.version !== params.expectedVersion) {
        throw new AppError(STALE_ISSUE_MESSAGE, 409);
      }

      if (issue.destinationType === "CORPORATE_DEPARTMENT") {
        await requireSupplyingStoreVerifier(
          actor,
          issue.fromStoreId,
          issue.createdByApplicationUserId,
        );
        const now = new Date();
        const updated = await tx
          .update(itemIssues)
          .set({
            status: params.toStatus,
            returnedAt: params.toStatus === "RETURNED" ? now : issue.returnedAt,
            rejectedAt: params.toStatus === "REJECTED" ? now : issue.rejectedAt,
            updatedAt: now,
            version: issue.version + 1,
          })
          .where(
            and(
              eq(itemIssues.id, issueId),
              eq(itemIssues.status, "PENDING_VERIFICATION"),
              eq(itemIssues.version, params.expectedVersion),
            ),
          )
          .returning({ id: itemIssues.id });
        if (!updated[0]) {
          throw new AppError(STALE_ISSUE_MESSAGE, 409);
        }
        await tx.insert(itemIssueActions).values({
          itemIssueId: issueId,
          action: params.action,
          fromStatus: "PENDING_VERIFICATION",
          toStatus: params.toStatus,
          actorApplicationUserId: actor.id,
          actorWorkflowRole: "CORPORATE_CHECKER",
          remarks: params.remarks,
        });
        const actorName =
          actorRecord.employee.employeeName ?? actorRecord.user.username;
        await insertItemIssueWorkflowNotifications(tx, {
          type:
            params.action === "RETURN"
              ? "ITEM_ISSUE_RETURNED"
              : "ITEM_ISSUE_REJECTED",
          issueId,
          issueNumber: issue.issueNumber,
          requestNumber: "",
          actorUserId: actor.id,
          actorName,
          remarks: params.remarks,
          createdByApplicationUserId: issue.createdByApplicationUserId,
          corporateCheckerApplicationUserId: actor.id,
          branchMakerApplicationUserId: null,
          branchCheckerApplicationUserId: null,
        });
        return;
      }

      if (!issue.requestId) {
        throw new AppError("Item request not found", 404);
      }

      const requestRows = await tx
        .select({
          request: itemRequests,
          corporateStore: corporateStores,
          corporateBranch: corporateBranches,
        })
        .from(itemRequests)
        .innerJoin(corporateStores, eq(itemRequests.corporateStoreId, corporateStores.id))
        .innerJoin(corporateBranches, eq(corporateStores.branchId, corporateBranches.id))
        .where(eq(itemRequests.id, issue.requestId))
        .for("update");
      const requestRow = requestRows[0];
      if (!requestRow) {
        throw new AppError("Item request not found", 404);
      }

      await requireSupplyingStoreVerifier(
        actor,
        requestRow.corporateStore.id,
        issue.createdByApplicationUserId,
      );

      const now = new Date();
      const updated = await tx
        .update(itemIssues)
        .set({
          status: params.toStatus,
          returnedAt: params.toStatus === "RETURNED" ? now : issue.returnedAt,
          rejectedAt: params.toStatus === "REJECTED" ? now : issue.rejectedAt,
          updatedAt: now,
          version: issue.version + 1,
        })
        .where(
          and(
            eq(itemIssues.id, issueId),
            eq(itemIssues.status, "PENDING_VERIFICATION"),
            eq(itemIssues.version, params.expectedVersion),
          ),
        )
        .returning({ id: itemIssues.id });

      if (!updated[0]) {
        throw new AppError(STALE_ISSUE_MESSAGE, 409);
      }

      await tx.insert(itemIssueActions).values({
        itemIssueId: issueId,
        action: params.action,
        fromStatus: "PENDING_VERIFICATION",
        toStatus: params.toStatus,
        actorApplicationUserId: actor.id,
        actorWorkflowRole: issueActorWorkflowRole(
          actor,
          "CHECKER",
          requestRow.corporateBranch.branchType,
        ),
        remarks: params.remarks,
      });

      const actorName =
        actorRecord.employee.employeeName ?? actorRecord.user.username;
      await insertItemIssueWorkflowNotifications(tx, {
        type:
          params.action === "RETURN" ? "ITEM_ISSUE_RETURNED" : "ITEM_ISSUE_REJECTED",
        issueId,
        issueNumber: issue.issueNumber,
        requestNumber: requestRow.request.requestNumber,
        actorUserId: actor.id,
        actorName,
        remarks: params.remarks,
        createdByApplicationUserId: issue.createdByApplicationUserId,
        corporateCheckerApplicationUserId:
          requestRow.request.corporateCheckerApplicationUserId,
        branchMakerApplicationUserId:
          requestRow.request.createdByApplicationUserId,
        branchCheckerApplicationUserId:
          requestRow.request.branchCheckerApplicationUserId,
      });
    });

    return getItemIssueById(issueId, actor);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    mapItemIssueDatabaseError(error);
  }
}

async function applyRequestFulfilmentStatus(
  tx: Pick<ReturnType<typeof getDb>, "select" | "update">,
  requestId: string,
): Promise<void> {
  const requestLineRows = await tx
    .select({
      requestedQuantity: itemRequestLines.requestedQuantity,
    })
    .from(itemRequestLines)
    .where(eq(itemRequestLines.itemRequestId, requestId));

  const postedRows = await tx
    .select({
      totalQuantity: sql<string>`coalesce(sum(${itemIssueLines.issueQuantity}), 0)::text`,
    })
    .from(itemIssueLines)
    .innerJoin(itemIssues, eq(itemIssueLines.itemIssueId, itemIssues.id))
    .where(
      and(eq(itemIssues.requestId, requestId), eq(itemIssues.status, "POSTED")),
    );

  const requested = requestLineRows.reduce(
    (sum, row) => sum + parseQuantityToScaled(String(row.requestedQuantity)),
    0n,
  );
  const issued = parseQuantityToScaled(postedRows[0]?.totalQuantity ?? "0");
  const nextStatus =
    issued <= 0n ? "APPROVED" : issued >= requested ? "ISSUED" : "PARTIALLY_ISSUED";

  await tx
    .update(itemRequests)
    .set({
      status: nextStatus,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(itemRequests.id, requestId),
        inArray(itemRequests.status, ["APPROVED", "PARTIALLY_ISSUED", "ISSUED"]),
      ),
    );
}

async function confirmDepartmentConsumption(
  tx: Pick<
    ReturnType<typeof getDb>,
    "select" | "insert" | "update" | "execute"
  >,
  params: {
    issue: ItemIssueRow;
    actor: AuthenticatedUser;
    actorRecord: Awaited<ReturnType<typeof assertActiveParticipant>>;
    input: VerifyItemIssueInput;
  },
): Promise<void> {
  const { issue, actor, actorRecord, input } = params;
  if (!issue.departmentId || !issue.consumptionDescription) {
    throw new AppError("Consumption Description is required.", 400);
  }
  const departmentRows = await tx
    .select()
    .from(departments)
    .where(eq(departments.id, issue.departmentId))
    .limit(1);
  const department = departmentRows[0];
  if (!department || !department.isActive) {
    throw new AppError("Department is inactive or invalid.", 409);
  }

  await requireSupplyingStoreVerifier(
    actor,
    issue.fromStoreId,
    issue.createdByApplicationUserId,
  );

  const issueLineRows = await tx
    .select({
      id: itemIssueLines.id,
      itemId: itemIssueLines.itemId,
      issueQuantity: itemIssueLines.issueQuantity,
      unitId: units.id,
    })
    .from(itemIssueLines)
    .innerJoin(items, eq(itemIssueLines.itemId, items.id))
    .innerJoin(units, eq(items.unitId, units.id))
    .where(eq(itemIssueLines.itemIssueId, issue.id));
  if (issueLineRows.length === 0) {
    throw new AppError("At least one issue line is required.", 400);
  }

  await lockStoreStockForUpdate(
    tx,
    issue.fromStoreId,
    issueLineRows.map((line) => line.itemId),
  );

  const postedAt = new Date();
  const updated = await tx
    .update(itemIssues)
    .set({
      status: "POSTED",
      verifiedByApplicationUserId: actor.id,
      verifiedAt: postedAt,
      updatedAt: postedAt,
      version: issue.version + 1,
    })
    .where(
      and(
        eq(itemIssues.id, issue.id),
        eq(itemIssues.status, "PENDING_VERIFICATION"),
        eq(itemIssues.version, input.expectedVersion),
      ),
    )
    .returning({ id: itemIssues.id });
  if (!updated[0]) {
    throw new AppError(STALE_ISSUE_MESSAGE, 409);
  }

  const consumptionRows = await tx
    .insert(departmentConsumptions)
    .values({
      itemIssueId: issue.id,
      departmentId: issue.departmentId,
      consumptionDescription: issue.consumptionDescription,
      consumedByEmployeeId: issue.consumedByEmployeeId,
      issueDate: issue.issueDate,
      createdByApplicationUserId: issue.createdByApplicationUserId,
      verifiedByApplicationUserId: actor.id,
    })
    .returning({ id: departmentConsumptions.id });
  const consumptionId = consumptionRows[0]?.id;
  if (!consumptionId) {
    throw new AppError("Failed to record department consumption.", 500);
  }

  const ledgerValues = [];
  for (const line of issueLineRows) {
    const fifo = await allocateFifoCost(
      {
        storeId: issue.fromStoreId,
        itemId: line.itemId,
        unitId: line.unitId,
        quantity: String(line.issueQuantity),
      },
      tx,
    );
    await tx.insert(departmentConsumptionLines).values({
      departmentConsumptionId: consumptionId,
      itemIssueLineId: line.id,
      itemId: line.itemId,
      unitId: line.unitId,
      quantity: String(line.issueQuantity),
      unitCost: fifo.averageRate,
      totalCost: fifo.totalAmount,
    });
    for (const allocation of fifo.allocations) {
      ledgerValues.push({
        storeId: issue.fromStoreId,
        itemId: line.itemId,
        unitId: line.unitId,
        rate: allocation.rate,
        movementType: "DEPARTMENT_CONSUMPTION" as const,
        stockCategory: "AVAILABLE" as const,
        quantityIn: "0",
        quantityOut: allocation.quantity,
        amountIn: "0",
        amountOut: allocation.amount,
        transactionDate: postedAt,
        referenceType: "DEPARTMENT_CONSUMPTION" as const,
        referenceId: issue.id,
        referenceLineId: line.id,
        sourceKey: stockLedgerSourceKey({
          referenceType: "DEPARTMENT_CONSUMPTION",
          referenceLineId: line.id,
          storeId: issue.fromStoreId,
          movementType: "DEPARTMENT_CONSUMPTION",
          stockCategory: "AVAILABLE",
          rate: allocation.rate,
        }),
        postedByApplicationUserId: actor.id,
        postedAt,
      });
    }
  }
  const ledgerRows = await tx.insert(stockLedger).values(ledgerValues).returning({
    id: stockLedger.id,
  });

  await tx.insert(itemIssueActions).values({
    itemIssueId: issue.id,
    action: "ISSUE_TO_DEPARTMENT",
    fromStatus: "PENDING_VERIFICATION",
    toStatus: "POSTED",
    actorApplicationUserId: actor.id,
    actorWorkflowRole: "CORPORATE_CHECKER",
    remarks: input.remarks,
    stockLedgerReferenceId: ledgerRows[0]?.id ?? null,
  });

  await insertItemIssueWorkflowNotifications(tx, {
    type: "ITEM_ISSUE_DEPARTMENT_ISSUED",
    issueId: issue.id,
    issueNumber: issue.issueNumber,
    requestNumber: "",
    actorUserId: actor.id,
    actorName: actorRecord.employee.employeeName ?? actorRecord.user.username,
    remarks: input.remarks,
    createdByApplicationUserId: issue.createdByApplicationUserId,
    corporateCheckerApplicationUserId: actor.id,
    branchMakerApplicationUserId: null,
    branchCheckerApplicationUserId: null,
  });
}

export async function createDepartmentIssue(
  actor: AuthenticatedUser,
  input: CreateDepartmentIssueInput,
): Promise<ItemIssue> {
  const assignment = await requireSupplyingStoreMaker(actor, input.fromStoreId);
  const departmentRows = await getDb()
    .select()
    .from(departments)
    .where(eq(departments.id, input.departmentId))
    .limit(1);
  const department = departmentRows[0];
  if (!department || !department.isActive) {
    throw new AppError("Department is inactive or invalid.", 409);
  }
  if (!input.consumptionDescription.trim()) {
    throw new AppError("Consumption Description is required.", 400);
  }

  const itemIds = [...new Set(input.lines.map((line) => line.itemId))];
  const itemRows = await getDb()
    .select({ item: items })
    .from(items)
    .where(inArray(items.id, itemIds));
  const itemById = new Map(itemRows.map((row) => [row.item.id, row.item]));
  for (const line of input.lines) {
    const item = itemById.get(line.itemId);
    if (!item || !item.isActive || !item.isIssuable) {
      throw new AppError("Items and units must match Item Setup.", 400);
    }
  }

  const createdId = await createDraftWithRetry(
    {
      requestId: null,
      fromStoreId: input.fromStoreId,
      toStoreId: null,
      destinationType: "CORPORATE_DEPARTMENT",
      departmentId: input.departmentId,
      consumedByEmployeeId: input.consumedByEmployeeId ?? null,
      consumptionDescription: input.consumptionDescription,
      status: "DRAFT",
      remarks: input.remarks,
      createdByApplicationUserId: actor.id,
      issueDate: new Date(),
      version: 1,
    },
    input.lines.map((line) => ({
      requestLineId: null,
      itemId: line.itemId,
      issueQuantity: line.issueQuantity,
    })),
    {
      actorUserId: actor.id,
      actorWorkflowRole: issueActorWorkflowRole(
        actor,
        "MAKER",
        assignment.branch.branchType,
      ),
    },
  );
  return getItemIssueById(createdId, actor);
}

export async function updateDepartmentIssue(
  issueId: string,
  actor: AuthenticatedUser,
  input: UpdateDepartmentIssueInput,
): Promise<ItemIssue> {
  const existing = await getItemIssueById(issueId, actor);
  if (existing.destinationType !== "CORPORATE_DEPARTMENT") {
    throw new AppError("This issue is not a department consumption.", 409);
  }
  await requireSupplyingStoreMaker(actor, existing.fromStore.id);
  if (!existing.canEdit) {
    throw new AppError("This issue cannot be edited.", 403);
  }
  if (input.departmentId) {
    const departmentRows = await getDb()
      .select()
      .from(departments)
      .where(eq(departments.id, input.departmentId))
      .limit(1);
    if (!departmentRows[0] || !departmentRows[0].isActive) {
      throw new AppError("Department is inactive or invalid.", 409);
    }
  }
  if (input.lines) {
    const itemIds = [...new Set(input.lines.map((line) => line.itemId))];
    const itemRows = await getDb()
      .select({ item: items })
      .from(items)
      .where(inArray(items.id, itemIds));
    const itemById = new Map(itemRows.map((row) => [row.item.id, row.item]));
    for (const line of input.lines) {
      const item = itemById.get(line.itemId);
      if (!item || !item.isActive || !item.isIssuable) {
        throw new AppError("Items and units must match Item Setup.", 400);
      }
    }
  }

  try {
    await getDb().transaction(async (tx) => {
      const updated = await tx
        .update(itemIssues)
        .set({
          ...(input.departmentId !== undefined
            ? { departmentId: input.departmentId }
            : {}),
          ...(input.consumedByEmployeeId !== undefined
            ? { consumedByEmployeeId: input.consumedByEmployeeId }
            : {}),
          ...(input.consumptionDescription !== undefined
            ? { consumptionDescription: input.consumptionDescription }
            : {}),
          ...(input.remarks !== undefined ? { remarks: input.remarks } : {}),
          version: existing.version + 1,
          updatedAt: sql`now()`,
        })
        .where(
          and(
            eq(itemIssues.id, issueId),
            eq(itemIssues.version, input.expectedVersion),
            inArray(itemIssues.status, ["DRAFT", "RETURNED"]),
          ),
        )
        .returning({ id: itemIssues.id });
      if (!updated[0]) {
        throw new AppError(STALE_ISSUE_MESSAGE, 409);
      }
      if (input.lines) {
        await tx.delete(itemIssueLines).where(eq(itemIssueLines.itemIssueId, issueId));
        await tx.insert(itemIssueLines).values(
          input.lines.map((line) => ({
            itemIssueId: issueId,
            requestLineId: null,
            itemId: line.itemId,
            issueQuantity: line.issueQuantity,
          })),
        );
      }
      await tx.insert(itemIssueActions).values({
        itemIssueId: issueId,
        action: "UPDATE",
        fromStatus: existing.status,
        toStatus: existing.status,
        actorApplicationUserId: actor.id,
        actorWorkflowRole: issueActorWorkflowRole(
          actor,
          "MAKER",
          existing.fromStore.branch.branchType,
        ),
        remarks: input.remarks ?? existing.remarks,
      });
    });
    return getItemIssueById(issueId, actor);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    mapItemIssueDatabaseError(error);
  }
}

export async function listDepartmentConsumptions(
  actor: AuthenticatedUser,
  query: DepartmentConsumptionListQuery,
): Promise<PaginatedDepartmentConsumptionResponse> {
  const access = await loadIssueAccessContext(actor);
  const conditions: SQL[] = [eq(itemIssues.status, "POSTED")];
  if (!isAdminUser(actor) && access.visibleStoreIds.length > 0) {
    conditions.push(inArray(itemIssues.fromStoreId, access.visibleStoreIds));
  } else if (!isAdminUser(actor)) {
    return {
      items: [],
      page: query.page,
      pageSize: query.pageSize,
      totalItems: 0,
      totalPages: 0,
    };
  }
  if (query.departmentId) {
    conditions.push(eq(departmentConsumptions.departmentId, query.departmentId));
  }
  if (query.consumedByEmployeeId) {
    conditions.push(
      eq(departmentConsumptions.consumedByEmployeeId, query.consumedByEmployeeId),
    );
  }
  if (query.issuedByUserId) {
    conditions.push(
      eq(departmentConsumptions.verifiedByApplicationUserId, query.issuedByUserId),
    );
  }
  if (query.fromDate) {
    conditions.push(gte(departmentConsumptions.issueDate, new Date(query.fromDate)));
  }
  if (query.toDate) {
    conditions.push(lte(departmentConsumptions.issueDate, new Date(query.toDate)));
  }
  if (query.itemId) {
    conditions.push(
      sql`exists (
        select 1 from ${departmentConsumptionLines}
        where ${departmentConsumptionLines.departmentConsumptionId} = ${departmentConsumptions.id}
          and ${departmentConsumptionLines.itemId} = ${query.itemId}
      )`,
    );
  }
  if (query.search) {
    const pattern = `%${escapeIlikePattern(query.search)}%`;
    conditions.push(sql`${itemIssues.issueNumber} ILIKE ${pattern} ESCAPE '\\'`);
  }
  const where = and(...conditions);
  const totalItems =
    (
      await getDb()
        .select({ value: count() })
        .from(departmentConsumptions)
        .innerJoin(itemIssues, eq(departmentConsumptions.itemIssueId, itemIssues.id))
        .where(where)
    )[0]?.value ?? 0;
  const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / query.pageSize);
  const rows = await getDb()
    .select({
      consumption: departmentConsumptions,
      issue: itemIssues,
      department: departments,
      consumedBy: employees,
      createdByUser: createdByUsers,
      createdByEmployee: createdByEmployees,
      verifiedByUser: verifiedByUsers,
      verifiedByEmployee: verifiedByEmployees,
    })
    .from(departmentConsumptions)
    .innerJoin(itemIssues, eq(departmentConsumptions.itemIssueId, itemIssues.id))
    .innerJoin(departments, eq(departmentConsumptions.departmentId, departments.id))
    .leftJoin(employees, eq(departmentConsumptions.consumedByEmployeeId, employees.id))
    .innerJoin(
      createdByUsers,
      eq(departmentConsumptions.createdByApplicationUserId, createdByUsers.id),
    )
    .leftJoin(createdByEmployees, eq(createdByUsers.employeeId, createdByEmployees.id))
    .innerJoin(
      verifiedByUsers,
      eq(departmentConsumptions.verifiedByApplicationUserId, verifiedByUsers.id),
    )
    .leftJoin(
      verifiedByEmployees,
      eq(verifiedByUsers.employeeId, verifiedByEmployees.id),
    )
    .where(where)
    .orderBy(desc(departmentConsumptions.issueDate), desc(departmentConsumptions.id))
    .limit(query.pageSize)
    .offset((query.page - 1) * query.pageSize);

  const consumptionIds = rows.map((row) => row.consumption.id);
  const lineRows =
    consumptionIds.length === 0
      ? []
      : await getDb()
          .select({
            line: departmentConsumptionLines,
            itemCode: items.itemCode,
            itemName: items.itemName,
            unitName: units.unitName,
          })
          .from(departmentConsumptionLines)
          .innerJoin(items, eq(departmentConsumptionLines.itemId, items.id))
          .innerJoin(units, eq(departmentConsumptionLines.unitId, units.id))
          .where(
            inArray(departmentConsumptionLines.departmentConsumptionId, consumptionIds),
          );

  const itemsOut: DepartmentConsumptionListItem[] = rows.map((row) => {
    const lines = lineRows
      .filter((line) => line.line.departmentConsumptionId === row.consumption.id)
      .map((line) => ({
        id: line.line.id,
        itemId: line.line.itemId,
        itemCode: line.itemCode,
        itemName: line.itemName,
        unit: { id: line.line.unitId, unitName: line.unitName },
        quantity: String(line.line.quantity),
        unitCost: String(line.line.unitCost),
        totalCost: String(line.line.totalCost),
      }));
    const quantityConsumed = lines.reduce(
      (sum, line) => sum + parseQuantityToScaled(line.quantity),
      0n,
    );
    const totalValue = lines.reduce(
      (sum, line) => sum + parseQuantityToScaled(line.totalCost),
      0n,
    );
    return {
      id: row.consumption.id,
      itemIssueId: row.issue.id,
      issueNumber: row.issue.issueNumber,
      issueDate: row.consumption.issueDate.toISOString(),
      department: {
        id: row.department.id,
        departmentCode: row.department.departmentCode,
        departmentName: row.department.departmentName,
        isActive: row.department.isActive,
      },
      consumptionDescription: row.consumption.consumptionDescription,
      consumedBy: row.consumedBy
        ? {
            id: row.consumedBy.id,
            employeeCode: row.consumedBy.employeeCode,
            employeeName: row.consumedBy.employeeName,
            isActive: row.consumedBy.isActive,
          }
        : null,
      createdBy: toPersonSummary(row.createdByUser, row.createdByEmployee)!,
      verifiedBy: toPersonSummary(row.verifiedByUser, row.verifiedByEmployee)!,
      quantityConsumed: scaledToQuantity(quantityConsumed),
      totalConsumptionValue: scaledToQuantity(totalValue),
      lines,
    };
  });

  return {
    items: itemsOut,
    page: query.page,
    pageSize: query.pageSize,
    totalItems,
    totalPages,
  };
}
