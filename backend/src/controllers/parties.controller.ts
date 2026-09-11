import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import {
  createPartyInputSchema,
  partyIdSchema,
  partyListQuerySchema,
  updatePartyInputSchema,
  updatePartyStatusInputSchema,
} from "@printing-stationery/shared";
import {
  createParty,
  deleteParty,
  getPartyById,
  listParties,
  updateParty,
  updatePartyStatus,
} from "../services/parties.service.js";
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

export async function listPartiesHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const query = parseOrThrow(partyListQuerySchema.safeParse(req.query));
    const result = await listParties(query);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function getPartyHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = parseOrThrow(partyIdSchema.safeParse(req.params.id));
    const party = await getPartyById(id);
    res.status(200).json(party);
  } catch (error) {
    next(error);
  }
}

export async function createPartyHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const input = parseOrThrow(createPartyInputSchema.safeParse(req.body));
    const party = await createParty(input);
    res.status(201).json(party);
  } catch (error) {
    next(error);
  }
}

export async function updatePartyHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = parseOrThrow(partyIdSchema.safeParse(req.params.id));
    const input = parseOrThrow(updatePartyInputSchema.safeParse(req.body));
    const party = await updateParty(id, input);
    res.status(200).json(party);
  } catch (error) {
    next(error);
  }
}

export async function updatePartyStatusHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = parseOrThrow(partyIdSchema.safeParse(req.params.id));
    const input = parseOrThrow(
      updatePartyStatusInputSchema.safeParse(req.body),
    );
    const party = await updatePartyStatus(id, input);
    res.status(200).json(party);
  } catch (error) {
    next(error);
  }
}

export async function deletePartyHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = parseOrThrow(partyIdSchema.safeParse(req.params.id));
    await deleteParty(id);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}
