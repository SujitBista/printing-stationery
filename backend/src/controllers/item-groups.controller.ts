import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import {
  createItemGroupInputSchema,
  itemGroupIdSchema,
  itemGroupListQuerySchema,
  updateItemGroupInputSchema,
  updateItemGroupStatusInputSchema,
} from "@printing-stationery/shared";
import {
  createItemGroup,
  getItemGroupById,
  listItemGroups,
  updateItemGroup,
  updateItemGroupStatus,
} from "../services/item-groups.service.js";
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

export async function listItemGroupsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const query = parseOrThrow(itemGroupListQuerySchema.safeParse(req.query));
    const result = await listItemGroups(query);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function getItemGroupHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = parseOrThrow(itemGroupIdSchema.safeParse(req.params.id));
    const itemGroup = await getItemGroupById(id);
    res.status(200).json(itemGroup);
  } catch (error) {
    next(error);
  }
}

export async function createItemGroupHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const input = parseOrThrow(createItemGroupInputSchema.safeParse(req.body));
    const itemGroup = await createItemGroup(input);
    res.status(201).json(itemGroup);
  } catch (error) {
    next(error);
  }
}

export async function updateItemGroupHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = parseOrThrow(itemGroupIdSchema.safeParse(req.params.id));
    const input = parseOrThrow(updateItemGroupInputSchema.safeParse(req.body));
    const itemGroup = await updateItemGroup(id, input);
    res.status(200).json(itemGroup);
  } catch (error) {
    next(error);
  }
}

export async function updateItemGroupStatusHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = parseOrThrow(itemGroupIdSchema.safeParse(req.params.id));
    const input = parseOrThrow(
      updateItemGroupStatusInputSchema.safeParse(req.body),
    );
    const itemGroup = await updateItemGroupStatus(id, input);
    res.status(200).json(itemGroup);
  } catch (error) {
    next(error);
  }
}
