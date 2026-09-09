import { randomBytes } from "node:crypto";
import {
  and,
  asc,
  count,
  desc,
  eq,
  exists,
  inArray,
  isNull,
  notInArray,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type {
  AuthenticatedUser,
  CreateItemRequestInput,
  EligibleItemRequestItem,
  EligibleItemRequestItemListQuery,
  EligibleItemRequestStoreListQuery,
  ItemRequest,
  ItemRequestActionInput,
  ItemRequestActionType,
  ItemRequestContext,
  ItemRequestLineInput,
  ItemRequestListItem,
  ItemRequestListQuery,
  ItemRequestPersonSummary,
  ItemRequestRequestedByEmployee,
  ItemRequestStatus,
  ItemRequestStoreSummary,
  PaginatedEligibleItemRequestItemResponse,
  PaginatedEligibleItemRequestStoreResponse,
  PaginatedItemRequestResponse,
  UpdateItemRequestInput,
} from "@printing-stationery/shared";
import {
  ITEM_REQUEST_QUEUE_STATUSES,
  userHasRole,
} from "@printing-stationery/shared";
import { getDb } from "../db/client.js";
import {
  applicationUsers,
  userRoles,
  type ApplicationUserRow,
} from "../db/schema/auth.js";
import { branches, type BranchRow } from "../db/schema/branches.js";
import { employees, type EmployeeRow } from "../db/schema/employees.js";
import { items } from "../db/schema/items.js";
import {
  itemRequestActions,
  itemRequestLines,
  itemRequests,
  type ItemRequestRow,
} from "../db/schema/item-requests.js";
import { itemIssueLines, itemIssues } from "../db/schema/item-issues.js";
import { stores, type StoreRow } from "../db/schema/stores.js";
import { storeUsers } from "../db/schema/store-users.js";
import { units } from "../db/schema/units.js";
import { AppError } from "../utils/errors.js";
import {
  isItemRequestNumberUniqueViolation,
  mapItemRequestDatabaseError,
} from "../utils/db-errors.js";
import {
  actorMayOperateItemIssue,
  isEligibleSupplyingStore,
  requestAllowsItemIssueCreation,
} from "./item-issue-authorization.js";
import {
  INACTIVE_REQUESTED_BY_MESSAGE,
  UNKNOWN_REQUESTED_BY_MESSAGE,
  canSelectRequestedByEmployee,
  resolveRequestedByEmployeeId,
  toRequestedByEmployeeSummary,
} from "./item-request-requested-by.js";
import {
  getOperationalAvailableQuantities,
  operationalStockKey,
} from "./opening-stocks.service.js";

const REQUEST_NUMBER_RETRY_ATTEMPTS = 5;
const STALE_REQUEST_MESSAGE =
  "This request has changed. Refresh and try again.";
const INVALID_TRANSITION_MESSAGE =
  "This action is not allowed for the current request status.";
const ADMIN_WORKFLOW_MESSAGE =
  "Administrators can create and submit requests on behalf of a receiving store, but cannot recommend, forward, approve, or reject them.";
const CORPORATE_MISSING_MESSAGE =
  "Corporate Store routing is not configured. Contact an administrator.";
const CORPORATE_AMBIGUOUS_MESSAGE =
  "Corporate Store routing is ambiguous. Contact an administrator.";
const CORPORATE_SETUP_MESSAGE =
  "The supplying store does not have an active maker and checker assignment.";
const SAME_STORE_MESSAGE =
  "Request From Store and Request To Store must be different.";
const INACTIVE_DESTINATION_MESSAGE = "The receiving store is inactive.";
const INACTIVE_SOURCE_MESSAGE = "The supplying store is inactive.";
const INELIGIBLE_SOURCE_MESSAGE =
  "The supplying store is not allowed to transfer or issue stock.";
const NO_ASSIGNMENT_MESSAGE =
  "You can create a request only when you are an active maker of a store.";
const UNAUTHORIZED_DESTINATION_MESSAGE =
  "You can create a request only for your assigned store.";
const DESTINATION_SETUP_MESSAGE =
  "The receiving store does not have an active maker and checker assignment.";
const SOURCE_REQUIRED_MESSAGE = "Request From Store is required.";

type ActorKind =
  | "BRANCH_MAKER"
  | "BRANCH_CHECKER"
  | "CORPORATE_MAKER"
  | "CORPORATE_CHECKER";

type WorkflowTransition = {
  from: ItemRequestStatus;
  action: ItemRequestActionType;
  to: ItemRequestStatus;
  actor: ActorKind;
};

const WORKFLOW_TRANSITIONS: readonly WorkflowTransition[] = [
  {
    from: "DRAFT",
    action: "SUBMIT",
    to: "PENDING_BRANCH_CHECKER",
    actor: "BRANCH_MAKER",
  },
  {
    from: "DRAFT",
    action: "CANCEL",
    to: "CANCELLED",
    actor: "BRANCH_MAKER",
  },
  {
    from: "RETURNED_TO_BRANCH_MAKER",
    action: "RESUBMIT",
    to: "PENDING_BRANCH_CHECKER",
    actor: "BRANCH_MAKER",
  },
  {
    from: "RETURNED_TO_BRANCH_MAKER",
    action: "CANCEL",
    to: "CANCELLED",
    actor: "BRANCH_MAKER",
  },
  {
    from: "PENDING_BRANCH_CHECKER",
    action: "RECOMMEND",
    to: "PENDING_CORPORATE_MAKER",
    actor: "BRANCH_CHECKER",
  },
  {
    from: "PENDING_BRANCH_CHECKER",
    action: "RETURN",
    to: "RETURNED_TO_BRANCH_MAKER",
    actor: "BRANCH_CHECKER",
  },
  {
    from: "PENDING_CORPORATE_MAKER",
    action: "FORWARD",
    to: "PENDING_CORPORATE_CHECKER",
    actor: "CORPORATE_MAKER",
  },
  {
    from: "PENDING_CORPORATE_MAKER",
    action: "RETURN",
    to: "RETURNED_TO_BRANCH_MAKER",
    actor: "CORPORATE_MAKER",
  },
  {
    from: "PENDING_CORPORATE_CHECKER",
    action: "APPROVE",
    to: "APPROVED",
    actor: "CORPORATE_CHECKER",
  },
  {
    from: "PENDING_CORPORATE_CHECKER",
    action: "RETURN",
    to: "RETURNED_TO_CORPORATE_MAKER",
    actor: "CORPORATE_CHECKER",
  },
  {
    from: "PENDING_CORPORATE_CHECKER",
    action: "REJECT",
    to: "REJECTED",
    actor: "CORPORATE_CHECKER",
  },
  {
    from: "RETURNED_TO_CORPORATE_MAKER",
    action: "FORWARD",
    to: "PENDING_CORPORATE_CHECKER",
    actor: "CORPORATE_MAKER",
  },
  {
    from: "RETURNED_TO_CORPORATE_MAKER",
    action: "RETURN",
    to: "RETURNED_TO_BRANCH_MAKER",
    actor: "CORPORATE_MAKER",
  },
];

const requestingStores = alias(stores, "requesting_stores");
const requestingBranches = alias(branches, "requesting_branches");
const corporateStores = alias(stores, "corporate_stores");
const corporateBranches = alias(branches, "corporate_branches");
const createdByUsers = alias(applicationUsers, "created_by_users");
const createdByEmployees = alias(employees, "created_by_employees");
const requestedByEmployees = alias(employees, "requested_by_employees");
const requestedByBranches = alias(branches, "requested_by_branches");
const branchCheckerUsers = alias(applicationUsers, "branch_checker_users");
const branchCheckerEmployees = alias(employees, "branch_checker_employees");
const corporateMakerUsers = alias(applicationUsers, "corporate_maker_users");
const corporateMakerEmployees = alias(employees, "corporate_maker_employees");
const corporateCheckerUsers = alias(
  applicationUsers,
  "corporate_checker_users",
);
const corporateCheckerEmployees = alias(
  employees,
  "corporate_checker_employees",
);
const searchItems = alias(items, "search_items");
const searchLines = alias(itemRequestLines, "search_lines");

type CorporateStoreResolution =
  | {
      status: "OK";
      store: StoreRow;
      branch: BranchRow;
    }
  | { status: "MISSING" }
  | { status: "AMBIGUOUS" };

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

function escapeIlikePattern(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function isAdminUser(actor: AuthenticatedUser): boolean {
  return userHasRole(actor.roles, "ADMIN");
}

function generateRequestNumber(): string {
  const now = new Date();
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");
  const token = randomBytes(4).toString("hex").toUpperCase();
  return `IR-${year}${month}${day}-${token}`;
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

function pendingPersonForStatus(params: {
  status: ItemRequestStatus;
  createdBy: ItemRequestPersonSummary | null;
  branchChecker: ItemRequestPersonSummary | null;
  corporateMaker: ItemRequestPersonSummary | null;
  corporateChecker: ItemRequestPersonSummary | null;
}): ItemRequestPersonSummary | null {
  switch (params.status) {
    case "DRAFT":
    case "RETURNED_TO_BRANCH_MAKER":
      return params.createdBy;
    case "PENDING_BRANCH_CHECKER":
      return params.branchChecker;
    case "PENDING_CORPORATE_MAKER":
    case "RETURNED_TO_CORPORATE_MAKER":
      return params.corporateMaker;
    case "PENDING_CORPORATE_CHECKER":
      return params.corporateChecker;
    default:
      return null;
  }
}

function actorMatchesKind(
  request: ItemRequestRow,
  actor: AuthenticatedUser,
  kind: ActorKind,
): boolean {
  switch (kind) {
    case "BRANCH_MAKER":
      return request.createdByApplicationUserId === actor.id;
    case "BRANCH_CHECKER":
      return request.branchCheckerApplicationUserId === actor.id;
    case "CORPORATE_MAKER":
      return request.corporateMakerApplicationUserId === actor.id;
    case "CORPORATE_CHECKER":
      return request.corporateCheckerApplicationUserId === actor.id;
    default:
      return false;
  }
}

function computeAllowedActions(
  request: ItemRequestRow,
  actor: AuthenticatedUser,
): ItemRequestActionType[] {
  return WORKFLOW_TRANSITIONS.filter((transition) => {
    if (transition.from !== request.status) {
      return false;
    }
    if (isAdminUser(actor)) {
      return (
        transition.actor === "BRANCH_MAKER" &&
        request.createdByApplicationUserId === actor.id
      );
    }
    return actorMatchesKind(request, actor, transition.actor);
  }).map((transition) => transition.action);
}

function canEditRequest(
  request: ItemRequestRow,
  actor: AuthenticatedUser,
): boolean {
  return (
    request.createdByApplicationUserId === actor.id &&
    (request.status === "DRAFT" || request.status === "RETURNED_TO_BRANCH_MAKER")
  );
}

function parseQuantityToScaled(value: string): bigint {
  const trimmed = value.trim();
  if (!/^-?\d+(?:\.\d{1,4})?$/.test(trimmed)) {
    return 0n;
  }
  const negative = trimmed.startsWith("-");
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const [wholePart = "0", fractionPart = ""] = unsigned.split(".");
  const normalizedWhole = wholePart.replace(/^0+(?=\d)/, "") || "0";
  const normalizedFraction = fractionPart.padEnd(4, "0");
  const scaled =
    BigInt(normalizedWhole) * 10_000n + BigInt(normalizedFraction);
  return negative ? -scaled : scaled;
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

async function loadSubmittedIssueTotalsByRequestLine(
  requestId: string,
): Promise<Map<string, bigint>> {
  const rows = await getDb()
    .select({
      requestLineId: itemIssueLines.requestLineId,
      totalQuantity: sql<string>`coalesce(sum(${itemIssueLines.issueQuantity}), 0)::text`,
    })
    .from(itemIssueLines)
    .innerJoin(itemIssues, eq(itemIssueLines.itemIssueId, itemIssues.id))
    .where(
      and(
        eq(itemIssues.requestId, requestId),
        eq(itemIssues.status, "SUBMITTED"),
      ),
    )
    .groupBy(itemIssueLines.requestLineId);

  return new Map(
    rows.map((row) => [row.requestLineId, parseQuantityToScaled(row.totalQuantity)]),
  );
}

async function resolveCorporateStore(): Promise<CorporateStoreResolution> {
  const rows = await getDb()
    .select({
      store: stores,
      branch: branches,
    })
    .from(stores)
    .innerJoin(branches, eq(stores.branchId, branches.id))
    .where(
      and(
        eq(stores.isActive, true),
        eq(branches.isActive, true),
        eq(branches.branchType, "HEAD_OFFICE"),
        isNull(stores.underStoreId),
      ),
    )
    .limit(2);

  if (rows.length === 0) {
    return { status: "MISSING" };
  }

  if (rows.length > 1) {
    return { status: "AMBIGUOUS" };
  }

  return {
    status: "OK",
    store: rows[0]!.store,
    branch: rows[0]!.branch,
  };
}

async function getActiveMakerAssignment(
  applicationUserId: string,
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
    .innerJoin(
      applicationUsers,
      eq(storeUsers.makerApplicationUserId, applicationUsers.id),
    )
    .innerJoin(employees, eq(applicationUsers.employeeId, employees.id))
    .where(
      and(
        eq(storeUsers.makerApplicationUserId, applicationUserId),
        eq(storeUsers.isActive, true),
        eq(stores.isActive, true),
        eq(employees.branchId, stores.branchId),
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
    .where(
      and(
        eq(storeUsers.supervisorApplicationUserId, applicationUserId),
        eq(storeUsers.isActive, true),
        eq(stores.isActive, true),
      ),
    );

  return rows.map((row) => row.storeId);
}

async function getActiveStoreAssignmentByStoreId(
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
        eq(storeUsers.storeId, storeId),
        eq(storeUsers.isActive, true),
        eq(stores.isActive, true),
      ),
    )
    .limit(1);

  return rows[0];
}

async function loadStoreWithBranch(
  storeId: string,
): Promise<{ store: StoreRow; branch: BranchRow } | undefined> {
  const rows = await getDb()
    .select({
      store: stores,
      branch: branches,
    })
    .from(stores)
    .innerJoin(branches, eq(stores.branchId, branches.id))
    .where(eq(stores.id, storeId))
    .limit(1);

  return rows[0];
}

function storeIsEligibleSupplying(store: StoreRow, branch: BranchRow): boolean {
  return isEligibleSupplyingStore({
    isActive: store.isActive && branch.isActive,
    allowTransfer: store.allowTransfer,
    underStoreId: store.underStoreId,
    branchType: branch.branchType,
  });
}

function supplyingStoreEligibilityCondition(): SQL {
  const transferOrCorporate = or(
    eq(stores.allowTransfer, true),
    and(eq(branches.branchType, "HEAD_OFFICE"), isNull(stores.underStoreId)),
  );
  return and(
    eq(stores.isActive, true),
    eq(branches.isActive, true),
    transferOrCorporate,
  )!;
}

async function listActiveStoreSummaries(params?: {
  supplyingOnly?: boolean;
}): Promise<ItemRequestStoreSummary[]> {
  const where = params?.supplyingOnly
    ? supplyingStoreEligibilityCondition()
    : and(eq(stores.isActive, true), eq(branches.isActive, true));

  const rows = await getDb()
    .select({
      store: stores,
      branch: branches,
    })
    .from(stores)
    .innerJoin(branches, eq(stores.branchId, branches.id))
    .where(where)
    .orderBy(asc(stores.storeName), asc(stores.storeCode), asc(stores.id));

  return rows.map((row) => toStoreSummary(row.store, row.branch));
}

async function assertStorePairForRequest(params: {
  sourceStoreId: string;
  destinationStoreId: string;
}): Promise<{
  source: { store: StoreRow; branch: BranchRow };
  destination: { store: StoreRow; branch: BranchRow };
}> {
  if (params.sourceStoreId === params.destinationStoreId) {
    throw new AppError(SAME_STORE_MESSAGE, 400);
  }

  const [source, destination] = await Promise.all([
    loadStoreWithBranch(params.sourceStoreId),
    loadStoreWithBranch(params.destinationStoreId),
  ]);

  if (!source || !source.store.isActive || !source.branch.isActive) {
    throw new AppError(INACTIVE_SOURCE_MESSAGE, 400);
  }
  if (!destination || !destination.store.isActive || !destination.branch.isActive) {
    throw new AppError(INACTIVE_DESTINATION_MESSAGE, 400);
  }
  if (!storeIsEligibleSupplying(source.store, source.branch)) {
    throw new AppError(INELIGIBLE_SOURCE_MESSAGE, 400);
  }

  return { source, destination };
}

async function resolveCreateStorePair(
  actor: AuthenticatedUser,
  input: { sourceStoreId: string; destinationStoreId: string },
): Promise<{ sourceStoreId: string; destinationStoreId: string }> {
  if (isAdminUser(actor)) {
    await assertStorePairForRequest(input);
    return input;
  }

  const assignment = await getActiveMakerAssignment(actor.id);
  if (!assignment) {
    throw new AppError(NO_ASSIGNMENT_MESSAGE, 403);
  }

  if (input.destinationStoreId !== assignment.store.id) {
    throw new AppError(UNAUTHORIZED_DESTINATION_MESSAGE, 403);
  }

  await assertStorePairForRequest({
    sourceStoreId: input.sourceStoreId,
    destinationStoreId: assignment.store.id,
  });

  return {
    sourceStoreId: input.sourceStoreId,
    destinationStoreId: assignment.store.id,
  };
}

async function loadRequestedBySummaryById(
  employeeId: string | null | undefined,
): Promise<ItemRequestRequestedByEmployee | null> {
  if (!employeeId) {
    return null;
  }

  const rows = await getDb()
    .select({
      employee: employees,
      branch: branches,
    })
    .from(employees)
    .innerJoin(branches, eq(employees.branchId, branches.id))
    .where(eq(employees.id, employeeId))
    .limit(1);

  return toRequestedByEmployeeSummary(rows[0]?.employee, rows[0]?.branch);
}

async function resolveRequestedByForSave(
  actor: AuthenticatedUser,
  requestedByEmployeeId: string | undefined,
): Promise<string> {
  const resolved = resolveRequestedByEmployeeId({
    actor,
    requestedByEmployeeId,
  });
  if (!resolved.ok) {
    throw new AppError(resolved.message, resolved.status);
  }

  const summary = await loadRequestedBySummaryById(resolved.employeeId);
  if (!summary) {
    throw new AppError(UNKNOWN_REQUESTED_BY_MESSAGE, 400);
  }
  if (!summary.isActive) {
    throw new AppError(INACTIVE_REQUESTED_BY_MESSAGE, 400);
  }

  return summary.id;
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

async function loadActiveSupplyingStoreSetup(storeId: string): Promise<{
  store: StoreRow;
  branch: BranchRow;
  makerApplicationUserId: string;
  supervisorApplicationUserId: string;
}> {
  const loaded = await loadStoreWithBranch(storeId);
  if (!loaded || !loaded.store.isActive || !loaded.branch.isActive) {
    throw new AppError(INACTIVE_SOURCE_MESSAGE, 400);
  }
  if (!storeIsEligibleSupplying(loaded.store, loaded.branch)) {
    throw new AppError(INELIGIBLE_SOURCE_MESSAGE, 400);
  }

  const assignmentRows = await getDb()
    .select()
    .from(storeUsers)
    .where(
      and(eq(storeUsers.storeId, loaded.store.id), eq(storeUsers.isActive, true)),
    )
    .limit(1);

  const assignment = assignmentRows[0];
  if (!assignment) {
    throw new AppError(CORPORATE_SETUP_MESSAGE, 400);
  }

  const maker = await assertActiveParticipant(
    assignment.makerApplicationUserId,
    "Supplying store maker",
  );
  if (!maker.roles.includes("MAKER")) {
    throw new AppError(CORPORATE_SETUP_MESSAGE, 400);
  }

  const checker = await assertActiveParticipant(
    assignment.supervisorApplicationUserId,
    "Supplying store checker",
  );
  if (!checker.roles.includes("CHECKER")) {
    throw new AppError(CORPORATE_SETUP_MESSAGE, 400);
  }

  return {
    store: loaded.store,
    branch: loaded.branch,
    makerApplicationUserId: assignment.makerApplicationUserId,
    supervisorApplicationUserId: assignment.supervisorApplicationUserId,
  };
}

async function loadActiveCorporateStoreSetup(): Promise<{
  store: StoreRow;
  branch: BranchRow;
  makerApplicationUserId: string;
  supervisorApplicationUserId: string;
}> {
  const resolved = await resolveCorporateStore();
  if (resolved.status === "MISSING") {
    throw new AppError(CORPORATE_MISSING_MESSAGE, 400);
  }
  if (resolved.status === "AMBIGUOUS") {
    throw new AppError(CORPORATE_AMBIGUOUS_MESSAGE, 400);
  }

  return loadActiveSupplyingStoreSetup(resolved.store.id);
}

async function assertRequestLinesEligible(
  lines: ItemRequestLineInput[],
): Promise<void> {
  const itemIds = lines.map((line) => line.itemId);
  const uniqueIds = [...new Set(itemIds)];
  if (uniqueIds.length !== itemIds.length) {
    throw new AppError("The same item cannot appear twice in one request", 400);
  }

  const rows = await getDb()
    .select()
    .from(items)
    .where(inArray(items.id, uniqueIds));

  const byId = new Map(rows.map((row) => [row.id, row]));

  for (const line of lines) {
    const item = byId.get(line.itemId);
    if (!item) {
      throw new AppError("Selected item was not found.", 400);
    }
    if (!item.isActive) {
      throw new AppError("Inactive items cannot be requested.", 400);
    }
    if (!item.isRequestable) {
      throw new AppError("This item is not requestable.", 400);
    }
  }
}

async function assertExistingLinesEligibleForSubmit(
  itemRequestId: string,
): Promise<void> {
  const rows = await getDb()
    .select({
      itemId: itemRequestLines.itemId,
      isActive: items.isActive,
      isRequestable: items.isRequestable,
    })
    .from(itemRequestLines)
    .innerJoin(items, eq(itemRequestLines.itemId, items.id))
    .where(eq(itemRequestLines.itemRequestId, itemRequestId));

  if (rows.length === 0) {
    throw new AppError("At least one request line is required", 400);
  }

  const ineligible = rows.some((row) => !row.isActive || !row.isRequestable);
  if (ineligible) {
    throw new AppError(
      "Replace inactive or non-requestable items before submitting.",
      400,
    );
  }
}

function buildVisibilityCondition(
  actor: AuthenticatedUser,
  supervisedStoreIds: string[],
): SQL | undefined {
  if (isAdminUser(actor)) {
    return undefined;
  }

  const conditions: SQL[] = [
    eq(itemRequests.createdByApplicationUserId, actor.id),
    eq(itemRequests.branchCheckerApplicationUserId, actor.id),
    eq(itemRequests.corporateMakerApplicationUserId, actor.id),
    eq(itemRequests.corporateCheckerApplicationUserId, actor.id),
  ];

  if (supervisedStoreIds.length > 0) {
    conditions.push(
      inArray(itemRequests.requestingStoreId, supervisedStoreIds),
    );
  }

  return or(...conditions);
}

function buildListFilters(
  query: ItemRequestListQuery,
  actor: AuthenticatedUser,
  visibility: SQL | undefined,
): SQL | undefined {
  const conditions: SQL[] = [];

  if (visibility) {
    conditions.push(visibility);
  }

  if (query.queue) {
    const queueStatuses = ITEM_REQUEST_QUEUE_STATUSES[query.queue];
    if (queueStatuses !== "ALL") {
      conditions.push(
        inArray(
          itemRequests.status,
          [...queueStatuses] as ItemRequestStatus[],
        ),
      );
    }
  } else if (query.status !== "ALL") {
    conditions.push(eq(itemRequests.status, query.status));
  }

  if (isAdminUser(actor) && query.requestingStoreId) {
    conditions.push(eq(itemRequests.requestingStoreId, query.requestingStoreId));
  }

  if (isAdminUser(actor) && query.branchId) {
    conditions.push(eq(requestingStores.branchId, query.branchId));
  }

  if (query.search) {
    const pattern = `%${escapeIlikePattern(query.search)}%`;
    const itemMatch = exists(
      getDb()
        .select({ id: searchLines.id })
        .from(searchLines)
        .innerJoin(searchItems, eq(searchLines.itemId, searchItems.id))
        .where(
          and(
            eq(searchLines.itemRequestId, itemRequests.id),
            or(
              sql`${searchItems.itemCode} ILIKE ${pattern} ESCAPE '\\'`,
              sql`${searchItems.itemName} ILIKE ${pattern} ESCAPE '\\'`,
            ),
          ),
        ),
    );

    const searchCondition = or(
      sql`${itemRequests.requestNumber} ILIKE ${pattern} ESCAPE '\\'`,
      sql`${requestingStores.storeCode} ILIKE ${pattern} ESCAPE '\\'`,
      sql`${requestingStores.storeName} ILIKE ${pattern} ESCAPE '\\'`,
      sql`${corporateStores.storeCode} ILIKE ${pattern} ESCAPE '\\'`,
      sql`${corporateStores.storeName} ILIKE ${pattern} ESCAPE '\\'`,
      sql`${createdByUsers.username} ILIKE ${pattern} ESCAPE '\\'`,
      sql`${createdByEmployees.employeeCode} ILIKE ${pattern} ESCAPE '\\'`,
      sql`${createdByEmployees.employeeName} ILIKE ${pattern} ESCAPE '\\'`,
      sql`${requestedByEmployees.employeeCode} ILIKE ${pattern} ESCAPE '\\'`,
      sql`${requestedByEmployees.employeeName} ILIKE ${pattern} ESCAPE '\\'`,
      sql`${branchCheckerUsers.username} ILIKE ${pattern} ESCAPE '\\'`,
      sql`${branchCheckerEmployees.employeeCode} ILIKE ${pattern} ESCAPE '\\'`,
      sql`${branchCheckerEmployees.employeeName} ILIKE ${pattern} ESCAPE '\\'`,
      sql`${corporateMakerUsers.username} ILIKE ${pattern} ESCAPE '\\'`,
      sql`${corporateMakerEmployees.employeeCode} ILIKE ${pattern} ESCAPE '\\'`,
      sql`${corporateMakerEmployees.employeeName} ILIKE ${pattern} ESCAPE '\\'`,
      sql`${corporateCheckerUsers.username} ILIKE ${pattern} ESCAPE '\\'`,
      sql`${corporateCheckerEmployees.employeeCode} ILIKE ${pattern} ESCAPE '\\'`,
      sql`${corporateCheckerEmployees.employeeName} ILIKE ${pattern} ESCAPE '\\'`,
      itemMatch,
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

const headerSelect = {
  request: itemRequests,
  requestingStore: requestingStores,
  requestingBranch: requestingBranches,
  corporateStore: corporateStores,
  corporateBranch: corporateBranches,
  createdByUser: createdByUsers,
  createdByEmployee: createdByEmployees,
  requestedByEmployee: requestedByEmployees,
  requestedByBranch: requestedByBranches,
  branchCheckerUser: branchCheckerUsers,
  branchCheckerEmployee: branchCheckerEmployees,
  corporateMakerUser: corporateMakerUsers,
  corporateMakerEmployee: corporateMakerEmployees,
  corporateCheckerUser: corporateCheckerUsers,
  corporateCheckerEmployee: corporateCheckerEmployees,
  itemCount: sql<number>`(
    select count(*)::int from ${itemRequestLines}
    where ${itemRequestLines.itemRequestId} = ${itemRequests.id}
  )`,
  totalRequestedQuantity: sql<string>`(
    select coalesce(sum(${itemRequestLines.requestedQuantity}), 0)::text
    from ${itemRequestLines}
    where ${itemRequestLines.itemRequestId} = ${itemRequests.id}
  )`,
  totalIssuedQuantity: sql<string>`(
    select coalesce(sum(${itemIssueLines.issueQuantity}), 0)::text
    from ${itemIssueLines}
    inner join ${itemIssues} on ${itemIssues.id} = ${itemIssueLines.itemIssueId}
    where ${itemIssues.requestId} = ${itemRequests.id}
      and ${itemIssues.status} = 'SUBMITTED'
  )`,
};

function itemRequestHeaderJoins() {
  return getDb()
    .select(headerSelect)
    .from(itemRequests)
    .innerJoin(
      requestingStores,
      eq(itemRequests.requestingStoreId, requestingStores.id),
    )
    .innerJoin(
      requestingBranches,
      eq(requestingStores.branchId, requestingBranches.id),
    )
    .leftJoin(
      corporateStores,
      eq(itemRequests.corporateStoreId, corporateStores.id),
    )
    .leftJoin(
      corporateBranches,
      eq(corporateStores.branchId, corporateBranches.id),
    )
    .innerJoin(
      createdByUsers,
      eq(itemRequests.createdByApplicationUserId, createdByUsers.id),
    )
    .leftJoin(
      createdByEmployees,
      eq(createdByUsers.employeeId, createdByEmployees.id),
    )
    .leftJoin(
      requestedByEmployees,
      eq(itemRequests.requestedByEmployeeId, requestedByEmployees.id),
    )
    .leftJoin(
      requestedByBranches,
      eq(requestedByEmployees.branchId, requestedByBranches.id),
    )
    .leftJoin(
      branchCheckerUsers,
      eq(itemRequests.branchCheckerApplicationUserId, branchCheckerUsers.id),
    )
    .leftJoin(
      branchCheckerEmployees,
      eq(branchCheckerUsers.employeeId, branchCheckerEmployees.id),
    )
    .leftJoin(
      corporateMakerUsers,
      eq(itemRequests.corporateMakerApplicationUserId, corporateMakerUsers.id),
    )
    .leftJoin(
      corporateMakerEmployees,
      eq(corporateMakerUsers.employeeId, corporateMakerEmployees.id),
    )
    .leftJoin(
      corporateCheckerUsers,
      eq(
        itemRequests.corporateCheckerApplicationUserId,
        corporateCheckerUsers.id,
      ),
    )
    .leftJoin(
      corporateCheckerEmployees,
      eq(corporateCheckerUsers.employeeId, corporateCheckerEmployees.id),
    );
}

type HeaderJoinedRow = {
  request: ItemRequestRow;
  requestingStore: StoreRow;
  requestingBranch: BranchRow;
  corporateStore: StoreRow | null;
  corporateBranch: BranchRow | null;
  createdByUser: ApplicationUserRow;
  createdByEmployee: EmployeeRow | null;
  requestedByEmployee: EmployeeRow | null;
  requestedByBranch: BranchRow | null;
  branchCheckerUser: ApplicationUserRow | null;
  branchCheckerEmployee: EmployeeRow | null;
  corporateMakerUser: ApplicationUserRow | null;
  corporateMakerEmployee: EmployeeRow | null;
  corporateCheckerUser: ApplicationUserRow | null;
  corporateCheckerEmployee: EmployeeRow | null;
  itemCount: number;
  totalRequestedQuantity: string;
  totalIssuedQuantity: string;
};

function toListItem(
  row: HeaderJoinedRow,
  actor: AuthenticatedUser,
  supervisedStoreIds: string[],
): ItemRequestListItem {
  const createdBy = toPersonSummary(row.createdByUser, row.createdByEmployee)!;
  const branchChecker = toPersonSummary(
    row.branchCheckerUser,
    row.branchCheckerEmployee,
  );
  const corporateMaker = toPersonSummary(
    row.corporateMakerUser,
    row.corporateMakerEmployee,
  );
  const corporateChecker = toPersonSummary(
    row.corporateCheckerUser,
    row.corporateCheckerEmployee,
  );
  const supplyingStoreId = row.request.corporateStoreId;
  const destinationStore = toStoreSummary(
    row.requestingStore,
    row.requestingBranch,
  );
  const sourceStore =
    row.corporateStore && row.corporateBranch
      ? toStoreSummary(row.corporateStore, row.corporateBranch)
      : null;
  const totalRequested = parseQuantityToScaled(
    String(row.totalRequestedQuantity ?? "0"),
  );
  const totalIssued = parseQuantityToScaled(
    String(row.totalIssuedQuantity ?? "0"),
  );
  const remaining = totalRequested - totalIssued;
  const canCreateIssue =
    requestAllowsItemIssueCreation({
      requestStatus: row.request.status,
      supplyingStoreId,
      supplyingStore:
        row.corporateStore && row.corporateBranch
          ? {
              id: row.corporateStore.id,
              isActive: row.corporateStore.isActive && row.corporateBranch.isActive,
              allowTransfer: row.corporateStore.allowTransfer,
              underStoreId: row.corporateStore.underStoreId,
              branchType: row.corporateBranch.branchType,
            }
          : null,
    }) &&
    supplyingStoreId !== null &&
    actorMayOperateItemIssue({
      actor,
      supplyingStoreId,
      supervisedStoreIds,
    });

  return {
    id: row.request.id,
    requestNumber: row.request.requestNumber,
    status: row.request.status,
    version: row.request.version,
    remarks: row.request.remarks ?? null,
    itemCount: Number(row.itemCount),
    totalRequestedQuantity: scaledToQuantity(totalRequested),
    totalIssuedQuantity: scaledToQuantity(totalIssued),
    totalRemainingQuantity: scaledToQuantity(remaining < 0n ? 0n : remaining),
    createdAt: row.request.createdAt.toISOString(),
    updatedAt: row.request.updatedAt.toISOString(),
    requestingStore: destinationStore,
    corporateStore: sourceStore,
    sourceStore,
    destinationStore,
    requestedBy: toRequestedByEmployeeSummary(
      row.requestedByEmployee,
      row.requestedByBranch,
    ),
    createdBy,
    pendingWith: pendingPersonForStatus({
      status: row.request.status,
      createdBy,
      branchChecker,
      corporateMaker,
      corporateChecker,
    }),
    canEdit: canEditRequest(row.request, actor),
    canCreateIssue,
    allowedActions: computeAllowedActions(row.request, actor),
  };
}

async function getVisibleHeaderRow(
  id: string,
  actor: AuthenticatedUser,
): Promise<HeaderJoinedRow> {
  const supervisedStoreIds = isAdminUser(actor)
    ? []
    : await listSupervisedStoreIds(actor.id);
  const visibility = buildVisibilityCondition(actor, supervisedStoreIds);
  const where = visibility
    ? and(eq(itemRequests.id, id), visibility)
    : eq(itemRequests.id, id);

  const rows = await itemRequestHeaderJoins().where(where).limit(1);
  const row = rows[0] as HeaderJoinedRow | undefined;
  if (!row) {
    throw new AppError("Item request not found", 404);
  }

  return row;
}

async function insertLines(
  tx: Pick<ReturnType<typeof getDb>, "insert">,
  itemRequestId: string,
  lines: ItemRequestLineInput[],
): Promise<void> {
  if (lines.length === 0) {
    throw new AppError("At least one request line is required", 400);
  }

  await tx.insert(itemRequestLines).values(
    lines.map((line) => ({
      itemRequestId,
      itemId: line.itemId,
      requestedQuantity: line.requestedQuantity,
    })),
  );
}

export async function getItemRequestContext(
  actor: AuthenticatedUser,
): Promise<ItemRequestContext> {
  const assignment = isAdminUser(actor)
    ? undefined
    : await getActiveMakerAssignment(actor.id);
  const destinationStore = assignment
    ? toStoreSummary(assignment.store, assignment.branch)
    : null;
  const [destinationStores, sourceStores] = await Promise.all([
    isAdminUser(actor)
      ? listActiveStoreSummaries()
      : Promise.resolve(destinationStore ? [destinationStore] : []),
    listActiveStoreSummaries({ supplyingOnly: true }),
  ]);

  const canCreate = isAdminUser(actor) || Boolean(assignment);
  const requestedByEmployee = await loadRequestedBySummaryById(
    actor.employee?.id,
  );

  return {
    canCreate,
    canSelectDestinationStore: isAdminUser(actor),
    canSelectRequestedByEmployee: canSelectRequestedByEmployee(actor),
    requestedByEmployee:
      requestedByEmployee?.isActive === true ? requestedByEmployee : null,
    destinationStore,
    requestingStore: destinationStore,
    sourceStores: destinationStore
      ? sourceStores.filter((store) => store.id !== destinationStore.id)
      : sourceStores,
    destinationStores,
  };
}

export async function listEligibleItemRequestSourceStores(
  actor: AuthenticatedUser,
  query: EligibleItemRequestStoreListQuery,
): Promise<PaginatedEligibleItemRequestStoreResponse> {
  const context = await getItemRequestContext(actor);
  if (!context.canCreate) {
    throw new AppError("Forbidden", 403);
  }

  const conditions: SQL[] = [supplyingStoreEligibilityCondition()];
  const excludeIds = new Set<string>();
  if (query.excludeStoreId) {
    excludeIds.add(query.excludeStoreId);
  }
  if (context.destinationStore) {
    excludeIds.add(context.destinationStore.id);
  }
  if (excludeIds.size === 1) {
    const [excludeId] = excludeIds;
    if (excludeId) {
      conditions.push(sql`${stores.id} <> ${excludeId}`);
    }
  } else if (excludeIds.size > 1) {
    conditions.push(notInArray(stores.id, [...excludeIds]));
  }

  if (query.search) {
    const pattern = `%${escapeIlikePattern(query.search)}%`;
    const searchCondition = or(
      sql`${stores.storeCode} ILIKE ${pattern} ESCAPE '\\'`,
      sql`${stores.storeName} ILIKE ${pattern} ESCAPE '\\'`,
      sql`${branches.branchCode} ILIKE ${pattern} ESCAPE '\\'`,
      sql`${branches.branchName} ILIKE ${pattern} ESCAPE '\\'`,
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
    mapItemRequestDatabaseError(error);
  }
}

export async function listEligibleItemRequestItems(
  actor: AuthenticatedUser,
  query: EligibleItemRequestItemListQuery,
): Promise<PaginatedEligibleItemRequestItemResponse> {
  const context = await getItemRequestContext(actor);
  if (!context.canCreate) {
    throw new AppError("Forbidden", 403);
  }

  if (query.sourceStoreId) {
    const destinationId = context.destinationStore?.id;
    if (destinationId && query.sourceStoreId === destinationId) {
      throw new AppError(SAME_STORE_MESSAGE, 400);
    }
    const source = await loadStoreWithBranch(query.sourceStoreId);
    if (!source || !storeIsEligibleSupplying(source.store, source.branch)) {
      throw new AppError(INELIGIBLE_SOURCE_MESSAGE, 400);
    }
  }

  const conditions: SQL[] = [
    eq(items.isActive, true),
    eq(items.isRequestable, true),
  ];

  if (query.search) {
    const pattern = `%${escapeIlikePattern(query.search)}%`;
    const searchCondition = or(
      sql`${items.itemCode} ILIKE ${pattern} ESCAPE '\\'`,
      sql`${items.itemName} ILIKE ${pattern} ESCAPE '\\'`,
    );
    if (searchCondition) {
      conditions.push(searchCondition);
    }
  }

  const where = and(...conditions);

  try {
    const countRows = await getDb()
      .select({ value: count() })
      .from(items)
      .innerJoin(units, eq(items.unitId, units.id))
      .where(where);

    const totalItems = countRows[0]?.value ?? 0;
    const totalPages =
      totalItems === 0 ? 0 : Math.ceil(totalItems / query.pageSize);
    const offset = (query.page - 1) * query.pageSize;

    const rows = await getDb()
      .select({
        id: items.id,
        itemCode: items.itemCode,
        itemName: items.itemName,
        unitId: units.id,
        unitName: units.unitName,
      })
      .from(items)
      .innerJoin(units, eq(items.unitId, units.id))
      .where(where)
      .orderBy(asc(items.itemName), asc(items.itemCode), asc(items.id))
      .limit(query.pageSize)
      .offset(offset);

    const stockByItemUnit = new Map<string, string>();
    if (query.sourceStoreId && rows.length > 0) {
      const stockRows = await getOperationalAvailableQuantities({
        storeId: query.sourceStoreId,
        itemIds: rows.map((row) => row.id),
      });
      for (const stock of stockRows) {
        stockByItemUnit.set(
          operationalStockKey(stock.storeId, stock.itemId, stock.unitId),
          stock.availableQuantity,
        );
      }
    }

    const mapped: EligibleItemRequestItem[] = rows.map((row) => ({
      id: row.id,
      itemCode: row.itemCode,
      itemName: row.itemName,
      unit: {
        id: row.unitId,
        unitName: row.unitName,
      },
      availableStockQuantity: query.sourceStoreId
        ? (stockByItemUnit.get(
            operationalStockKey(query.sourceStoreId, row.id, row.unitId),
          ) ?? "0")
        : "0",
    }));

    return {
      items: mapped,
      page: query.page,
      pageSize: query.pageSize,
      totalItems,
      totalPages,
    };
  } catch (error) {
    mapItemRequestDatabaseError(error);
  }
}

export async function listItemRequests(
  actor: AuthenticatedUser,
  query: ItemRequestListQuery,
): Promise<PaginatedItemRequestResponse> {
  const supervisedStoreIds = isAdminUser(actor)
    ? []
    : await listSupervisedStoreIds(actor.id);
  const visibility = buildVisibilityCondition(actor, supervisedStoreIds);
  const where = buildListFilters(query, actor, visibility);

  try {
    const countBase = getDb()
      .select({ value: count() })
      .from(itemRequests)
      .innerJoin(
        requestingStores,
        eq(itemRequests.requestingStoreId, requestingStores.id),
      )
      .innerJoin(
        requestingBranches,
        eq(requestingStores.branchId, requestingBranches.id),
      )
      .leftJoin(
        corporateStores,
        eq(itemRequests.corporateStoreId, corporateStores.id),
      )
      .leftJoin(
        corporateBranches,
        eq(corporateStores.branchId, corporateBranches.id),
      )
      .innerJoin(
        createdByUsers,
        eq(itemRequests.createdByApplicationUserId, createdByUsers.id),
      )
      .leftJoin(
        createdByEmployees,
        eq(createdByUsers.employeeId, createdByEmployees.id),
      )
      .leftJoin(
        requestedByEmployees,
        eq(itemRequests.requestedByEmployeeId, requestedByEmployees.id),
      )
      .leftJoin(
        requestedByBranches,
        eq(requestedByEmployees.branchId, requestedByBranches.id),
      )
      .leftJoin(
        branchCheckerUsers,
        eq(itemRequests.branchCheckerApplicationUserId, branchCheckerUsers.id),
      )
      .leftJoin(
        branchCheckerEmployees,
        eq(branchCheckerUsers.employeeId, branchCheckerEmployees.id),
      )
      .leftJoin(
        corporateMakerUsers,
        eq(itemRequests.corporateMakerApplicationUserId, corporateMakerUsers.id),
      )
      .leftJoin(
        corporateMakerEmployees,
        eq(corporateMakerUsers.employeeId, corporateMakerEmployees.id),
      )
      .leftJoin(
        corporateCheckerUsers,
        eq(
          itemRequests.corporateCheckerApplicationUserId,
          corporateCheckerUsers.id,
        ),
      )
      .leftJoin(
        corporateCheckerEmployees,
        eq(corporateCheckerUsers.employeeId, corporateCheckerEmployees.id),
      );

    const countRows = where ? await countBase.where(where) : await countBase;
    const totalItems = countRows[0]?.value ?? 0;
    const totalPages =
      totalItems === 0 ? 0 : Math.ceil(totalItems / query.pageSize);
    const offset = (query.page - 1) * query.pageSize;

    const listBase = itemRequestHeaderJoins()
      .orderBy(
        desc(itemRequests.createdAt),
        desc(itemRequests.requestNumber),
        desc(itemRequests.id),
      )
      .limit(query.pageSize)
      .offset(offset);

    const rows = where ? await listBase.where(where) : await listBase;

    return {
      items: (rows as HeaderJoinedRow[]).map((row) =>
        toListItem(row, actor, supervisedStoreIds),
      ),
      page: query.page,
      pageSize: query.pageSize,
      totalItems,
      totalPages,
    };
  } catch (error) {
    mapItemRequestDatabaseError(error);
  }
}

export async function getItemRequestById(
  id: string,
  actor: AuthenticatedUser,
): Promise<ItemRequest> {
  try {
    const header = await getVisibleHeaderRow(id, actor);
    const supervisedStoreIds = isAdminUser(actor)
      ? []
      : await listSupervisedStoreIds(actor.id);
    const listItem = toListItem(header, actor, supervisedStoreIds);

    const lineRows = await getDb()
      .select({
        line: itemRequestLines,
        item: items,
        unitId: units.id,
        unitName: units.unitName,
      })
      .from(itemRequestLines)
      .innerJoin(items, eq(itemRequestLines.itemId, items.id))
      .innerJoin(units, eq(items.unitId, units.id))
      .where(eq(itemRequestLines.itemRequestId, id))
      .orderBy(asc(items.itemName), asc(items.itemCode), asc(itemRequestLines.id));

    const issuedTotals = await loadSubmittedIssueTotalsByRequestLine(id);
    const sourceStoreId = header.request.corporateStoreId;
    const stockByItemUnit = new Map<string, string>();
    if (sourceStoreId && lineRows.length > 0) {
      const stockRows = await getOperationalAvailableQuantities({
        storeId: sourceStoreId,
        itemIds: lineRows.map((row) => row.item.id),
      });
      for (const stock of stockRows) {
        stockByItemUnit.set(
          operationalStockKey(stock.storeId, stock.itemId, stock.unitId),
          stock.availableQuantity,
        );
      }
    }

    const actionActorUsers = alias(applicationUsers, "action_actor_users");
    const actionActorEmployees = alias(employees, "action_actor_employees");

    const actionRows = await getDb()
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
      .where(eq(itemRequestActions.itemRequestId, id))
      .orderBy(asc(itemRequestActions.createdAt), asc(itemRequestActions.id));

    return {
      ...listItem,
      requestingStoreId: header.request.requestingStoreId,
      corporateStoreId: header.request.corporateStoreId ?? null,
      sourceStoreId: header.request.corporateStoreId ?? null,
      destinationStoreId: header.request.requestingStoreId,
      requestedByEmployeeId: header.request.requestedByEmployeeId ?? null,
      createdByApplicationUserId: header.request.createdByApplicationUserId,
      branchCheckerApplicationUserId:
        header.request.branchCheckerApplicationUserId ?? null,
      corporateMakerApplicationUserId:
        header.request.corporateMakerApplicationUserId ?? null,
      corporateCheckerApplicationUserId:
        header.request.corporateCheckerApplicationUserId ?? null,
      submittedAt: header.request.submittedAt?.toISOString() ?? null,
      recommendedAt: header.request.recommendedAt?.toISOString() ?? null,
      forwardedAt: header.request.forwardedAt?.toISOString() ?? null,
      approvedAt: header.request.approvedAt?.toISOString() ?? null,
      rejectedAt: header.request.rejectedAt?.toISOString() ?? null,
      cancelledAt: header.request.cancelledAt?.toISOString() ?? null,
      branchChecker: toPersonSummary(
        header.branchCheckerUser,
        header.branchCheckerEmployee,
      ),
      corporateMaker: toPersonSummary(
        header.corporateMakerUser,
        header.corporateMakerEmployee,
      ),
      corporateChecker: toPersonSummary(
        header.corporateCheckerUser,
        header.corporateCheckerEmployee,
      ),
      lines: lineRows.map((row) => {
        const requested = parseQuantityToScaled(String(row.line.requestedQuantity));
        const issued = issuedTotals.get(row.line.id) ?? 0n;
        const remaining = requested - issued;
        const stockKey = sourceStoreId
          ? operationalStockKey(sourceStoreId, row.item.id, row.unitId)
          : null;
        return {
          id: row.line.id,
          itemId: row.line.itemId,
          requestedQuantity: row.line.requestedQuantity,
          issuedQuantity: scaledToQuantity(issued),
          remainingQuantity: scaledToQuantity(remaining < 0n ? 0n : remaining),
          availableStockQuantity: stockKey
            ? (stockByItemUnit.get(stockKey) ?? "0")
            : null,
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
      }),
      actions: actionRows.map((row) => ({
        id: row.action.id,
        action: row.action.action,
        fromStatus: row.action.fromStatus,
        toStatus: row.action.toStatus,
        remarks: row.action.remarks ?? null,
        createdAt: row.action.createdAt.toISOString(),
        actor: toPersonSummary(row.actorUser, row.actorEmployee)!,
      })),
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    mapItemRequestDatabaseError(error);
  }
}

export async function createItemRequest(
  actor: AuthenticatedUser,
  input: CreateItemRequestInput,
): Promise<ItemRequest> {
  const storePair = await resolveCreateStorePair(actor, input);
  const requestedByEmployeeId = await resolveRequestedByForSave(
    actor,
    input.requestedByEmployeeId,
  );

  if (!isAdminUser(actor)) {
    await assertActiveParticipant(actor.id, "Maker");
  }
  await assertRequestLinesEligible(input.lines);

  let lastError: unknown;

  for (let attempt = 0; attempt < REQUEST_NUMBER_RETRY_ATTEMPTS; attempt += 1) {
    const requestNumber = generateRequestNumber();

    try {
      const createdId = await getDb().transaction(async (tx) => {
        const inserted = await tx
          .insert(itemRequests)
          .values({
            requestNumber,
            requestingStoreId: storePair.destinationStoreId,
            corporateStoreId: storePair.sourceStoreId,
            requestedByEmployeeId,
            createdByApplicationUserId: actor.id,
            status: "DRAFT",
            remarks: input.remarks,
            version: 1,
          })
          .returning({ id: itemRequests.id });

        const created = inserted[0];
        if (!created) {
          throw new AppError("Failed to create item request", 500);
        }

        await insertLines(tx, created.id, input.lines);
        return created.id;
      });

      return getItemRequestById(createdId, actor);
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      if (isItemRequestNumberUniqueViolation(error)) {
        lastError = error;
        continue;
      }
      mapItemRequestDatabaseError(error);
    }
  }

  throw new AppError("Failed to generate a unique request number.", 409, {
    cause: lastError,
  });
}

export async function updateItemRequest(
  id: string,
  actor: AuthenticatedUser,
  input: UpdateItemRequestInput,
): Promise<ItemRequest> {
  const existing = await getVisibleHeaderRow(id, actor);
  if (!canEditRequest(existing.request, actor)) {
    throw new AppError("This request cannot be edited.", 403);
  }

  if (!isAdminUser(actor)) {
    await assertActiveParticipant(actor.id, "Maker");
  }

  const nextSourceStoreId =
    input.sourceStoreId ?? existing.request.corporateStoreId;
  const nextDestinationStoreId = isAdminUser(actor)
    ? (input.destinationStoreId ?? existing.request.requestingStoreId)
    : existing.request.requestingStoreId;

  if (!nextSourceStoreId) {
    throw new AppError(SOURCE_REQUIRED_MESSAGE, 400);
  }

  if (
    !isAdminUser(actor) &&
    input.destinationStoreId &&
    input.destinationStoreId !== existing.request.requestingStoreId
  ) {
    throw new AppError(UNAUTHORIZED_DESTINATION_MESSAGE, 403);
  }

  await resolveCreateStorePair(actor, {
    sourceStoreId: nextSourceStoreId,
    destinationStoreId: nextDestinationStoreId,
  });

  const nextRequestedByEmployeeId = isAdminUser(actor)
    ? input.requestedByEmployeeId !== undefined
      ? await resolveRequestedByForSave(actor, input.requestedByEmployeeId)
      : existing.request.requestedByEmployeeId
    : await resolveRequestedByForSave(
        actor,
        input.requestedByEmployeeId ??
          existing.request.requestedByEmployeeId ??
          undefined,
      );

  if (input.lines) {
    await assertRequestLinesEligible(input.lines);
  }

  try {
    await getDb().transaction(async (tx) => {
      const updated = await tx
        .update(itemRequests)
        .set({
          ...(input.remarks !== undefined ? { remarks: input.remarks } : {}),
          requestingStoreId: nextDestinationStoreId,
          corporateStoreId: nextSourceStoreId,
          requestedByEmployeeId: nextRequestedByEmployeeId,
          version: existing.request.version + 1,
          updatedAt: sql`now()`,
        })
        .where(
          and(
            eq(itemRequests.id, id),
            eq(itemRequests.version, input.expectedVersion),
            inArray(itemRequests.status, [
              "DRAFT",
              "RETURNED_TO_BRANCH_MAKER",
            ]),
            eq(itemRequests.createdByApplicationUserId, actor.id),
          ),
        )
        .returning({ id: itemRequests.id });

      if (!updated[0]) {
        throw new AppError(STALE_REQUEST_MESSAGE, 409);
      }

      if (input.lines) {
        await tx
          .delete(itemRequestLines)
          .where(eq(itemRequestLines.itemRequestId, id));
        await insertLines(tx, id, input.lines);
      }
    });

    return getItemRequestById(id, actor);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    mapItemRequestDatabaseError(error);
  }
}

export async function performItemRequestAction(
  id: string,
  actor: AuthenticatedUser,
  input: ItemRequestActionInput,
): Promise<ItemRequest> {
  try {
    await getDb().transaction(async (tx) => {
      const lockedRows = await tx
        .select()
        .from(itemRequests)
        .where(eq(itemRequests.id, id))
        .for("update");

      const request = lockedRows[0];
      if (!request) {
        throw new AppError("Item request not found", 404);
      }

      if (request.version !== input.expectedVersion) {
        throw new AppError(STALE_REQUEST_MESSAGE, 409);
      }

      const match = WORKFLOW_TRANSITIONS.find(
        (transition) =>
          transition.from === request.status &&
          transition.action === input.action,
      );

      if (!match) {
        throw new AppError(INVALID_TRANSITION_MESSAGE, 409);
      }

      if (isAdminUser(actor) && match.actor !== "BRANCH_MAKER") {
        throw new AppError(ADMIN_WORKFLOW_MESSAGE, 403);
      }

      if (!actorMatchesKind(request, actor, match.actor)) {
        throw new AppError("Forbidden", 403);
      }

      if (!isAdminUser(actor)) {
        await assertActiveParticipant(
          actor.id,
          match.actor === "BRANCH_MAKER" || match.actor === "CORPORATE_MAKER"
            ? "Maker"
            : "Checker",
        );
      }

      const nextValues: Partial<typeof itemRequests.$inferInsert> & {
        status: ItemRequestStatus;
        version: number;
      } = {
        status: match.to,
        version: request.version + 1,
        updatedAt: new Date(),
      };

      if (input.action === "SUBMIT" || input.action === "RESUBMIT") {
        const destinationAssignment = isAdminUser(actor)
          ? await getActiveStoreAssignmentByStoreId(request.requestingStoreId)
          : await getActiveMakerAssignment(actor.id);

        if (
          !destinationAssignment ||
          destinationAssignment.store.id !== request.requestingStoreId
        ) {
          throw new AppError(
            isAdminUser(actor)
              ? DESTINATION_SETUP_MESSAGE
              : "You are not assigned as the active maker of this store.",
            isAdminUser(actor) ? 400 : 403,
          );
        }

        if (!request.corporateStoreId) {
          throw new AppError(SOURCE_REQUIRED_MESSAGE, 400);
        }

        await assertStorePairForRequest({
          sourceStoreId: request.corporateStoreId,
          destinationStoreId: request.requestingStoreId,
        });

        const checker = await assertActiveParticipant(
          destinationAssignment.assignment.supervisorApplicationUserId,
          "Branch checker",
        );
        if (!checker.roles.includes("CHECKER")) {
          throw new AppError(
            "The assigned store supervisor must have role CHECKER.",
            400,
          );
        }

        await assertExistingLinesEligibleForSubmit(request.id);
        nextValues.branchCheckerApplicationUserId =
          destinationAssignment.assignment.supervisorApplicationUserId;
        nextValues.submittedAt = new Date();
      }

      if (input.action === "CANCEL") {
        if (request.createdByApplicationUserId !== actor.id) {
          throw new AppError("Forbidden", 403);
        }
        nextValues.cancelledAt = new Date();
      }

      if (input.action === "RECOMMEND") {
        if (!request.corporateStoreId) {
          const corporate = await loadActiveCorporateStoreSetup();
          nextValues.corporateStoreId = corporate.store.id;
          nextValues.corporateMakerApplicationUserId =
            corporate.makerApplicationUserId;
          nextValues.corporateCheckerApplicationUserId =
            corporate.supervisorApplicationUserId;
        } else {
          await assertStorePairForRequest({
            sourceStoreId: request.corporateStoreId,
            destinationStoreId: request.requestingStoreId,
          });
          const supplying = await loadActiveSupplyingStoreSetup(
            request.corporateStoreId,
          );
          nextValues.corporateMakerApplicationUserId =
            supplying.makerApplicationUserId;
          nextValues.corporateCheckerApplicationUserId =
            supplying.supervisorApplicationUserId;
        }
        nextValues.recommendedAt = new Date();
      }

      if (input.action === "FORWARD") {
        if (!request.corporateStoreId) {
          throw new AppError(INACTIVE_SOURCE_MESSAGE, 400);
        }

        const sourceRows = await tx
          .select({ isActive: stores.isActive })
          .from(stores)
          .where(eq(stores.id, request.corporateStoreId))
          .limit(1);

        if (!sourceRows[0]?.isActive) {
          throw new AppError(INACTIVE_SOURCE_MESSAGE, 400);
        }

        nextValues.forwardedAt = new Date();
      }

      if (input.action === "APPROVE") {
        nextValues.approvedAt = new Date();
      }

      if (input.action === "REJECT") {
        nextValues.rejectedAt = new Date();
      }

      const updated = await tx
        .update(itemRequests)
        .set(nextValues)
        .where(
          and(
            eq(itemRequests.id, id),
            eq(itemRequests.version, input.expectedVersion),
            eq(itemRequests.status, request.status),
          ),
        )
        .returning({ id: itemRequests.id });

      if (!updated[0]) {
        throw new AppError(STALE_REQUEST_MESSAGE, 409);
      }

      await tx.insert(itemRequestActions).values({
        itemRequestId: id,
        action: input.action,
        fromStatus: request.status,
        toStatus: match.to,
        actorApplicationUserId: actor.id,
        remarks: input.remarks,
      });
    });

    return getItemRequestById(id, actor);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    mapItemRequestDatabaseError(error);
  }
}
