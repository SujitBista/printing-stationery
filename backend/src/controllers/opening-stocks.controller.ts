import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import { ZodError } from "zod";
import {
  cancelOpeningStockInputSchema,
  createManualOpeningStockInputSchema,
  openingStockIdSchema,
  openingStockListQuerySchema,
  postOpeningStockInputSchema,
  stockBalanceListQuerySchema,
  updateOpeningStockMappingsInputSchema,
} from "@printing-stationery/shared";
import { AppError } from "../utils/errors.js";
import {
  cancelOpeningStockBatch,
  createManualOpeningStockBatch,
  getOpeningStockBatch,
  listOpeningStockBatches,
  listStockBalances,
  postOpeningStockBatch,
  previewLegacyOpeningStockImport,
  updateOpeningStockMappings,
  validateOpeningStockBatch,
} from "../services/opening-stocks.service.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 3 * 1024 * 1024,
    files: 1,
  },
  fileFilter: (_req, file, callback) => {
    if (!file.originalname.toLowerCase().endsWith(".xls")) {
      callback(new AppError("Only the legacy .xls HTML export is accepted.", 400));
      return;
    }
    callback(null, true);
  },
});

const uploadSingle = upload.single("file");

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

export function openingStockUpload(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  uploadSingle(req, res, (error: unknown) => {
    if (error instanceof AppError) {
      next(error);
      return;
    }
    if (error instanceof multer.MulterError) {
      next(new AppError("Invalid file upload.", 400));
      return;
    }
    if (error) {
      next(new AppError("Invalid file upload.", 400));
      return;
    }
    next();
  });
}

export async function listOpeningStockBatchesHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const actor = requireActor(req);
    const query = parseOrThrow(openingStockListQuerySchema.safeParse(req.query));
    const result = await listOpeningStockBatches(actor, query);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function getOpeningStockBatchHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const actor = requireActor(req);
    const batchId = parseOrThrow(openingStockIdSchema.safeParse(req.params.batchId));
    const result = await getOpeningStockBatch(actor, batchId);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function createManualOpeningStockBatchHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const actor = requireActor(req);
    const input = parseOrThrow(createManualOpeningStockInputSchema.safeParse(req.body));
    const result = await createManualOpeningStockBatch(actor, input);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}

export async function previewLegacyOpeningStockImportHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const actor = requireActor(req);
    if (!req.file) {
      throw new AppError("A legacy .xls file is required.", 400);
    }
    const result = await previewLegacyOpeningStockImport(actor, req.file);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}

export async function updateOpeningStockMappingsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const actor = requireActor(req);
    const batchId = parseOrThrow(openingStockIdSchema.safeParse(req.params.batchId));
    const input = parseOrThrow(updateOpeningStockMappingsInputSchema.safeParse(req.body));
    const result = await updateOpeningStockMappings(actor, batchId, input.mappings);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function validateOpeningStockBatchHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const actor = requireActor(req);
    const batchId = parseOrThrow(openingStockIdSchema.safeParse(req.params.batchId));
    const result = await validateOpeningStockBatch(actor, batchId);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function postOpeningStockBatchHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const actor = requireActor(req);
    const batchId = parseOrThrow(openingStockIdSchema.safeParse(req.params.batchId));
    const input = parseOrThrow(postOpeningStockInputSchema.safeParse(req.body));
    const result = await postOpeningStockBatch(actor, batchId, input);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function cancelOpeningStockBatchHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const actor = requireActor(req);
    const batchId = parseOrThrow(openingStockIdSchema.safeParse(req.params.batchId));
    const input = parseOrThrow(cancelOpeningStockInputSchema.safeParse(req.body));
    const result = await cancelOpeningStockBatch(actor, batchId, input);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
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
