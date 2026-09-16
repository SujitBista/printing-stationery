import { randomBytes } from "node:crypto";
import {
  and,
  asc,
  count,
  desc,
  eq,
  exists,
  inArray,
  isNotNull,
  isNull,
  not,
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
  ItemIssueStatus,
  ItemRequest,
  ItemRequestActionInput,
  ItemRequestActionType,
  ItemRequestContext,
  ItemRequestLineInput,
  ItemRequestListItem,
  ItemRequestListQuery,
  ItemRequestPersonSummary,
  ItemRequestQueue,
  ItemRequestRequestedByEmployee,
  ItemRequestStatus,
  ItemRequestStoreSummary,
  ItemRequestWorkflowRole,
  PaginatedEligibleItemRequestItemResponse,
  PaginatedEligibleItemRequestStoreResponse,
  PaginatedItemRequestResponse,
  UpdateItemRequestInput,
} from "@printing-stationery/shared";
import {
  CORPORATE_STORE_CODE,
  ITEM_ISSUE_OPEN_STATUSES,
  ITEM_ISSUE_QUEUE_BLOCKING_STATUSES,
  ITEM_REQUEST_CORPORATE_MAKER_CREATE_MESSAGE,
  ITEM_REQUEST_MISSING_MAKER_OR_CHECKER_MESSAGE,
  ITEM_REQUEST_QUEUE_STATUSES,
  inferItemRequestActorWorkflowRole,
  isCorporateControlStore,
  itemRequestPendingAssignee,
  itemRequestWorkflowCanCreate,
  itemRequestWorkflowIsCorporateMaker,
  preferCorporateControlStore,
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
  actorMayCreateItemIssue,
  isEligibleSupplyingStore,
  requestAllowsItemIssueCreation,
} from "./item-issue-authorization.js";
import { countItemIssuesForQueue } from "./item-issues.service.js";
import { insertItemRequestWorkflowNotifications } from "./item-request-notifications.js";
import {
  INACTIVE_REQUESTED_BY_MESSAGE,
  REQUESTED_BY_REQUIRED_MESSAGE,
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
  "Administrators can create and submit requests on behalf of a requesting store, but cannot recommend, forward, approve, or reject them.";
const CORPORATE_MISSING_MESSAGE =
  "Corporate Store routing is not configured. Contact an administrator.";
const CORPORATE_AMBIGUOUS_MESSAGE =
  "Corporate Store routing is ambiguous. Contact an administrator.";
const SAME_STORE_MESSAGE =
  "Request From Store and Request To Store must be different.";
const INACTIVE_SOURCE_MESSAGE = "The Request From Store is inactive.";
const INACTIVE_DESTINATION_MESSAGE = "The Request To Store is inactive.";
const INELIGIBLE_DESTINATION_MESSAGE =
  "The Request To Store is not allowed to transfer or issue stock.";
const NO_ASSIGNMENT_MESSAGE = ITEM_REQUEST_MISSING_MAKER_OR_CHECKER_MESSAGE;
const UNAUTHORIZED_SOURCE_MESSAGE = ITEM_REQUEST_MISSING_MAKER_OR_CHECKER_MESSAGE;
const SOURCE_REQUIRED_MESSAGE = "Request From Store is required.";
const DESTINATION_REQUIRED_MESSAGE = "Request To Store is required.";
const REQUEST_TO_MUST_BE_CORPORATE_MESSAGE =
  "Request To Store must be the Corporate Store.";
const REQUESTED_BY_BRANCH_MESSAGE =
  "Requested By must be an active employee belonging to the Request From Store branch.";

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
    makerApplicationUserId: string | null;
    supervisorApplicationUserId: string | null;
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

function assignmentHasChecker(
  assignment: StoreAssignmentContext | undefined,
): boolean {
  return Boolean(assignment?.assignment.supervisorApplicationUserId);
}

function createForbiddenMessage(
  workflowRoles: readonly ItemRequestWorkflowRole[],
): string {
  return itemRequestWorkflowIsCorporateMaker(workflowRoles)
    ? ITEM_REQUEST_CORPORATE_MAKER_CREATE_MESSAGE
    : "Forbidden";
}

function requestingStoreHasAssignedMakerAndChecker(): SQL {
  return exists(
    getDb()
      .select({ id: storeUsers.id })
      .from(storeUsers)
      .where(
        and(
          eq(storeUsers.storeId, itemRequests.requestingStoreId),
          eq(storeUsers.isActive, true),
          isNotNull(storeUsers.makerApplicationUserId),
          isNotNull(storeUsers.supervisorApplicationUserId),
        ),
      ),
  );
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
  const assignee = itemRequestPendingAssignee(params.status);
  if (!assignee) {
    return null;
  }

  switch (assignee) {
    case "createdBy":
      return params.createdBy;
    case "branchChecker":
      return params.branchChecker;
    case "corporateMaker":
      return params.corporateMaker;
    case "corporateChecker":
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

function actorWorkflowRoleForTransition(
  actor: AuthenticatedUser,
  kind: ActorKind,
): ItemRequestWorkflowRole {
  if (isAdminUser(actor)) {
    return "ADMIN";
  }
  return kind;
}

function storeIsCorporateControl(
  store: Pick<StoreRow, "storeCode" | "storeName" | "underStoreId">,
  branch: Pick<BranchRow, "branchType">,
): boolean {
  return isCorporateControlStore({
    storeCode: store.storeCode,
    storeName: store.storeName,
    underStoreId: store.underStoreId,
    branchType: branch.branchType,
  });
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
        eq(itemIssues.status, "POSTED"),
      ),
    )
    .groupBy(itemIssueLines.requestLineId);

  return new Map(
    rows.map((row) => [row.requestLineId, parseQuantityToScaled(row.totalQuantity)]),
  );
}

function missingAssignmentMessage(
  storeName: string,
  kind: "Maker" | "Checker",
): string {
  return `${storeName} does not have an active ${kind} assignment.`;
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
        or(
          sql`lower(${stores.storeCode}) = ${CORPORATE_STORE_CODE.toLowerCase()}`,
          and(
            eq(branches.branchType, "HEAD_OFFICE"),
            isNull(stores.underStoreId),
          ),
        ),
      ),
    );

  const preferred = preferCorporateControlStore(
    rows.map((row) => ({
      id: row.store.id,
      storeCode: row.store.storeCode,
      storeName: row.store.storeName,
      underStoreId: row.store.underStoreId,
      branchType: row.branch.branchType,
    })),
  );
  if (preferred) {
    const match = rows.find((row) => row.store.id === preferred.id);
    if (match) {
      return {
        status: "OK",
        store: match.store,
        branch: match.branch,
      };
    }
  }

  const hoRoots = rows.filter(
    (row) =>
      row.branch.branchType === "HEAD_OFFICE" && row.store.underStoreId === null,
  );
  if (hoRoots.length === 0) {
    return { status: "MISSING" };
  }
  if (hoRoots.length > 1) {
    return { status: "AMBIGUOUS" };
  }

  return {
    status: "OK",
    store: hoRoots[0]!.store,
    branch: hoRoots[0]!.branch,
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

async function listSupervisedStores(
  applicationUserId: string,
): Promise<Array<{ store: StoreRow; branch: BranchRow }>> {
  return getDb()
    .select({
      store: stores,
      branch: branches,
    })
    .from(storeUsers)
    .innerJoin(stores, eq(storeUsers.storeId, stores.id))
    .innerJoin(branches, eq(stores.branchId, branches.id))
    .where(
      and(
        eq(storeUsers.supervisorApplicationUserId, applicationUserId),
        eq(storeUsers.isActive, true),
        eq(stores.isActive, true),
      ),
    );
}

async function listSupervisedStoreIds(applicationUserId: string): Promise<string[]> {
  const rows = await listSupervisedStores(applicationUserId);
  return rows.map((row) => row.store.id);
}

async function listMakerStoreIds(applicationUserId: string): Promise<string[]> {
  const assignment = await getActiveMakerAssignment(applicationUserId);
  return assignment ? [assignment.store.id] : [];
}

async function actorStoreIds(actor: AuthenticatedUser): Promise<{
  supervisedStoreIds: string[];
  makerStoreIds: string[];
}> {
  if (isAdminUser(actor)) {
    return { supervisedStoreIds: [], makerStoreIds: [] };
  }
  const [supervisedStoreIds, makerStoreIds] = await Promise.all([
    listSupervisedStoreIds(actor.id),
    listMakerStoreIds(actor.id),
  ]);
  return { supervisedStoreIds, makerStoreIds };
}

async function resolveItemRequestWorkflowRoles(
  actor: AuthenticatedUser,
): Promise<ItemRequestWorkflowRole[]> {
  if (isAdminUser(actor)) {
    return ["ADMIN"];
  }

  const roles: ItemRequestWorkflowRole[] = [];
  const makerAssignment = await getActiveMakerAssignment(actor.id);
  if (makerAssignment) {
    const isCorporate = storeIsCorporateControl(
      makerAssignment.store,
      makerAssignment.branch,
    );
    // Corporate Maker reviews branch requests even when no Branch Maker exists
    // yet. Branch Maker still needs an assigned checker before creating.
    if (isCorporate || assignmentHasChecker(makerAssignment)) {
      roles.push(isCorporate ? "CORPORATE_MAKER" : "BRANCH_MAKER");
    }
  }

  const supervised = await listSupervisedStores(actor.id);
  for (const row of supervised) {
    const role: ItemRequestWorkflowRole = storeIsCorporateControl(
      row.store,
      row.branch,
    )
      ? "CORPORATE_CHECKER"
      : "BRANCH_CHECKER";
    if (!roles.includes(role)) {
      roles.push(role);
    }
  }

  return roles;
}

async function actorCanViewFulfilment(actor: AuthenticatedUser): Promise<boolean> {
  if (isAdminUser(actor)) {
    return true;
  }

  const makerAssignment = await getActiveMakerAssignment(actor.id);
  if (
    makerAssignment &&
    assignmentHasChecker(makerAssignment) &&
    storeIsEligibleSupplying(makerAssignment.store, makerAssignment.branch)
  ) {
    return true;
  }

  const supervised = await listSupervisedStores(actor.id);
  return supervised.some((row) => storeIsEligibleSupplying(row.store, row.branch));
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
  if (!storeIsEligibleSupplying(destination.store, destination.branch)) {
    throw new AppError(INELIGIBLE_DESTINATION_MESSAGE, 400);
  }

  return { source, destination };
}

async function assertRequestedByMatchesFromStore(params: {
  requestedByEmployeeId: string;
  requestingStoreId: string;
}): Promise<void> {
  const [requestedBy, requesting] = await Promise.all([
    loadRequestedBySummaryById(params.requestedByEmployeeId),
    loadStoreWithBranch(params.requestingStoreId),
  ]);
  if (!requestedBy || !requesting) {
    throw new AppError(REQUESTED_BY_BRANCH_MESSAGE, 400);
  }
  if (requestedBy.branch.id !== requesting.branch.id) {
    throw new AppError(REQUESTED_BY_BRANCH_MESSAGE, 400);
  }
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
  if (storeIsCorporateControl(assignment.store, assignment.branch)) {
    throw new AppError(ITEM_REQUEST_CORPORATE_MAKER_CREATE_MESSAGE, 403);
  }
  if (!assignmentHasChecker(assignment)) {
    throw new AppError(ITEM_REQUEST_MISSING_MAKER_OR_CHECKER_MESSAGE, 403);
  }

  if (input.sourceStoreId !== assignment.store.id) {
    throw new AppError(UNAUTHORIZED_SOURCE_MESSAGE, 403);
  }

  const corporate = await resolveCorporateStore();
  if (corporate.status === "MISSING") {
    throw new AppError(CORPORATE_MISSING_MESSAGE, 400);
  }
  if (corporate.status === "AMBIGUOUS") {
    throw new AppError(CORPORATE_AMBIGUOUS_MESSAGE, 400);
  }
  if (input.destinationStoreId !== corporate.store.id) {
    throw new AppError(REQUEST_TO_MUST_BE_CORPORATE_MESSAGE, 400);
  }

  await assertStorePairForRequest({
    sourceStoreId: assignment.store.id,
    destinationStoreId: corporate.store.id,
  });

  return {
    sourceStoreId: assignment.store.id,
    destinationStoreId: corporate.store.id,
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

async function requireStoreMakerCheckerAssignment(storeId: string): Promise<{
  store: StoreRow;
  branch: BranchRow;
  makerApplicationUserId: string;
  supervisorApplicationUserId: string;
}> {
  const loaded = await loadStoreWithBranch(storeId);
  if (!loaded || !loaded.store.isActive || !loaded.branch.isActive) {
    throw new AppError(INACTIVE_SOURCE_MESSAGE, 400);
  }

  const storeName = loaded.store.storeName;
  const assignment = await getActiveStoreAssignmentByStoreId(loaded.store.id);
  if (!assignment?.assignment.makerApplicationUserId) {
    throw new AppError(missingAssignmentMessage(storeName, "Maker"), 400);
  }
  if (!assignment.assignment.supervisorApplicationUserId) {
    throw new AppError(missingAssignmentMessage(storeName, "Checker"), 400);
  }

  try {
    const maker = await assertActiveParticipant(
      assignment.assignment.makerApplicationUserId,
      "Maker",
    );
    if (!maker.roles.includes("MAKER")) {
      throw new AppError(missingAssignmentMessage(storeName, "Maker"), 400);
    }
  } catch (error) {
    if (
      error instanceof AppError &&
      error.message === missingAssignmentMessage(storeName, "Maker")
    ) {
      throw error;
    }
    throw new AppError(missingAssignmentMessage(storeName, "Maker"), 400);
  }

  try {
    const checker = await assertActiveParticipant(
      assignment.assignment.supervisorApplicationUserId,
      "Checker",
    );
    if (!checker.roles.includes("CHECKER")) {
      throw new AppError(missingAssignmentMessage(storeName, "Checker"), 400);
    }
  } catch (error) {
    if (
      error instanceof AppError &&
      error.message === missingAssignmentMessage(storeName, "Checker")
    ) {
      throw error;
    }
    throw new AppError(missingAssignmentMessage(storeName, "Checker"), 400);
  }

  return {
    store: loaded.store,
    branch: loaded.branch,
    makerApplicationUserId: assignment.assignment.makerApplicationUserId,
    supervisorApplicationUserId:
      assignment.assignment.supervisorApplicationUserId,
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
    throw new AppError(INACTIVE_DESTINATION_MESSAGE, 400);
  }
  if (!storeIsEligibleSupplying(loaded.store, loaded.branch)) {
    throw new AppError(INELIGIBLE_DESTINATION_MESSAGE, 400);
  }

  return requireStoreMakerCheckerAssignment(loaded.store.id);
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

function buildQueueActorCondition(
  queue: ItemRequestQueue,
  actor: AuthenticatedUser,
): SQL | undefined {
  if (isAdminUser(actor)) {
    if (queue === "approve") {
      return isNotNull(itemRequests.forwardedAt);
    }
    return undefined;
  }

  switch (queue) {
    case "drafts":
    case "submitted":
      return eq(itemRequests.createdByApplicationUserId, actor.id);
    case "recommend":
    case "recommended":
      return eq(itemRequests.branchCheckerApplicationUserId, actor.id);
    case "review":
    case "forwarded":
    case "ready-to-issue":
      return eq(itemRequests.corporateMakerApplicationUserId, actor.id);
    case "approve":
      return and(
        eq(itemRequests.corporateCheckerApplicationUserId, actor.id),
        isNotNull(itemRequests.forwardedAt),
      );
    case "approved":
      return eq(itemRequests.corporateCheckerApplicationUserId, actor.id);
    case "returned":
      return or(
        and(
          eq(itemRequests.status, "RETURNED_TO_CORPORATE_MAKER"),
          or(
            eq(itemRequests.corporateCheckerApplicationUserId, actor.id),
            eq(itemRequests.corporateMakerApplicationUserId, actor.id),
          ),
        ),
        and(
          eq(itemRequests.status, "RETURNED_TO_BRANCH_MAKER"),
          or(
            eq(itemRequests.createdByApplicationUserId, actor.id),
            eq(itemRequests.branchCheckerApplicationUserId, actor.id),
          ),
        ),
      );
    default:
      return undefined;
  }
}

function remainingPostedQuantityCondition(): SQL {
  return sql`(
    select coalesce(sum(${itemRequestLines.requestedQuantity}), 0)
    from ${itemRequestLines}
    where ${itemRequestLines.itemRequestId} = ${itemRequests.id}
  ) > (
    select coalesce(sum(${itemIssueLines.issueQuantity}), 0)
    from ${itemIssueLines}
    inner join ${itemIssues} on ${itemIssues.id} = ${itemIssueLines.itemIssueId}
    where ${itemIssues.requestId} = ${itemRequests.id}
      and ${itemIssues.status} = 'POSTED'
  )`;
}

function noBlockingOpenIssueCondition(): SQL {
  return not(
    exists(
      getDb()
        .select({ id: itemIssues.id })
        .from(itemIssues)
        .where(
          and(
            eq(itemIssues.requestId, itemRequests.id),
            inArray(itemIssues.status, [...ITEM_ISSUE_QUEUE_BLOCKING_STATUSES]),
          ),
        ),
    ),
  );
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

  conditions.push(requestingStoreHasAssignedMakerAndChecker());

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
    const actorCondition = buildQueueActorCondition(query.queue, actor);
    if (actorCondition) {
      conditions.push(actorCondition);
    }
    if (query.queue === "ready-to-issue" || query.queue === "partial-pending") {
      conditions.push(remainingPostedQuantityCondition());
      conditions.push(noBlockingOpenIssueCondition());
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
      and ${itemIssues.status} = 'POSTED'
  )`,
  activeIssue: sql<{
    id: string;
    issueNumber: string;
    status: ItemIssueStatus;
  } | null>`(
    select json_build_object(
      'id', open_issues.id,
      'issueNumber', open_issues.issue_number,
      'status', open_issues.status
    )
    from ${itemIssues} as open_issues
    where open_issues.request_id = ${itemRequests.id}
      and open_issues.status in ('DRAFT', 'PENDING_VERIFICATION', 'RETURNED')
    order by open_issues.updated_at desc, open_issues.created_at desc, open_issues.id desc
    limit 1
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
  activeIssue: {
    id: string;
    issueNumber: string;
    status: ItemIssueStatus;
  } | null;
};

async function attachAvailableStockToListItems(
  listItems: ItemRequestListItem[],
): Promise<ItemRequestListItem[]> {
  if (listItems.length === 0) {
    return listItems;
  }

  const requestIds = listItems.map((item) => item.id);
  const lineRows = await getDb()
    .select({
      requestId: itemRequestLines.itemRequestId,
      itemId: items.id,
      unitId: units.id,
    })
    .from(itemRequestLines)
    .innerJoin(items, eq(itemRequestLines.itemId, items.id))
    .innerJoin(units, eq(items.unitId, units.id))
    .where(inArray(itemRequestLines.itemRequestId, requestIds));

  const linesByRequest = new Map<
    string,
    Array<{ itemId: string; unitId: string }>
  >();
  for (const row of lineRows) {
    const lines = linesByRequest.get(row.requestId) ?? [];
    lines.push({ itemId: row.itemId, unitId: row.unitId });
    linesByRequest.set(row.requestId, lines);
  }

  const itemIdsByStore = new Map<string, string[]>();
  for (const item of listItems) {
    const storeId = item.destinationStore?.id ?? item.corporateStore?.id;
    const lines = linesByRequest.get(item.id);
    if (!storeId || !lines || lines.length === 0) {
      continue;
    }
    const existing = itemIdsByStore.get(storeId) ?? [];
    itemIdsByStore.set(storeId, [
      ...existing,
      ...lines.map((line) => line.itemId),
    ]);
  }

  const stockByKey = new Map<string, string>();
  await Promise.all(
    [...itemIdsByStore.entries()].map(async ([storeId, itemIds]) => {
      const uniqueItemIds = [...new Set(itemIds)];
      const stockRows = await getOperationalAvailableQuantities({
        storeId,
        itemIds: uniqueItemIds,
      });
      for (const stock of stockRows) {
        stockByKey.set(
          operationalStockKey(stock.storeId, stock.itemId, stock.unitId),
          stock.availableQuantity,
        );
      }
    }),
  );

  return listItems.map((item) => {
    const storeId = item.destinationStore?.id ?? item.corporateStore?.id;
    const lines = linesByRequest.get(item.id);
    if (!storeId || !lines || lines.length !== 1) {
      return item;
    }
    const line = lines[0]!;
    return {
      ...item,
      availableStockQuantity:
        stockByKey.get(operationalStockKey(storeId, line.itemId, line.unitId)) ??
        "0",
    };
  });
}

function parseActiveIssue(
  value: unknown,
): {
  id: string;
  issueNumber: string;
  status: ItemIssueStatus;
} | null {
  const raw =
    typeof value === "string"
      ? (JSON.parse(value) as unknown)
      : value;
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const record = raw as Record<string, unknown>;
  const id = record.id;
  const issueNumber = record.issueNumber;
  const status = record.status;
  if (
    typeof id !== "string" ||
    typeof issueNumber !== "string" ||
    typeof status !== "string" ||
    !(ITEM_ISSUE_OPEN_STATUSES as readonly string[]).includes(status)
  ) {
    return null;
  }
  return {
    id,
    issueNumber,
    status: status as ItemIssueStatus,
  };
}

function toListItem(
  row: HeaderJoinedRow,
  actor: AuthenticatedUser,
  supervisedStoreIds: string[],
  makerStoreIds: string[],
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
  const requestingStore = toStoreSummary(
    row.requestingStore,
    row.requestingBranch,
  );
  const destinationStore =
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
  const activeIssue = parseActiveIssue(row.activeIssue);
  const canCreateIssue =
    remaining > 0n &&
    !activeIssue &&
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
    actorMayCreateItemIssue({
      actor,
      supplyingStoreId,
      makerStoreIds,
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
    availableStockQuantity: null,
    createdAt: row.request.createdAt.toISOString(),
    updatedAt: row.request.updatedAt.toISOString(),
    requestingStore,
    corporateStore: destinationStore,
    sourceStore: requestingStore,
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
    canDelete: isAdminUser(actor),
    canCreateIssue,
    activeIssue,
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
  const requestFromStore = assignment
    ? toStoreSummary(assignment.store, assignment.branch)
    : null;
  const corporateResolved = await resolveCorporateStore();
  const requestToStore =
    corporateResolved.status === "OK"
      ? toStoreSummary(corporateResolved.store, corporateResolved.branch)
      : null;
  const [requestFromStores, supplyingStores] = await Promise.all([
    isAdminUser(actor)
      ? listActiveStoreSummaries()
      : Promise.resolve(requestFromStore ? [requestFromStore] : []),
    isAdminUser(actor)
      ? listActiveStoreSummaries({ supplyingOnly: true })
      : Promise.resolve(requestToStore ? [requestToStore] : []),
  ]);

  const destinationStores = requestToStore
    ? [
        requestToStore,
        ...supplyingStores.filter((store) => store.id !== requestToStore.id),
      ]
    : supplyingStores;
  const sourceStores = requestToStore
    ? requestFromStores.filter((store) => store.id !== requestToStore.id)
    : requestFromStores;

  const [requestedByEmployee, workflowRoles, canViewFulfilment] =
    await Promise.all([
      loadRequestedBySummaryById(actor.employee?.id),
      resolveItemRequestWorkflowRoles(actor),
      actorCanViewFulfilment(actor),
    ]);
  const canCreate = itemRequestWorkflowCanCreate(workflowRoles);

  const [readyToIssue, pendingIssues, returnedIssues] = await Promise.all([
    listItemRequests(actor, {
      page: 1,
      pageSize: 1,
      status: "ALL",
      queue: "ready-to-issue",
    }).then((result) => result.totalItems).catch(() => 0),
    countItemIssuesForQueue(actor, "pending-verification").catch(() => 0),
    countItemIssuesForQueue(actor, "returned").catch(() => 0),
  ]);

  return {
    canCreate,
    workflowRoles,
    canViewFulfilment,
    readyToIssueCount: readyToIssue,
    pendingIssueVerificationCount: pendingIssues,
    returnedIssueCount: returnedIssues,
    canSelectRequestFromStore: isAdminUser(actor),
    canSelectRequestToStore: isAdminUser(actor),
    canSelectDestinationStore: isAdminUser(actor),
    canSelectRequestedByEmployee: canSelectRequestedByEmployee(actor),
    requestedByEmployee:
      requestedByEmployee?.isActive === true ? requestedByEmployee : null,
    destinationStore: requestFromStore,
    requestFromStore,
    requestingStore: requestFromStore,
    requestToStore,
    corporateStore: requestToStore,
    sourceStores,
    destinationStores,
  };
}

export async function listEligibleItemRequestSourceStores(
  actor: AuthenticatedUser,
  query: EligibleItemRequestStoreListQuery,
): Promise<PaginatedEligibleItemRequestStoreResponse> {
  const context = await getItemRequestContext(actor);
  if (!context.canCreate) {
    throw new AppError(createForbiddenMessage(context.workflowRoles), 403);
  }

  const conditions: SQL[] = [
    eq(stores.isActive, true),
    eq(branches.isActive, true),
  ];
  const excludeIds = new Set<string>();
  if (query.excludeStoreId) {
    excludeIds.add(query.excludeStoreId);
  }
  if (context.requestToStore) {
    excludeIds.add(context.requestToStore.id);
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
    throw new AppError(createForbiddenMessage(context.workflowRoles), 403);
  }

  if (query.destinationStoreId) {
    const sourceId = context.requestFromStore?.id;
    if (sourceId && query.destinationStoreId === sourceId) {
      throw new AppError(SAME_STORE_MESSAGE, 400);
    }
    const destination = await loadStoreWithBranch(query.destinationStoreId);
    if (
      !destination ||
      !storeIsEligibleSupplying(destination.store, destination.branch)
    ) {
      throw new AppError(INELIGIBLE_DESTINATION_MESSAGE, 400);
    }
    if (
      !isAdminUser(actor) &&
      context.requestToStore &&
      query.destinationStoreId !== context.requestToStore.id
    ) {
      throw new AppError(REQUEST_TO_MUST_BE_CORPORATE_MESSAGE, 400);
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
    if (query.destinationStoreId && rows.length > 0) {
      const stockRows = await getOperationalAvailableQuantities({
        storeId: query.destinationStoreId,
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
      availableStockQuantity: query.destinationStoreId
        ? (stockByItemUnit.get(
            operationalStockKey(query.destinationStoreId, row.id, row.unitId),
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
  const { supervisedStoreIds, makerStoreIds } = await actorStoreIds(actor);
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
    const items = (rows as HeaderJoinedRow[]).map((row) =>
      toListItem(row, actor, supervisedStoreIds, makerStoreIds),
    );

    return {
      items: await attachAvailableStockToListItems(items),
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
    const { supervisedStoreIds, makerStoreIds } = await actorStoreIds(actor);
    const listItem = toListItem(header, actor, supervisedStoreIds, makerStoreIds);

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
    const destinationStoreId = header.request.corporateStoreId;
    const stockByItemUnit = new Map<string, string>();
    if (destinationStoreId && lineRows.length > 0) {
      const stockRows = await getOperationalAvailableQuantities({
        storeId: destinationStoreId,
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

    const lines = lineRows.map((row) => {
      const requested = parseQuantityToScaled(String(row.line.requestedQuantity));
      const issued = issuedTotals.get(row.line.id) ?? 0n;
      const remaining = requested - issued;
      const stockKey = destinationStoreId
        ? operationalStockKey(destinationStoreId, row.item.id, row.unitId)
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
    });

    return {
      ...listItem,
      availableStockQuantity:
        lines.length === 1 ? lines[0]!.availableStockQuantity : null,
      requestingStoreId: header.request.requestingStoreId,
      corporateStoreId: header.request.corporateStoreId ?? null,
      sourceStoreId: header.request.requestingStoreId,
      destinationStoreId: header.request.corporateStoreId ?? null,
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
      lines,
      actions: actionRows.map((row) => ({
        id: row.action.id,
        action: row.action.action,
        fromStatus: row.action.fromStatus,
        toStatus: row.action.toStatus,
        actorWorkflowRole:
          row.action.actorWorkflowRole ??
          inferItemRequestActorWorkflowRole({
            action: row.action.action,
            fromStatus: row.action.fromStatus,
          }),
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
  await assertRequestedByMatchesFromStore({
    requestedByEmployeeId,
    requestingStoreId: storePair.sourceStoreId,
  });

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
            requestingStoreId: storePair.sourceStoreId,
            corporateStoreId: storePair.destinationStoreId,
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
    input.sourceStoreId ?? existing.request.requestingStoreId;
  const nextDestinationStoreId = isAdminUser(actor)
    ? (input.destinationStoreId ?? existing.request.corporateStoreId)
    : existing.request.corporateStoreId;

  if (!nextSourceStoreId) {
    throw new AppError(SOURCE_REQUIRED_MESSAGE, 400);
  }
  if (!nextDestinationStoreId) {
    throw new AppError(DESTINATION_REQUIRED_MESSAGE, 400);
  }

  if (
    !isAdminUser(actor) &&
    input.sourceStoreId &&
    input.sourceStoreId !== existing.request.requestingStoreId
  ) {
    throw new AppError(UNAUTHORIZED_SOURCE_MESSAGE, 403);
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

  if (!nextRequestedByEmployeeId) {
    throw new AppError(REQUESTED_BY_REQUIRED_MESSAGE, 400);
  }
  await assertRequestedByMatchesFromStore({
    requestedByEmployeeId: nextRequestedByEmployeeId,
    requestingStoreId: nextSourceStoreId,
  });

  if (input.lines) {
    await assertRequestLinesEligible(input.lines);
  }

  try {
    await getDb().transaction(async (tx) => {
      const updated = await tx
        .update(itemRequests)
        .set({
          ...(input.remarks !== undefined ? { remarks: input.remarks } : {}),
          requestingStoreId: nextSourceStoreId,
          corporateStoreId: nextDestinationStoreId,
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

      if (
        (input.action === "RETURN" || input.action === "REJECT") &&
        input.remarks == null
      ) {
        throw new AppError("Remarks are required for this action", 400);
      }

      if (isAdminUser(actor) && match.actor !== "BRANCH_MAKER") {
        throw new AppError(ADMIN_WORKFLOW_MESSAGE, 403);
      }

      if (!actorMatchesKind(request, actor, match.actor)) {
        throw new AppError("This request is not pending with you.", 403);
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
        if (!isAdminUser(actor)) {
          const makerAssignment = await getActiveMakerAssignment(actor.id);
          if (
            !makerAssignment ||
            makerAssignment.store.id !== request.requestingStoreId ||
            !assignmentHasChecker(makerAssignment)
          ) {
            throw new AppError(
              ITEM_REQUEST_MISSING_MAKER_OR_CHECKER_MESSAGE,
              403,
            );
          }
        }

        const requestingAssignment = await requireStoreMakerCheckerAssignment(
          request.requestingStoreId,
        );

        if (!request.corporateStoreId) {
          throw new AppError(DESTINATION_REQUIRED_MESSAGE, 400);
        }

        await assertStorePairForRequest({
          sourceStoreId: request.requestingStoreId,
          destinationStoreId: request.corporateStoreId,
        });

        await assertExistingLinesEligibleForSubmit(request.id);
        nextValues.branchCheckerApplicationUserId =
          requestingAssignment.supervisorApplicationUserId;
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
            sourceStoreId: request.requestingStoreId,
            destinationStoreId: request.corporateStoreId,
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
          throw new AppError(INACTIVE_DESTINATION_MESSAGE, 400);
        }

        const destinationRows = await tx
          .select({ isActive: stores.isActive })
          .from(stores)
          .where(eq(stores.id, request.corporateStoreId))
          .limit(1);

        if (!destinationRows[0]?.isActive) {
          throw new AppError(INACTIVE_DESTINATION_MESSAGE, 400);
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
        actorWorkflowRole: actorWorkflowRoleForTransition(actor, match.actor),
        remarks: input.remarks,
      });

      await insertItemRequestWorkflowNotifications(tx, {
        action: input.action,
        toStatus: match.to,
        requestId: request.id,
        requestNumber: request.requestNumber,
        actorUserId: actor.id,
        actorName: actor.employee?.employeeName ?? actor.username,
        remarks: input.remarks ?? null,
        createdByApplicationUserId: request.createdByApplicationUserId,
        branchCheckerApplicationUserId:
          nextValues.branchCheckerApplicationUserId ??
          request.branchCheckerApplicationUserId,
        corporateMakerApplicationUserId:
          nextValues.corporateMakerApplicationUserId ??
          request.corporateMakerApplicationUserId,
        corporateCheckerApplicationUserId:
          nextValues.corporateCheckerApplicationUserId ??
          request.corporateCheckerApplicationUserId,
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

export async function deleteItemRequest(
  id: string,
  actor: AuthenticatedUser,
  expectedVersion: number,
): Promise<void> {
  if (!isAdminUser(actor)) {
    throw new AppError("You cannot delete an item request", 403);
  }

  try {
    await getDb().transaction(async (tx) => {
      const existingRows = await tx
        .select({ id: itemRequests.id, version: itemRequests.version })
        .from(itemRequests)
        .where(eq(itemRequests.id, id))
        .limit(1);
      const existing = existingRows[0];
      if (!existing) {
        throw new AppError("Item request not found", 404);
      }
      if (existing.version !== expectedVersion) {
        throw new AppError(STALE_REQUEST_MESSAGE, 409);
      }

      const issueRows = await tx
        .select({ id: itemIssues.id })
        .from(itemIssues)
        .where(eq(itemIssues.requestId, id))
        .limit(1);
      if (issueRows[0]) {
        throw new AppError(
          "This item request cannot be deleted because it has item issue records.",
          409,
        );
      }

      await tx
        .delete(itemRequestActions)
        .where(eq(itemRequestActions.itemRequestId, id));
      await tx
        .delete(itemRequestLines)
        .where(eq(itemRequestLines.itemRequestId, id));
      const deleted = await tx
        .delete(itemRequests)
        .where(
          and(
            eq(itemRequests.id, id),
            eq(itemRequests.version, expectedVersion),
          ),
        )
        .returning({ id: itemRequests.id });

      if (!deleted[0]) {
        throw new AppError(STALE_REQUEST_MESSAGE, 409);
      }
    });
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    mapItemRequestDatabaseError(error);
  }
}
