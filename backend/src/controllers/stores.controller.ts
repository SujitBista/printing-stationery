import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import {
  createStoreInputSchema,
  storeIdSchema,
  storeListQuerySchema,
  updateStoreInputSchema,
  updateStoreStatusInputSchema,
} from "@printing-stationery/shared";
import {
  createStore,
  getStoreById,
  listStores,
  updateStore,
  updateStoreStatus,
} from "../services/stores.service.js";
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

export async function listStoresHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const query = parseOrThrow(storeListQuerySchema.safeParse(req.query));
    const result = await listStores(query);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function getStoreHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = parseOrThrow(storeIdSchema.safeParse(req.params.id));
    const store = await getStoreById(id);
    res.status(200).json(store);
  } catch (error) {
    next(error);
  }
}

export async function createStoreHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const input = parseOrThrow(createStoreInputSchema.safeParse(req.body));
    const store = await createStore(input);
    res.status(201).json(store);
  } catch (error) {
    next(error);
  }
}

export async function updateStoreHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = parseOrThrow(storeIdSchema.safeParse(req.params.id));
    const input = parseOrThrow(updateStoreInputSchema.safeParse(req.body));
    const store = await updateStore(id, input);
    res.status(200).json(store);
  } catch (error) {
    next(error);
  }
}

export async function updateStoreStatusHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = parseOrThrow(storeIdSchema.safeParse(req.params.id));
    const input = parseOrThrow(
      updateStoreStatusInputSchema.safeParse(req.body),
    );
    const store = await updateStoreStatus(id, input);
    res.status(200).json(store);
  } catch (error) {
    next(error);
  }
}
