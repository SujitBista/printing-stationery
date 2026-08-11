import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import {
  changeInitialPasswordInputSchema,
  loginInputSchema,
} from "@printing-stationery/shared";
import {
  changeInitialPassword,
  getCurrentUser,
  login,
  logout,
} from "../services/auth.service.js";
import { AppError } from "../utils/errors.js";
import {
  clearSessionCookie,
  setSessionCookie,
} from "../utils/session-cookie.js";

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

function clientIp(req: Request): string | undefined {
  // trust proxy is not enabled; use the direct socket address only.
  return req.socket.remoteAddress ?? undefined;
}

export async function loginHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const env = req.env;
    if (!env) {
      throw new AppError("Server misconfiguration", 500);
    }

    const input = parseOrThrow(loginInputSchema.safeParse(req.body));
    const result = await login(input, env, {
      userAgent: req.get("user-agent") ?? undefined,
      ipAddress: clientIp(req),
    });

    setSessionCookie(res, env, result.sessionToken);
    res.status(200).json({ user: result.user });
  } catch (error) {
    next(error);
  }
}

export async function logoutHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const env = req.env;
    if (!env) {
      throw new AppError("Server misconfiguration", 500);
    }

    const rawToken = req.cookies?.[env.SESSION_COOKIE_NAME] as
      | string
      | undefined;
    await logout(rawToken);
    clearSessionCookie(res, env);
    res.status(200).json({ ok: true });
  } catch (error) {
    next(error);
  }
}

export async function meHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const env = req.env;
    if (!env) {
      throw new AppError("Server misconfiguration", 500);
    }

    const rawToken = req.cookies?.[env.SESSION_COOKIE_NAME] as
      | string
      | undefined;
    const user = await getCurrentUser(rawToken, env);
    res.status(200).json({ user });
  } catch (error) {
    next(error);
  }
}

export async function changeInitialPasswordHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.auth) {
      throw new AppError("Unauthorized", 401);
    }

    const input = parseOrThrow(
      changeInitialPasswordInputSchema.safeParse(req.body),
    );
    const user = await changeInitialPassword(req.auth, input);
    res.status(200).json({ user });
  } catch (error) {
    next(error);
  }
}
