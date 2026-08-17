import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import {
  createStoreUserInputSchema,
  eligibleStoreApplicationUserListQuerySchema,
  eligibleStoreUserStoreListQuerySchema,
  storeUserIdSchema,
  storeUserListQuerySchema,
  updateStoreUserInputSchema,
  updateStoreUserStatusInputSchema,
} from "@printing-stationery/shared";
import {
  createStoreUser,
  getStoreUserById,
  listEligibleStoreApplicationUsers,
  listEligibleStores,
  listStoreUsers,
  updateStoreUser,
  updateStoreUserStatus,
} from "../services/store-users.service.js";
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

export async function listStoreUsersHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const query = parseOrThrow(storeUserListQuerySchema.safeParse(req.query));
    const result = await listStoreUsers(query);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function listEligibleStoresHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const query = parseOrThrow(
      eligibleStoreUserStoreListQuerySchema.safeParse(req.query),
    );
    const result = await listEligibleStores(query);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function listEligibleStoreApplicationUsersHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const query = parseOrThrow(
      eligibleStoreApplicationUserListQuerySchema.safeParse(req.query),
    );
    const result = await listEligibleStoreApplicationUsers(query);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function getStoreUserHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = parseOrThrow(storeUserIdSchema.safeParse(req.params.id));
    const assignment = await getStoreUserById(id);
    res.status(200).json(assignment);
  } catch (error) {
    next(error);
  }
}

export async function createStoreUserHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const input = parseOrThrow(createStoreUserInputSchema.safeParse(req.body));
    const assignment = await createStoreUser(input);
    res.status(201).json(assignment);
  } catch (error) {
    next(error);
  }
}

export async function updateStoreUserHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = parseOrThrow(storeUserIdSchema.safeParse(req.params.id));
    const input = parseOrThrow(updateStoreUserInputSchema.safeParse(req.body));
    const assignment = await updateStoreUser(id, input);
    res.status(200).json(assignment);
  } catch (error) {
    next(error);
  }
}

export async function updateStoreUserStatusHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = parseOrThrow(storeUserIdSchema.safeParse(req.params.id));
    const input = parseOrThrow(
      updateStoreUserStatusInputSchema.safeParse(req.body),
    );
    const assignment = await updateStoreUserStatus(id, input);
    res.status(200).json(assignment);
  } catch (error) {
    next(error);
  }
}
