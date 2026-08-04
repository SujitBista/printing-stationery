import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import {
  branchIdSchema,
  branchListQuerySchema,
  createBranchInputSchema,
  updateBranchInputSchema,
  updateBranchStatusInputSchema,
} from "@printing-stationery/shared";
import {
  createBranch,
  getBranchById,
  listBranches,
  updateBranch,
  updateBranchStatus,
} from "../services/branches.service.js";
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

export async function listBranchesHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const query = parseOrThrow(branchListQuerySchema.safeParse(req.query));
    const result = await listBranches(query);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function getBranchHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = parseOrThrow(branchIdSchema.safeParse(req.params.id));
    const branch = await getBranchById(id);
    res.status(200).json(branch);
  } catch (error) {
    next(error);
  }
}

export async function createBranchHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const input = parseOrThrow(createBranchInputSchema.safeParse(req.body));
    const branch = await createBranch(input);
    res.status(201).json(branch);
  } catch (error) {
    next(error);
  }
}

export async function updateBranchHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = parseOrThrow(branchIdSchema.safeParse(req.params.id));
    const input = parseOrThrow(updateBranchInputSchema.safeParse(req.body));
    const branch = await updateBranch(id, input);
    res.status(200).json(branch);
  } catch (error) {
    next(error);
  }
}

export async function updateBranchStatusHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = parseOrThrow(branchIdSchema.safeParse(req.params.id));
    const input = parseOrThrow(
      updateBranchStatusInputSchema.safeParse(req.body),
    );
    const branch = await updateBranchStatus(id, input);
    res.status(200).json(branch);
  } catch (error) {
    next(error);
  }
}
