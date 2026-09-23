import { and, asc, count, desc, eq, inArray, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type {
  AuthenticatedUser,
  ConfirmItemIssueReceiptInput,
  IncomingShipmentListItem,
  IncomingShipmentListQuery,
  InTransitQuantity,
  ItemIssueReceipt,
  ItemIssueShipment,
  PaginatedIncomingShipmentResponse,
  ReturnItemIssueReceiptInput,
  SubmitItemIssueReceiptInput,
} from "@printing-stationery/shared";
import {
  ITEM_ISSUE_OPEN_RECEIPT_STATUSES,
  ITEM_ISSUE_RECEIVABLE_DELIVERY_STATUSES,
  userHasRole,
} from "@printing-stationery/shared";
import { AppError } from "../utils/errors.js";
import {
  isStockLedgerReferenceLineUniqueViolation,
  mapItemIssueDatabaseError,
} from "../utils/db-errors.js";
import {
  ADMIN_ITEM_ISSUE_RECEIPT_FORBIDDEN_MESSAGE,
  ITEM_ISSUE_DESTINATION_FORBIDDEN_MESSAGE,
  ITEM_ISSUE_MAKER_CHECKER_FORBIDDEN_MESSAGE,
  ITEM_ISSUE_RECEIPT_RETURN_RETIRED_MESSAGE,
  actorMayConfirmDestinationReceipt,
} from "./item-issue-authorization.js";
import { postDestinationReceiptConfirmation } from "./item-issue-receipt-posting.js";
import { getDb } from "../db/client.js";
import {
  applicationUsers,
  type ApplicationUserRow,
} from "../db/schema/auth.js";
import { branches, type BranchRow } from "../db/schema/branches.js";
import { employees, type EmployeeRow } from "../db/schema/employees.js";
import {
  itemIssueReceiptLines,
  itemIssueReceipts,
  itemIssueShipmentLines,
  itemIssueShipments,
} from "../db/schema/item-issue-delivery.js";
import { itemIssues } from "../db/schema/item-issues.js";
import { itemRequests } from "../db/schema/item-requests.js";
import { items } from "../db/schema/items.js";
import { stores, type StoreRow } from "../db/schema/stores.js";
import { storeUsers } from "../db/schema/store-users.js";
import { units } from "../db/schema/units.js";

const STALE_RECEIPT_MESSAGE = "This receipt has changed. Refresh and try again.";

type AccessContext = {
  makerStoreIds: string[];
  supervisedStoreIds: string[];
  visibleStoreIds: string[];
};

const fromStores = alias(stores, "incoming_from_stores");
const fromBranches = alias(branches, "incoming_from_branches");
const toStores = alias(stores, "incoming_to_stores");
const toBranches = alias(branches, "incoming_to_branches");

function isAdminUser(actor: AuthenticatedUser): boolean {
  return userHasRole(actor.roles, "ADMIN");
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

function toStoreSummary(store: StoreRow, branch: BranchRow) {
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
) {
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

async function listMakerStoreIds(applicationUserId: string): Promise<string[]> {
  const rows = await getDb()
    .select({ storeId: storeUsers.storeId })
    .from(storeUsers)
    .innerJoin(stores, eq(storeUsers.storeId, stores.id))
    .where(
      and(
        eq(storeUsers.makerApplicationUserId, applicationUserId),
        eq(storeUsers.isActive, true),
        eq(stores.isActive, true),
      ),
    );
  return rows.map((row) => row.storeId);
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

export async function loadIncomingAccess(
  actor: AuthenticatedUser,
): Promise<AccessContext> {
  if (isAdminUser(actor)) {
    return { makerStoreIds: [], supervisedStoreIds: [], visibleStoreIds: [] };
  }
  const [makerStoreIds, supervisedStoreIds] = await Promise.all([
    listMakerStoreIds(actor.id),
    listSupervisedStoreIds(actor.id),
  ]);
  return {
    makerStoreIds,
    supervisedStoreIds,
    visibleStoreIds: [...new Set([...makerStoreIds, ...supervisedStoreIds])],
  };
}

function assertDestinationAccess(
  actor: AuthenticatedUser,
  access: AccessContext,
  toStoreId: string,
  kind: "maker" | "checker" | "any",
): void {
  if (isAdminUser(actor)) {
    if (kind !== "any") {
      throw new AppError(ITEM_ISSUE_MAKER_CHECKER_FORBIDDEN_MESSAGE, 403);
    }
    return;
  }
  if (kind === "maker" && !access.makerStoreIds.includes(toStoreId)) {
    throw new AppError(ITEM_ISSUE_DESTINATION_FORBIDDEN_MESSAGE, 403);
  }
  if (kind === "checker" && !access.supervisedStoreIds.includes(toStoreId)) {
    throw new AppError(ITEM_ISSUE_DESTINATION_FORBIDDEN_MESSAGE, 403);
  }
  if (kind === "any" && !access.visibleStoreIds.includes(toStoreId)) {
    throw new AppError(ITEM_ISSUE_DESTINATION_FORBIDDEN_MESSAGE, 403);
  }
}

const OPEN_RECEIPT_STATUSES = ITEM_ISSUE_OPEN_RECEIPT_STATUSES;

function destinationReceiptWorkflowRole(
  access: AccessContext,
  toStoreId: string,
): "BRANCH_MAKER" | "BRANCH_CHECKER" {
  if (access.supervisedStoreIds.includes(toStoreId)) {
    return "BRANCH_CHECKER";
  }
  return "BRANCH_MAKER";
}

function actorCanConfirmDestination(
  actor: AuthenticatedUser,
  access: AccessContext,
  toStoreId: string,
): boolean {
  return actorMayConfirmDestinationReceipt({
    actor,
    destinationStoreId: toStoreId,
    makerStoreIds: access.makerStoreIds,
    checkerStoreIds: access.supervisedStoreIds,
  });
}

function assertCanConfirmDestinationReceipt(
  actor: AuthenticatedUser,
  access: AccessContext,
  toStoreId: string,
): "BRANCH_MAKER" | "BRANCH_CHECKER" {
  if (isAdminUser(actor)) {
    throw new AppError(ADMIN_ITEM_ISSUE_RECEIPT_FORBIDDEN_MESSAGE, 403);
  }
  if (!actorCanConfirmDestination(actor, access, toStoreId)) {
    throw new AppError(ITEM_ISSUE_DESTINATION_FORBIDDEN_MESSAGE, 403);
  }
  return destinationReceiptWorkflowRole(access, toStoreId);
}

function rethrowReceiptConfirmationError(error: unknown): never {
  if (error instanceof AppError) {
    throw error;
  }
  if (isStockLedgerReferenceLineUniqueViolation(error)) {
    throw new AppError("Receipt has already been confirmed.", 409, {
      cause: error,
    });
  }
  mapItemIssueDatabaseError(error);
}

export async function getShipmentDetailForIssue(
  issueId: string,
  actor: AuthenticatedUser,
  access: AccessContext,
): Promise<ItemIssueShipment | null> {
  const rows = await getDb()
    .select({
      shipment: itemIssueShipments,
      issue: itemIssues,
      requestNumber: itemRequests.requestNumber,
      fromStore: fromStores,
      fromBranch: fromBranches,
      toStore: toStores,
      toBranch: toBranches,
      dispatchedByUser: applicationUsers,
      dispatchedByEmployee: employees,
    })
    .from(itemIssueShipments)
    .innerJoin(itemIssues, eq(itemIssueShipments.itemIssueId, itemIssues.id))
    .leftJoin(itemRequests, eq(itemIssueShipments.requestId, itemRequests.id))
    .innerJoin(fromStores, eq(itemIssueShipments.fromStoreId, fromStores.id))
    .innerJoin(fromBranches, eq(fromStores.branchId, fromBranches.id))
    .innerJoin(toStores, eq(itemIssueShipments.toStoreId, toStores.id))
    .innerJoin(toBranches, eq(toStores.branchId, toBranches.id))
    .innerJoin(
      applicationUsers,
      eq(itemIssueShipments.dispatchedByApplicationUserId, applicationUsers.id),
    )
    .leftJoin(employees, eq(applicationUsers.employeeId, employees.id))
    .where(eq(itemIssueShipments.itemIssueId, issueId))
    .limit(1);

  const row = rows[0];
  if (!row) {
    return null;
  }
  if (!isAdminUser(actor) && !access.visibleStoreIds.includes(row.shipment.toStoreId) && !access.visibleStoreIds.includes(row.shipment.fromStoreId)) {
    return null;
  }
  return mapShipment(row, actor, access);
}

async function mapShipment(
  row: {
    shipment: typeof itemIssueShipments.$inferSelect;
    issue: typeof itemIssues.$inferSelect;
    requestNumber: string | null;
    fromStore: StoreRow;
    fromBranch: BranchRow;
    toStore: StoreRow;
    toBranch: BranchRow;
    dispatchedByUser: ApplicationUserRow;
    dispatchedByEmployee: EmployeeRow | null;
  },
  actor: AuthenticatedUser,
  access: AccessContext,
): Promise<ItemIssueShipment> {
  const lineRows = await getDb()
    .select({
      line: itemIssueShipmentLines,
      itemCode: items.itemCode,
      itemName: items.itemName,
      unitName: units.unitName,
    })
    .from(itemIssueShipmentLines)
    .innerJoin(items, eq(itemIssueShipmentLines.itemId, items.id))
    .innerJoin(units, eq(itemIssueShipmentLines.unitId, units.id))
    .where(eq(itemIssueShipmentLines.shipmentId, row.shipment.id))
    .orderBy(asc(items.itemName), asc(itemIssueShipmentLines.id));

  const receipts = await listReceiptsForShipment(row.shipment.id, actor, access, row.shipment.toStoreId);
  const canConfirmReceipt =
    (ITEM_ISSUE_RECEIVABLE_DELIVERY_STATUSES as readonly string[]).includes(
      row.shipment.deliveryStatus,
    ) && actorCanConfirmDestination(actor, access, row.shipment.toStoreId);

  return {
    id: row.shipment.id,
    itemIssueId: row.issue.id,
    issueNumber: row.issue.issueNumber,
    requestId: row.shipment.requestId,
    requestNumber: row.requestNumber,
    deliveryStatus: row.shipment.deliveryStatus,
    dispatchedAt: row.shipment.dispatchedAt.toISOString(),
    receivedAt: row.shipment.receivedAt?.toISOString() ?? null,
    fromStore: toStoreSummary(row.fromStore, row.fromBranch),
    toStore: toStoreSummary(row.toStore, row.toBranch),
    dispatchedBy: toPersonSummary(row.dispatchedByUser, row.dispatchedByEmployee)!,
    lines: lineRows.map((line) => ({
      id: line.line.id,
      itemIssueLineId: line.line.itemIssueLineId,
      itemId: line.line.itemId,
      itemCode: line.itemCode,
      itemName: line.itemName,
      unit: { id: line.line.unitId, unitName: line.unitName },
      dispatchedQuantity: String(line.line.dispatchedQuantity),
      confirmedReceivedQuantity: String(line.line.confirmedReceivedQuantity),
      remainingInTransitQuantity: String(line.line.remainingInTransitQuantity),
      discrepancyQuantity: String(line.line.discrepancyQuantity),
    })),
    receipts,
    canRecordReceipt: false,
    canConfirmReceipt,
  };
}

async function listReceiptsForShipment(
  shipmentId: string,
  actor: AuthenticatedUser,
  access: AccessContext,
  toStoreId: string,
): Promise<ItemIssueReceipt[]> {
  const createdByUsers = alias(applicationUsers, "receipt_created_by_users");
  const createdByEmployees = alias(employees, "receipt_created_by_employees");
  const submittedByUsers = alias(applicationUsers, "receipt_submitted_by_users");
  const submittedByEmployees = alias(employees, "receipt_submitted_by_employees");
  const verifiedByUsers = alias(applicationUsers, "receipt_verified_by_users");
  const verifiedByEmployees = alias(employees, "receipt_verified_by_employees");

  const rows = await getDb()
    .select({
      receipt: itemIssueReceipts,
      createdByUser: createdByUsers,
      createdByEmployee: createdByEmployees,
      submittedByUser: submittedByUsers,
      submittedByEmployee: submittedByEmployees,
      verifiedByUser: verifiedByUsers,
      verifiedByEmployee: verifiedByEmployees,
    })
    .from(itemIssueReceipts)
    .innerJoin(
      createdByUsers,
      eq(itemIssueReceipts.createdByApplicationUserId, createdByUsers.id),
    )
    .leftJoin(createdByEmployees, eq(createdByUsers.employeeId, createdByEmployees.id))
    .leftJoin(
      submittedByUsers,
      eq(itemIssueReceipts.submittedByApplicationUserId, submittedByUsers.id),
    )
    .leftJoin(
      submittedByEmployees,
      eq(submittedByUsers.employeeId, submittedByEmployees.id),
    )
    .leftJoin(
      verifiedByUsers,
      eq(itemIssueReceipts.verifiedByApplicationUserId, verifiedByUsers.id),
    )
    .leftJoin(
      verifiedByEmployees,
      eq(verifiedByUsers.employeeId, verifiedByEmployees.id),
    )
    .where(eq(itemIssueReceipts.shipmentId, shipmentId))
    .orderBy(asc(itemIssueReceipts.createdAt), asc(itemIssueReceipts.id));

  const receiptIds = rows.map((row) => row.receipt.id);
  const lineRows =
    receiptIds.length === 0
      ? []
      : await getDb()
          .select()
          .from(itemIssueReceiptLines)
          .where(inArray(itemIssueReceiptLines.receiptId, receiptIds));
  const linesByReceipt = new Map<string, typeof lineRows>();
  for (const line of lineRows) {
    const current = linesByReceipt.get(line.receiptId) ?? [];
    current.push(line);
    linesByReceipt.set(line.receiptId, current);
  }

  return rows.map((row) => {
    const open = (OPEN_RECEIPT_STATUSES as readonly string[]).includes(
      row.receipt.status,
    );
    const canConfirm =
      open && actorCanConfirmDestination(actor, access, toStoreId);
    return {
      id: row.receipt.id,
      shipmentId: row.receipt.shipmentId,
      status: row.receipt.status,
      version: row.receipt.version,
      receiptDate: row.receipt.receiptDate.toISOString(),
      remarks: row.receipt.remarks ?? null,
      discrepancyResolution: row.receipt.discrepancyResolution ?? null,
      createdAt: row.receipt.createdAt.toISOString(),
      submittedAt: row.receipt.submittedAt?.toISOString() ?? null,
      verifiedAt: row.receipt.verifiedAt?.toISOString() ?? null,
      createdBy: toPersonSummary(row.createdByUser, row.createdByEmployee)!,
      submittedBy: toPersonSummary(row.submittedByUser, row.submittedByEmployee),
      verifiedBy: toPersonSummary(row.verifiedByUser, row.verifiedByEmployee),
      confirmedWorkflowRole: row.receipt.confirmedWorkflowRole ?? null,
      canSubmit: false,
      canConfirm,
      canReturn: false,
      lines: (linesByReceipt.get(row.receipt.id) ?? []).map((line) => ({
        id: line.id,
        shipmentLineId: line.shipmentLineId,
        receivedQuantityNow: String(line.receivedQuantityNow),
        missingQuantity: String(line.missingQuantity),
        damagedQuantity: String(line.damagedQuantity),
        excessQuantity: String(line.excessQuantity),
        discrepancyReason: line.discrepancyReason,
        remarks: line.remarks ?? null,
      })),
    };
  });
}

function incomingQueueCondition(queue: IncomingShipmentListQuery["queue"]): SQL | undefined {
  if (!queue) {
    return sql`${itemIssueShipments.deliveryStatus} <> 'NEEDS_REVIEW'`;
  }
  if (queue === "in-transit") {
    return eq(itemIssueShipments.deliveryStatus, "IN_TRANSIT");
  }
  if (queue === "partially-received") {
    return eq(itemIssueShipments.deliveryStatus, "PARTIALLY_RECEIVED");
  }
  if (queue === "received") {
    return eq(itemIssueShipments.deliveryStatus, "RECEIVED");
  }
  if (queue === "received-with-discrepancy") {
    return eq(itemIssueShipments.deliveryStatus, "RECEIVED_WITH_DISCREPANCY");
  }
  return sql`exists (
    select 1 from ${itemIssueReceipts}
    where ${itemIssueReceipts.shipmentId} = ${itemIssueShipments.id}
      and ${itemIssueReceipts.status} = 'PENDING_VERIFICATION'
  )`;
}

export async function listIncomingShipments(
  actor: AuthenticatedUser,
  query: IncomingShipmentListQuery,
): Promise<PaginatedIncomingShipmentResponse> {
  const access = await loadIncomingAccess(actor);
  if (!isAdminUser(actor) && access.visibleStoreIds.length === 0) {
    return { items: [], page: query.page, pageSize: query.pageSize, totalItems: 0, totalPages: 0 };
  }

  const conditions: SQL[] = [
    sql`${itemIssueShipments.deliveryStatus} <> 'NEEDS_REVIEW'`,
  ];
  if (!isAdminUser(actor)) {
    conditions.push(inArray(itemIssueShipments.toStoreId, access.visibleStoreIds));
  }
  const queueCondition = incomingQueueCondition(query.queue);
  if (queueCondition) {
    conditions.push(queueCondition);
  }
  if (query.search) {
    const pattern = `%${query.search.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_")}%`;
    conditions.push(
      or(
        sql`${itemIssues.issueNumber} ILIKE ${pattern} ESCAPE '\\'`,
        sql`${itemRequests.requestNumber} ILIKE ${pattern} ESCAPE '\\'`,
      )!,
    );
  }
  const where = conditions.length === 0 ? undefined : conditions.length === 1 ? conditions[0] : and(...conditions);

  try {
    const base = getDb()
      .select({ value: count() })
      .from(itemIssueShipments)
      .innerJoin(itemIssues, eq(itemIssueShipments.itemIssueId, itemIssues.id))
      .leftJoin(itemRequests, eq(itemIssueShipments.requestId, itemRequests.id));
    const totalItems = (where ? await base.where(where) : await base)[0]?.value ?? 0;
    const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / query.pageSize);

    const listRows = await getDb()
      .select({
        shipment: itemIssueShipments,
        issue: itemIssues,
        requestNumber: itemRequests.requestNumber,
        fromStore: fromStores,
        fromBranch: fromBranches,
        toStore: toStores,
        toBranch: toBranches,
      })
      .from(itemIssueShipments)
      .innerJoin(itemIssues, eq(itemIssueShipments.itemIssueId, itemIssues.id))
      .leftJoin(itemRequests, eq(itemIssueShipments.requestId, itemRequests.id))
      .innerJoin(fromStores, eq(itemIssueShipments.fromStoreId, fromStores.id))
      .innerJoin(fromBranches, eq(fromStores.branchId, fromBranches.id))
      .innerJoin(toStores, eq(itemIssueShipments.toStoreId, toStores.id))
      .innerJoin(toBranches, eq(toStores.branchId, toBranches.id))
      .where(where)
      .orderBy(desc(itemIssueShipments.dispatchedAt), desc(itemIssueShipments.id))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize);

    const shipmentIds = listRows.map((row) => row.shipment.id);
    const lineRows =
      shipmentIds.length === 0
        ? []
        : await getDb()
            .select({
              shipmentId: itemIssueShipmentLines.shipmentId,
              itemCode: items.itemCode,
              itemName: items.itemName,
              unitName: units.unitName,
              dispatchedQuantity: itemIssueShipmentLines.dispatchedQuantity,
              confirmedReceivedQuantity: itemIssueShipmentLines.confirmedReceivedQuantity,
              remainingInTransitQuantity: itemIssueShipmentLines.remainingInTransitQuantity,
            })
            .from(itemIssueShipmentLines)
            .innerJoin(items, eq(itemIssueShipmentLines.itemId, items.id))
            .innerJoin(units, eq(itemIssueShipmentLines.unitId, units.id))
            .where(inArray(itemIssueShipmentLines.shipmentId, shipmentIds));

    const pendingRows =
      shipmentIds.length === 0
        ? []
        : await getDb()
            .select({ shipmentId: itemIssueReceipts.shipmentId })
            .from(itemIssueReceipts)
            .where(
              and(
                inArray(itemIssueReceipts.shipmentId, shipmentIds),
                eq(itemIssueReceipts.status, "PENDING_VERIFICATION"),
              ),
            );
    const pending = new Set(pendingRows.map((row) => row.shipmentId));

    const itemsOut: IncomingShipmentListItem[] = listRows.map((row) => ({
      id: row.shipment.id,
      itemIssueId: row.issue.id,
      issueNumber: row.issue.issueNumber,
      requestNumber: row.requestNumber,
      fromStore: toStoreSummary(row.fromStore, row.fromBranch),
      toStore: toStoreSummary(row.toStore, row.toBranch),
      dispatchDate: row.shipment.dispatchedAt.toISOString(),
      receivedDate: row.shipment.receivedAt?.toISOString() ?? null,
      deliveryStatus: row.shipment.deliveryStatus,
      awaitingReceiptVerification: pending.has(row.shipment.id),
      itemSummaries: lineRows
        .filter((line) => line.shipmentId === row.shipment.id)
        .map((line) => ({
          itemCode: line.itemCode,
          itemName: line.itemName,
          unitName: line.unitName,
          dispatchedQuantity: String(line.dispatchedQuantity),
          confirmedReceivedQuantity: String(line.confirmedReceivedQuantity),
          remainingInTransitQuantity: String(line.remainingInTransitQuantity),
        })),
      canRecordReceipt: false,
      canConfirmReceipt:
        (ITEM_ISSUE_RECEIVABLE_DELIVERY_STATUSES as readonly string[]).includes(
          row.shipment.deliveryStatus,
        ) && actorCanConfirmDestination(actor, access, row.shipment.toStoreId),
    }));

    return {
      items: itemsOut,
      page: query.page,
      pageSize: query.pageSize,
      totalItems,
      totalPages,
    };
  } catch (error) {
    mapItemIssueDatabaseError(error);
  }
}

export async function getIncomingShipment(
  shipmentId: string,
  actor: AuthenticatedUser,
): Promise<ItemIssueShipment> {
  const access = await loadIncomingAccess(actor);
  const rows = await getDb()
    .select({
      shipment: itemIssueShipments,
      issue: itemIssues,
      requestNumber: itemRequests.requestNumber,
      fromStore: fromStores,
      fromBranch: fromBranches,
      toStore: toStores,
      toBranch: toBranches,
      dispatchedByUser: applicationUsers,
      dispatchedByEmployee: employees,
    })
    .from(itemIssueShipments)
    .innerJoin(itemIssues, eq(itemIssueShipments.itemIssueId, itemIssues.id))
    .leftJoin(itemRequests, eq(itemIssueShipments.requestId, itemRequests.id))
    .innerJoin(fromStores, eq(itemIssueShipments.fromStoreId, fromStores.id))
    .innerJoin(fromBranches, eq(fromStores.branchId, fromBranches.id))
    .innerJoin(toStores, eq(itemIssueShipments.toStoreId, toStores.id))
    .innerJoin(toBranches, eq(toStores.branchId, toBranches.id))
    .innerJoin(
      applicationUsers,
      eq(itemIssueShipments.dispatchedByApplicationUserId, applicationUsers.id),
    )
    .leftJoin(employees, eq(applicationUsers.employeeId, employees.id))
    .where(eq(itemIssueShipments.id, shipmentId))
    .limit(1);
  const row = rows[0];
  if (!row) {
    throw new AppError("Shipment is not awaiting receipt.", 404);
  }
  assertDestinationAccess(actor, access, row.shipment.toStoreId, "any");
  return mapShipment(row, actor, access);
}

export async function submitItemIssueReceipt(
  shipmentId: string,
  actor: AuthenticatedUser,
  input: SubmitItemIssueReceiptInput,
): Promise<ItemIssueShipment> {
  const access = await loadIncomingAccess(actor);
  try {
    await getDb().transaction(async (tx) => {
      const shipmentRows = await tx
        .select()
        .from(itemIssueShipments)
        .where(eq(itemIssueShipments.id, shipmentId))
        .for("update");
      const shipment = shipmentRows[0];
      if (!shipment) {
        throw new AppError("Shipment is not awaiting receipt.", 404);
      }
      if (
        shipment.deliveryStatus !== "IN_TRANSIT" &&
        shipment.deliveryStatus !== "PARTIALLY_RECEIVED"
      ) {
        throw new AppError("Shipment is not awaiting receipt.", 409);
      }
      const workflowRole = assertCanConfirmDestinationReceipt(
        actor,
        access,
        shipment.toStoreId,
      );

      const shipmentLines = await tx
        .select()
        .from(itemIssueShipmentLines)
        .where(eq(itemIssueShipmentLines.shipmentId, shipmentId))
        .for("update");
      const lineById = new Map(shipmentLines.map((line) => [line.id, line]));
      for (const line of input.lines) {
        const shipmentLine = lineById.get(line.shipmentLineId);
        if (!shipmentLine) {
          throw new AppError("Receipt lines must belong to this shipment.", 400);
        }
        const received = parseQuantityToScaled(line.receivedQuantityNow);
        const damaged = parseQuantityToScaled(line.damagedQuantity ?? "0");
        const remaining = parseQuantityToScaled(
          String(shipmentLine.remainingInTransitQuantity),
        );
        if (received <= 0n || received + damaged > remaining) {
          throw new AppError(
            "Receipt quantity exceeds remaining in-transit quantity.",
            409,
          );
        }
      }

      const openRows = await tx
        .select()
        .from(itemIssueReceipts)
        .where(
          and(
            eq(itemIssueReceipts.shipmentId, shipmentId),
            inArray(itemIssueReceipts.status, [...OPEN_RECEIPT_STATUSES]),
          ),
        )
        .for("update");
      const openReceipt = openRows[0];
      let receiptId = openReceipt?.id;
      let expectedVersion = openReceipt?.version ?? 1;
      if (openReceipt) {
        await tx
          .update(itemIssueReceipts)
          .set({
            receiptDate: new Date(input.receiptDate),
            remarks: input.remarks,
            discrepancyResolution: input.discrepancyResolution ?? null,
            updatedAt: new Date(),
          })
          .where(eq(itemIssueReceipts.id, openReceipt.id));
        await replaceOpenReceiptLines(tx, openReceipt.id, input.lines);
      } else {
        const inserted = await tx
          .insert(itemIssueReceipts)
          .values({
            shipmentId,
            status: "PENDING_VERIFICATION",
            receiptDate: new Date(input.receiptDate),
            remarks: input.remarks,
            discrepancyResolution: input.discrepancyResolution,
            createdByApplicationUserId: actor.id,
            submittedByApplicationUserId: actor.id,
            submittedAt: new Date(),
          })
          .returning({ id: itemIssueReceipts.id, version: itemIssueReceipts.version });
        receiptId = inserted[0]?.id;
        expectedVersion = inserted[0]?.version ?? 1;
        if (!receiptId) {
          throw new AppError("Failed to record receipt.", 500);
        }
        await tx.insert(itemIssueReceiptLines).values(
          input.lines.map((line) => ({
            receiptId: receiptId!,
            shipmentLineId: line.shipmentLineId,
            receivedQuantityNow: line.receivedQuantityNow,
            missingQuantity: line.missingQuantity ?? "0",
            damagedQuantity: line.damagedQuantity ?? "0",
            excessQuantity: line.excessQuantity ?? "0",
            discrepancyReason: line.discrepancyReason ?? null,
            remarks: line.remarks,
          })),
        );
      }

      await postDestinationReceiptConfirmation(tx, {
        receiptId: receiptId!,
        expectedVersion,
        actor,
        workflowRole,
        resolution: input.discrepancyResolution ?? "KEEP_IN_TRANSIT",
        remarks: input.remarks,
      });
    });
    return getIncomingShipment(shipmentId, actor);
  } catch (error) {
    rethrowReceiptConfirmationError(error);
  }
}

async function replaceOpenReceiptLines(
  tx: Pick<ReturnType<typeof getDb>, "select" | "insert" | "update" | "delete">,
  receiptId: string,
  lines: SubmitItemIssueReceiptInput["lines"],
): Promise<void> {
  const existing = await tx
    .select()
    .from(itemIssueReceiptLines)
    .where(eq(itemIssueReceiptLines.receiptId, receiptId))
    .for("update");
  const incomingIds = new Set(lines.map((line) => line.shipmentLineId));
  for (const line of existing) {
    if (!incomingIds.has(line.shipmentLineId)) {
      await tx
        .delete(itemIssueReceiptLines)
        .where(eq(itemIssueReceiptLines.id, line.id));
    }
  }
  for (const line of lines) {
    const current = existing.find((row) => row.shipmentLineId === line.shipmentLineId);
    const values = {
      receivedQuantityNow: line.receivedQuantityNow,
      missingQuantity: line.missingQuantity ?? "0",
      damagedQuantity: line.damagedQuantity ?? "0",
      excessQuantity: line.excessQuantity ?? "0",
      discrepancyReason: line.discrepancyReason ?? null,
      remarks: line.remarks,
      updatedAt: new Date(),
    };
    if (current) {
      await tx
        .update(itemIssueReceiptLines)
        .set(values)
        .where(eq(itemIssueReceiptLines.id, current.id));
    } else {
      await tx.insert(itemIssueReceiptLines).values({
        receiptId,
        shipmentLineId: line.shipmentLineId,
        ...values,
      });
    }
  }
}

export async function returnItemIssueReceipt(
  receiptId: string,
  actor: AuthenticatedUser,
  input: ReturnItemIssueReceiptInput,
): Promise<ItemIssueShipment> {
  const access = await loadIncomingAccess(actor);
  const receiptRows = await getDb()
    .select()
    .from(itemIssueReceipts)
    .where(eq(itemIssueReceipts.id, receiptId))
    .limit(1);
  const receipt = receiptRows[0];
  if (!receipt) {
    throw new AppError("Receipt not found", 404);
  }
  if (receipt.version !== input.expectedVersion) {
    throw new AppError(STALE_RECEIPT_MESSAGE, 409);
  }
  const shipmentRows = await getDb()
    .select()
    .from(itemIssueShipments)
    .where(eq(itemIssueShipments.id, receipt.shipmentId))
    .limit(1);
  const shipment = shipmentRows[0];
  if (!shipment) {
    throw new AppError("Shipment is not awaiting receipt.", 404);
  }
  assertCanConfirmDestinationReceipt(actor, access, shipment.toStoreId);
  throw new AppError(ITEM_ISSUE_RECEIPT_RETURN_RETIRED_MESSAGE, 409);
}

export async function confirmItemIssueReceipt(
  receiptId: string,
  actor: AuthenticatedUser,
  input: ConfirmItemIssueReceiptInput,
): Promise<ItemIssueShipment> {
  const access = await loadIncomingAccess(actor);
  const previewRows = await getDb()
    .select()
    .from(itemIssueReceipts)
    .where(eq(itemIssueReceipts.id, receiptId))
    .limit(1);
  const preview = previewRows[0];
  if (!preview) {
    throw new AppError("Receipt not found", 404);
  }
  const shipmentRows = await getDb()
    .select()
    .from(itemIssueShipments)
    .where(eq(itemIssueShipments.id, preview.shipmentId))
    .limit(1);
  const shipment = shipmentRows[0];
  if (!shipment) {
    throw new AppError("Shipment is not awaiting receipt.", 404);
  }
  const workflowRole = assertCanConfirmDestinationReceipt(
    actor,
    access,
    shipment.toStoreId,
  );
  try {
    await getDb().transaction(async (tx) => {
      await postDestinationReceiptConfirmation(tx, {
        receiptId,
        expectedVersion: input.expectedVersion,
        actor,
        workflowRole,
        resolution:
          input.discrepancyResolution ??
          preview.discrepancyResolution ??
          "KEEP_IN_TRANSIT",
        remarks: input.remarks,
      });
    });
    return getIncomingShipment(shipment.id, actor);
  } catch (error) {
    rethrowReceiptConfirmationError(error);
  }
}

export async function listInTransitQuantities(
  actor: AuthenticatedUser,
): Promise<InTransitQuantity[]> {
  const access = await loadIncomingAccess(actor);
  if (!isAdminUser(actor) && access.visibleStoreIds.length === 0) {
    return [];
  }

  const conditions: SQL[] = [
    sql`${itemIssueShipmentLines.remainingInTransitQuantity}::numeric > 0`,
    sql`${itemIssueShipments.deliveryStatus} in ('IN_TRANSIT', 'PARTIALLY_RECEIVED')`,
  ];
  if (!isAdminUser(actor)) {
    conditions.push(
      or(
        inArray(itemIssueShipments.toStoreId, access.visibleStoreIds),
        inArray(itemIssueShipments.fromStoreId, access.visibleStoreIds),
      )!,
    );
  }

  const rows = await getDb()
    .select({
      itemId: items.id,
      itemCode: items.itemCode,
      itemName: items.itemName,
      unitId: units.id,
      unitName: units.unitName,
      fromStoreId: itemIssueShipments.fromStoreId,
      toStoreId: itemIssueShipments.toStoreId,
      remainingInTransitQuantity: sql<string>`sum(${itemIssueShipmentLines.remainingInTransitQuantity})::text`,
    })
    .from(itemIssueShipmentLines)
    .innerJoin(
      itemIssueShipments,
      eq(itemIssueShipmentLines.shipmentId, itemIssueShipments.id),
    )
    .innerJoin(items, eq(itemIssueShipmentLines.itemId, items.id))
    .innerJoin(units, eq(itemIssueShipmentLines.unitId, units.id))
    .where(and(...conditions))
    .groupBy(
      items.id,
      items.itemCode,
      items.itemName,
      units.id,
      units.unitName,
      itemIssueShipments.fromStoreId,
      itemIssueShipments.toStoreId,
    )
    .orderBy(asc(items.itemName), asc(items.itemCode));

  return rows.map((row) => ({
    itemId: row.itemId,
    itemCode: row.itemCode,
    itemName: row.itemName,
    unit: { id: row.unitId, unitName: row.unitName },
    fromStoreId: row.fromStoreId,
    toStoreId: row.toStoreId,
    remainingInTransitQuantity: String(row.remainingInTransitQuantity),
  }));
}
