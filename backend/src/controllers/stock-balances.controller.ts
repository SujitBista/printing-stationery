import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import {
  confirmLegacyOpeningInTransitInputSchema,
  openingStockLineIdSchema,
  stockBalanceListQuerySchema,
  stockLedgerListQuerySchema,
} from "@printing-stationery/shared";
import {
  listStockBalances,
  listStockLedgerEntries,
} from "../services/stock-balances.service.js";
import { confirmLegacyOpeningInTransitReceipt } from "../services/opening-stock-in-transit.service.js";
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

export async function listStockBalancesHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const actor = requireActor(req);
    const query = parseOrThrow(stockBalanceListQuerySchema.safeParse(req.query));
    const result = await listStockBalances(actor, query);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function listStockLedgerHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const actor = requireActor(req);
    const query = parseOrThrow(stockLedgerListQuerySchema.safeParse(req.query));
    const result = await listStockLedgerEntries(actor, query);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function confirmLegacyOpeningInTransitHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const actor = requireActor(req);
    const lineId = parseOrThrow(
      openingStockLineIdSchema.safeParse(req.params.lineId),
    );
    const input = parseOrThrow(
      confirmLegacyOpeningInTransitInputSchema.safeParse(req.body),
    );
    const result = await confirmLegacyOpeningInTransitReceipt(actor, lineId, input);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}
