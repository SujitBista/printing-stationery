import type { NextFunction, Request, Response } from "express";
import type { AppRole } from "@printing-stationery/shared";
import type { Env } from "../config/env.js";
import {
  resolveSession,
  type AuthContext,
} from "../services/auth.service.js";
import { AppError } from "../utils/errors.js";

export type AuthenticatedRequest = Request & {
  auth: AuthContext;
  env: Env;
};

declare module "express-serve-static-core" {
  interface Request {
    auth?: AuthContext;
    env?: Env;
  }
}

export function attachEnv(env: Env) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    req.env = env;
    next();
  };
}

export async function requireAuth(
  req: Request,
  _res: Response,
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
    const auth = await resolveSession(rawToken, env);
    if (!auth) {
      throw new AppError("Unauthorized", 401);
    }

    req.auth = auth;
    next();
  } catch (error) {
    next(error);
  }
}

export function requireRole(...allowedRoles: AppRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      if (!req.auth) {
        throw new AppError("Unauthorized", 401);
      }

      const hasRole = allowedRoles.some((role) =>
        req.auth!.user.roles.includes(role),
      );

      if (!hasRole) {
        throw new AppError("Forbidden", 403);
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}
