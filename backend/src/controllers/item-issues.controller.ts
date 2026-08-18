import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import {
  createItemIssueInputSchema,
  itemIssueIdSchema,
  itemIssueListQuerySchema,
  itemRequestIdSchema,
  submitItemIssueInputSchema,
  updateItemIssueInputSchema,
} from "@printing-stationery/shared";
import {
  createItemIssueFromRequest,
  getItemIssueById,
  getItemIssueEligibility,
  listItemIssues,
  submitItemIssue,
  updateItemIssue,
} from "../services/item-issues.service.js";
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

export async function getItemIssueEligibilityHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const actor = requireActor(req);
    const requestId = parseOrThrow(itemRequestIdSchema.safeParse(req.params.requestId));
    const result = await getItemIssueEligibility(requestId, actor);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function createItemIssueFromRequestHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const actor = requireActor(req);
    const requestId = parseOrThrow(itemRequestIdSchema.safeParse(req.params.requestId));
    const input = parseOrThrow(createItemIssueInputSchema.safeParse(req.body));
    const result = await createItemIssueFromRequest(requestId, actor, input);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}

export async function listItemIssuesHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const actor = requireActor(req);
    const query = parseOrThrow(itemIssueListQuerySchema.safeParse(req.query));
    const result = await listItemIssues(actor, query);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function getItemIssueHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const actor = requireActor(req);
    const issueId = parseOrThrow(itemIssueIdSchema.safeParse(req.params.issueId));
    const result = await getItemIssueById(issueId, actor);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function updateItemIssueHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const actor = requireActor(req);
    const issueId = parseOrThrow(itemIssueIdSchema.safeParse(req.params.issueId));
    const input = parseOrThrow(updateItemIssueInputSchema.safeParse(req.body));
    const result = await updateItemIssue(issueId, actor, input);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function submitItemIssueHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const actor = requireActor(req);
    const issueId = parseOrThrow(itemIssueIdSchema.safeParse(req.params.issueId));
    const input = parseOrThrow(submitItemIssueInputSchema.safeParse(req.body));
    const result = await submitItemIssue(issueId, actor, input);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}
