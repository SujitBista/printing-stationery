import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import {
  notificationIdSchema,
  notificationListQuerySchema,
} from "@printing-stationery/shared";
import {
  getNotificationUnreadCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "../services/notifications.service.js";
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

export async function listNotificationsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const actor = requireActor(req);
    const query = parseOrThrow(notificationListQuerySchema.safeParse(req.query));
    const result = await listNotifications(actor.id, query);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function getNotificationUnreadCountHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const actor = requireActor(req);
    const result = await getNotificationUnreadCount(actor.id);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function markNotificationReadHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const actor = requireActor(req);
    const id = parseOrThrow(notificationIdSchema.safeParse(req.params.id));
    const result = await markNotificationRead(id, actor.id);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function markAllNotificationsReadHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const actor = requireActor(req);
    const result = await markAllNotificationsRead(actor.id);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}
