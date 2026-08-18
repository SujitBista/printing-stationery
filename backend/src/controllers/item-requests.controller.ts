import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import {
  createItemRequestInputSchema,
  eligibleItemRequestItemListQuerySchema,
  itemRequestActionInputSchema,
  itemRequestIdSchema,
  itemRequestListQuerySchema,
  updateItemRequestInputSchema,
} from "@printing-stationery/shared";
import {
  createItemRequest,
  getItemRequestById,
  getItemRequestContext,
  listEligibleItemRequestItems,
  listItemRequests,
  performItemRequestAction,
  updateItemRequest,
} from "../services/item-requests.service.js";
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

export async function listItemRequestsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const actor = requireActor(req);
    const query = parseOrThrow(itemRequestListQuerySchema.safeParse(req.query));
    const result = await listItemRequests(actor, query);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function getItemRequestContextHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const actor = requireActor(req);
    const result = await getItemRequestContext(actor);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function listEligibleItemRequestItemsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const actor = requireActor(req);
    const query = parseOrThrow(
      eligibleItemRequestItemListQuerySchema.safeParse(req.query),
    );
    const result = await listEligibleItemRequestItems(actor, query);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function getItemRequestHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const actor = requireActor(req);
    const id = parseOrThrow(itemRequestIdSchema.safeParse(req.params.id));
    const result = await getItemRequestById(id, actor);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function createItemRequestHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const actor = requireActor(req);
    const input = parseOrThrow(
      createItemRequestInputSchema.safeParse(req.body),
    );
    const result = await createItemRequest(actor, input);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}

export async function updateItemRequestHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const actor = requireActor(req);
    const id = parseOrThrow(itemRequestIdSchema.safeParse(req.params.id));
    const input = parseOrThrow(
      updateItemRequestInputSchema.safeParse(req.body),
    );
    const result = await updateItemRequest(id, actor, input);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function performItemRequestActionHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const actor = requireActor(req);
    const id = parseOrThrow(itemRequestIdSchema.safeParse(req.params.id));
    const input = parseOrThrow(
      itemRequestActionInputSchema.safeParse(req.body),
    );
    const result = await performItemRequestAction(id, actor, input);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}