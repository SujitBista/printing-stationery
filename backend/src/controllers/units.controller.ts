import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import {
  createUnitInputSchema,
  unitIdSchema,
  unitListQuerySchema,
  updateUnitInputSchema,
  updateUnitStatusInputSchema,
} from "@printing-stationery/shared";
import {
  createUnit,
  getUnitById,
  listUnits,
  updateUnit,
  updateUnitStatus,
} from "../services/units.service.js";
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

export async function listUnitsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const query = parseOrThrow(unitListQuerySchema.safeParse(req.query));
    const result = await listUnits(query);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function getUnitHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = parseOrThrow(unitIdSchema.safeParse(req.params.id));
    const unit = await getUnitById(id);
    res.status(200).json(unit);
  } catch (error) {
    next(error);
  }
}

export async function createUnitHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const input = parseOrThrow(createUnitInputSchema.safeParse(req.body));
    const unit = await createUnit(input);
    res.status(201).json(unit);
  } catch (error) {
    next(error);
  }
}

export async function updateUnitHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = parseOrThrow(unitIdSchema.safeParse(req.params.id));
    const input = parseOrThrow(updateUnitInputSchema.safeParse(req.body));
    const unit = await updateUnit(id, input);
    res.status(200).json(unit);
  } catch (error) {
    next(error);
  }
}

export async function updateUnitStatusHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = parseOrThrow(unitIdSchema.safeParse(req.params.id));
    const input = parseOrThrow(
      updateUnitStatusInputSchema.safeParse(req.body),
    );
    const unit = await updateUnitStatus(id, input);
    res.status(200).json(unit);
  } catch (error) {
    next(error);
  }
}
