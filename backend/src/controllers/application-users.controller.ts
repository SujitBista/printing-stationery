import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import {
  applicationUserIdSchema,
  applicationUserListQuerySchema,
  createApplicationUserInputSchema,
  eligibleEmployeeListQuerySchema,
  resetApplicationUserPasswordInputSchema,
  updateApplicationUserInputSchema,
  updateApplicationUserStatusInputSchema,
} from "@printing-stationery/shared";
import {
  createApplicationUser,
  getApplicationUserById,
  listApplicationUsers,
  listEligibleEmployees,
  resetApplicationUserPassword,
  updateApplicationUser,
  updateApplicationUserStatus,
} from "../services/application-users.service.js";
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

function requireActorUserId(req: Request): string {
  const userId = req.auth?.user.id;
  if (!userId) {
    throw new AppError("Unauthorized", 401);
  }
  return userId;
}

export async function listApplicationUsersHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const query = parseOrThrow(
      applicationUserListQuerySchema.safeParse(req.query),
    );
    const result = await listApplicationUsers(query);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function listEligibleEmployeesHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const query = parseOrThrow(
      eligibleEmployeeListQuerySchema.safeParse(req.query),
    );
    const result = await listEligibleEmployees(query);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function getApplicationUserHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = parseOrThrow(applicationUserIdSchema.safeParse(req.params.id));
    const user = await getApplicationUserById(id);
    res.status(200).json(user);
  } catch (error) {
    next(error);
  }
}

export async function createApplicationUserHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const input = parseOrThrow(
      createApplicationUserInputSchema.safeParse(req.body),
    );
    const user = await createApplicationUser(input);
    res.status(201).json(user);
  } catch (error) {
    next(error);
  }
}

export async function updateApplicationUserHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = parseOrThrow(applicationUserIdSchema.safeParse(req.params.id));
    const input = parseOrThrow(
      updateApplicationUserInputSchema.safeParse(req.body),
    );
    const user = await updateApplicationUser(id, input, requireActorUserId(req));
    res.status(200).json(user);
  } catch (error) {
    next(error);
  }
}

export async function updateApplicationUserStatusHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = parseOrThrow(applicationUserIdSchema.safeParse(req.params.id));
    const input = parseOrThrow(
      updateApplicationUserStatusInputSchema.safeParse(req.body),
    );
    const user = await updateApplicationUserStatus(
      id,
      input,
      requireActorUserId(req),
    );
    res.status(200).json(user);
  } catch (error) {
    next(error);
  }
}

export async function resetApplicationUserPasswordHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = parseOrThrow(applicationUserIdSchema.safeParse(req.params.id));
    const input = parseOrThrow(
      resetApplicationUserPasswordInputSchema.safeParse(req.body),
    );
    const user = await resetApplicationUserPassword(id, input);
    res.status(200).json(user);
  } catch (error) {
    next(error);
  }
}
