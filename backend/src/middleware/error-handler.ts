import type { NextFunction, Request, Response } from "express";
import { AppError } from "../utils/errors.js";

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: {
        message: err.message,
      },
    });
    return;
  }

  console.error("Unhandled error:", err);

  res.status(500).json({
    error: {
      message: "Internal server error",
    },
  });
}
