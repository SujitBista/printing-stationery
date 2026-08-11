import type { CookieOptions, Response } from "express";
import type { Env } from "../config/env.js";

export function sessionCookieOptions(env: Env): CookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: env.COOKIE_SECURE,
    path: "/",
    maxAge: env.SESSION_DURATION_HOURS * 60 * 60 * 1000,
  };
}

export function clearSessionCookie(res: Response, env: Env): void {
  res.clearCookie(env.SESSION_COOKIE_NAME, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.COOKIE_SECURE,
    path: "/",
  });
}

export function setSessionCookie(
  res: Response,
  env: Env,
  token: string,
): void {
  res.cookie(env.SESSION_COOKIE_NAME, token, sessionCookieOptions(env));
}
