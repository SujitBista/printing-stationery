import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import {
  confirmItemIssueReceiptInputSchema,
  createDepartmentIssueInputSchema,
  createItemIssueInputSchema,
  departmentConsumptionListQuerySchema,
  incomingShipmentListQuerySchema,
  itemIssueIdSchema,
  itemIssueListQuerySchema,
  itemIssueReceiptIdSchema,
  itemIssueShipmentIdSchema,
  itemRequestIdSchema,
  rejectItemIssueInputSchema,
  returnItemIssueInputSchema,
  returnItemIssueReceiptInputSchema,
  submitItemIssueInputSchema,
  submitItemIssueReceiptInputSchema,
  updateDepartmentIssueInputSchema,
  updateItemIssueInputSchema,
  verifyItemIssueInputSchema,
} from "@printing-stationery/shared";
import {
  createDepartmentIssue,
  createItemIssueFromRequest,
  getItemIssueById,
  getItemIssueEligibility,
  listDepartmentConsumptions,
  listItemIssues,
  rejectItemIssue,
  returnItemIssue,
  submitItemIssue,
  updateDepartmentIssue,
  updateItemIssue,
  verifyAndPostItemIssue,
} from "../services/item-issues.service.js";
import {
  confirmItemIssueReceipt,
  getIncomingShipment,
  listIncomingShipments,
  listInTransitQuantities,
  returnItemIssueReceipt,
  submitItemIssueReceipt,
} from "../services/item-issue-receipts.service.js";
import { AppError } from "../utils/errors.js";

function validationMessage(error: ZodError): string {
  const issue = error.issues[0];
  if (!issue) {
    return "Invalid request";
  }

  const path = issue.path.length > 0 ? issue.path.join(".") : undefined;
  return path ? `${path}: ${issue.message}` : issue.message;
}

function parseOrThrow<T>(
  result: { success: true; data: T } | { success: false; error: ZodError },
): T {
  if (!result.success) {
    throw new AppError(validationMessage(result.error), 400);
  }
  return result.data;
}

function requireActor(req: Request) {
  if (!req.auth) {
    throw new AppError("Unauthorized", 401);
  }
  return req.auth.user;
}

export async function getItemIssueEligibilityHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const actor = requireActor(req);
    const requestId = parseOrThrow(itemRequestIdSchema.safeParse(req.params.requestId));
    const result = await getItemIssueEligibility(requestId, actor);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function createItemIssueFromRequestHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const actor = requireActor(req);
    const requestId = parseOrThrow(itemRequestIdSchema.safeParse(req.params.requestId));
    const input = parseOrThrow(createItemIssueInputSchema.safeParse(req.body));
    const result = await createItemIssueFromRequest(requestId, actor, input);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}

export async function listItemIssuesHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const actor = requireActor(req);
    const query = parseOrThrow(itemIssueListQuerySchema.safeParse(req.query));
    const result = await listItemIssues(actor, query);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function getItemIssueHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const actor = requireActor(req);
    const issueId = parseOrThrow(itemIssueIdSchema.safeParse(req.params.issueId));
    const result = await getItemIssueById(issueId, actor);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function updateItemIssueHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const actor = requireActor(req);
    const issueId = parseOrThrow(itemIssueIdSchema.safeParse(req.params.issueId));
    const input = parseOrThrow(updateItemIssueInputSchema.safeParse(req.body));
    const result = await updateItemIssue(issueId, actor, input);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function submitItemIssueHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const actor = requireActor(req);
    const issueId = parseOrThrow(itemIssueIdSchema.safeParse(req.params.issueId));
    const input = parseOrThrow(submitItemIssueInputSchema.safeParse(req.body));
    const result = await submitItemIssue(issueId, actor, input);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function verifyItemIssueHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const actor = requireActor(req);
    const issueId = parseOrThrow(itemIssueIdSchema.safeParse(req.params.issueId));
    const input = parseOrThrow(verifyItemIssueInputSchema.safeParse(req.body));
    const result = await verifyAndPostItemIssue(issueId, actor, input);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function returnItemIssueHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const actor = requireActor(req);
    const issueId = parseOrThrow(itemIssueIdSchema.safeParse(req.params.issueId));
    const input = parseOrThrow(returnItemIssueInputSchema.safeParse(req.body));
    const result = await returnItemIssue(issueId, actor, input);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function rejectItemIssueHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const actor = requireActor(req);
    const issueId = parseOrThrow(itemIssueIdSchema.safeParse(req.params.issueId));
    const input = parseOrThrow(rejectItemIssueInputSchema.safeParse(req.body));
    const result = await rejectItemIssue(issueId, actor, input);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function createDepartmentIssueHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const actor = requireActor(req);
    const input = parseOrThrow(createDepartmentIssueInputSchema.safeParse(req.body));
    const result = await createDepartmentIssue(actor, input);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}

export async function updateDepartmentIssueHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const actor = requireActor(req);
    const issueId = parseOrThrow(itemIssueIdSchema.safeParse(req.params.issueId));
    const input = parseOrThrow(updateDepartmentIssueInputSchema.safeParse(req.body));
    const result = await updateDepartmentIssue(issueId, actor, input);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function listDepartmentConsumptionsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const actor = requireActor(req);
    const query = parseOrThrow(
      departmentConsumptionListQuerySchema.safeParse(req.query),
    );
    const result = await listDepartmentConsumptions(actor, query);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function listIncomingShipmentsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const actor = requireActor(req);
    const query = parseOrThrow(incomingShipmentListQuerySchema.safeParse(req.query));
    const result = await listIncomingShipments(actor, query);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function getIncomingShipmentHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const actor = requireActor(req);
    const shipmentId = parseOrThrow(
      itemIssueShipmentIdSchema.safeParse(req.params.shipmentId),
    );
    const result = await getIncomingShipment(shipmentId, actor);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function submitItemIssueReceiptHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const actor = requireActor(req);
    const shipmentId = parseOrThrow(
      itemIssueShipmentIdSchema.safeParse(req.params.shipmentId),
    );
    const input = parseOrThrow(submitItemIssueReceiptInputSchema.safeParse(req.body));
    const result = await submitItemIssueReceipt(shipmentId, actor, input);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function confirmItemIssueReceiptHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const actor = requireActor(req);
    const receiptId = parseOrThrow(
      itemIssueReceiptIdSchema.safeParse(req.params.receiptId),
    );
    const input = parseOrThrow(confirmItemIssueReceiptInputSchema.safeParse(req.body));
    const result = await confirmItemIssueReceipt(receiptId, actor, input);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function completeItemIssueReceiptWithDiscrepancyHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const actor = requireActor(req);
    const receiptId = parseOrThrow(
      itemIssueReceiptIdSchema.safeParse(req.params.receiptId),
    );
    const input = parseOrThrow(confirmItemIssueReceiptInputSchema.safeParse(req.body));
    const result = await confirmItemIssueReceipt(receiptId, actor, {
      ...input,
      discrepancyResolution: "COMPLETE_WITH_DISCREPANCY",
    });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function returnItemIssueReceiptHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const actor = requireActor(req);
    const receiptId = parseOrThrow(
      itemIssueReceiptIdSchema.safeParse(req.params.receiptId),
    );
    const input = parseOrThrow(returnItemIssueReceiptInputSchema.safeParse(req.body));
    const result = await returnItemIssueReceipt(receiptId, actor, input);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function listInTransitQuantitiesHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const actor = requireActor(req);
    const result = await listInTransitQuantities(actor);
    res.status(200).json({ items: result });
  } catch (error) {
    next(error);
  }
}
