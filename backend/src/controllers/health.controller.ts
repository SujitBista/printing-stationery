import type { Request, Response, NextFunction } from "express";
import { getHealthStatus } from "../services/health.service.js";

export async function getHealth(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const health = await getHealthStatus();
    res.status(200).json(health);
  } catch (error) {
    next(error);
  }
}
