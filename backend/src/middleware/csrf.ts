import type { NextFunction, Request, Response } from "express";
import type { Env } from "../config/env.js";
import { AppError } from "../utils/errors.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function originMatches(frontendOrigin: string, candidate: string): boolean {
  try {
    const expected = new URL(frontendOrigin);
    const actual = new URL(candidate);
    return (
      expected.protocol === actual.protocol &&
      expected.host === actual.host
    );
  } catch {
    return false;
  }
}

/**
 * CSRF defense for cookie-authenticated state-changing requests.
 * SameSite=Lax alone is not treated as sufficient. Validate Origin
 * (preferred) or Referer against the configured FRONTEND_ORIGIN.
 * Requests without either header are rejected.
 */
export function csrfProtection(env: Env) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (SAFE_METHODS.has(req.method.toUpperCase())) {
      next();
      return;
    }

    const origin = req.get("origin");
    if (origin) {
      if (!originMatches(env.FRONTEND_ORIGIN, origin)) {
        next(new AppError("Forbidden", 403));
        return;
      }
      next();
      return;
    }

    const referer = req.get("referer");
    if (referer) {
      if (!originMatches(env.FRONTEND_ORIGIN, referer)) {
        next(new AppError("Forbidden", 403));
        return;
      }
      next();
      return;
    }

    next(new AppError("Forbidden", 403));
  };
}
