import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import { ZodError } from "zod";
import { unitImportConfirmInputSchema } from "@printing-stationery/shared";
import {
  confirmUnitImport,
  previewUnitImport,
} from "../services/units-import.service.js";
import { AppError } from "../utils/errors.js";
import { UNIT_IMPORT_MAX_FILE_BYTES } from "../utils/unit-import-xlsx.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: UNIT_IMPORT_MAX_FILE_BYTES,
    files: 1,
  },
  fileFilter: (_req, file, callback) => {
    const originalName = file.originalname.toLowerCase();
    const isXlsxExtension = originalName.endsWith(".xlsx");
    const isXlsxMime =
      file.mimetype ===
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      file.mimetype === "application/octet-stream" ||
      file.mimetype === "";

    if (!isXlsxExtension || !isXlsxMime) {
      callback(new AppError("Only .xlsx files are accepted.", 400));
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

function toUploadAppError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }

  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return new AppError(
        `File exceeds the maximum size of ${Math.floor(UNIT_IMPORT_MAX_FILE_BYTES / (1024 * 1024))} MB.`,
        400,
      );
    }

    return new AppError("Invalid file upload.", 400);
  }

  return new AppError("Invalid file upload.", 400);
}

export function unitImportUpload(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  uploadSingle(req, res, (error: unknown) => {
    if (error) {
      next(toUploadAppError(error));
      return;
    }
    next();
  });
}

export async function previewUnitImportHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const file = req.file;
    if (!file) {
      throw new AppError("An .xlsx file is required.", 400);
    }

    if (!file.originalname.toLowerCase().endsWith(".xlsx")) {
      throw new AppError("Only .xlsx files are accepted.", 400);
    }

    const preview = await previewUnitImport(file.buffer);
    res.status(200).json(preview);
  } catch (error) {
    next(error);
  }
}

export async function confirmUnitImportHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const input = parseOrThrow(unitImportConfirmInputSchema.safeParse(req.body));
    const result = await confirmUnitImport(input);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}
