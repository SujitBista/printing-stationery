import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import {
  createItemInputSchema,
  itemIdSchema,
  itemListQuerySchema,
  updateItemInputSchema,
  updateItemStatusInputSchema,
} from "@printing-stationery/shared";
import {
  createItem,
  getItemById,
  listItems,
  updateItem,
  updateItemStatus,
} from "../services/items.service.js";
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

export async function listItemsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const query = parseOrThrow(itemListQuerySchema.safeParse(req.query));
    const result = await listItems(query);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function getItemHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = parseOrThrow(itemIdSchema.safeParse(req.params.id));
    const item = await getItemById(id);
    res.status(200).json(item);
  } catch (error) {
    next(error);
  }
}

export async function createItemHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const input = parseOrThrow(createItemInputSchema.safeParse(req.body));
    const item = await createItem(input);
    res.status(201).json(item);
  } catch (error) {
    next(error);
  }
}

export async function updateItemHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = parseOrThrow(itemIdSchema.safeParse(req.params.id));
    const input = parseOrThrow(updateItemInputSchema.safeParse(req.body));
    const item = await updateItem(id, input);
    res.status(200).json(item);
  } catch (error) {
    next(error);
  }
}

export async function updateItemStatusHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = parseOrThrow(itemIdSchema.safeParse(req.params.id));
    const input = parseOrThrow(
      updateItemStatusInputSchema.safeParse(req.body),
    );
    const item = await updateItemStatus(id, input);
    res.status(200).json(item);
  } catch (error) {
    next(error);
  }
}
