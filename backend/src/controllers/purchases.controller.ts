import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import {
  createPurchaseInputSchema,
  deletePurchaseInputSchema,
  purchaseIdSchema,
  purchaseListQuerySchema,
  updatePurchaseInputSchema,
} from "@printing-stationery/shared";
import {
  createPurchase,
  deletePurchase,
  getPurchaseById,
  listPurchases,
  updatePurchase,
} from "../services/purchases.service.js";
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

export async function listPurchasesHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const actor = requireActor(req);
    const query = parseOrThrow(purchaseListQuerySchema.safeParse(req.query));
    const result = await listPurchases(actor, query);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function getPurchaseHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const actor = requireActor(req);
    const id = parseOrThrow(purchaseIdSchema.safeParse(req.params.id));
    const purchase = await getPurchaseById(id, actor);
    res.status(200).json(purchase);
  } catch (error) {
    next(error);
  }
}

export async function createPurchaseHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const actor = requireActor(req);
    const input = parseOrThrow(createPurchaseInputSchema.safeParse(req.body));
    const purchase = await createPurchase(actor, input);
    res.status(201).json(purchase);
  } catch (error) {
    next(error);
  }
}

export async function updatePurchaseHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const actor = requireActor(req);
    const id = parseOrThrow(purchaseIdSchema.safeParse(req.params.id));
    const input = parseOrThrow(updatePurchaseInputSchema.safeParse(req.body));
    const purchase = await updatePurchase(id, actor, input);
    res.status(200).json(purchase);
  } catch (error) {
    next(error);
  }
}

export async function deletePurchaseHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const actor = requireActor(req);
    const id = parseOrThrow(purchaseIdSchema.safeParse(req.params.id));
    const input = parseOrThrow(deletePurchaseInputSchema.safeParse(req.body));
    await deletePurchase(id, actor, input.expectedVersion);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
}
