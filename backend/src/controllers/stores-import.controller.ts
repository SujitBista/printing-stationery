import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import { ZodError } from "zod";
import { storeImportConfirmInputSchema } from "@printing-stationery/shared";
import {
  confirmStoreImport,
  previewStoreImport,
} from "../services/stores-import.service.js";
import { AppError } from "../utils/errors.js";
import { STORE_IMPORT_MAX_FILE_BYTES } from "../utils/store-import-xlsx.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: STORE_IMPORT_MAX_FILE_BYTES,
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
        `File exceeds the maximum size of ${Math.floor(STORE_IMPORT_MAX_FILE_BYTES / (1024 * 1024))} MB.`,
        400,
      );
    }

    return new AppError("Invalid file upload.", 400);
  }

  return new AppError("Invalid file upload.", 400);
}

export function storeImportUpload(
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

export async function previewStoreImportHandler(
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

    const preview = await previewStoreImport(file.buffer);
    res.status(200).json(preview);
  } catch (error) {
    next(error);
  }
}

export async function confirmStoreImportHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const input = parseOrThrow(storeImportConfirmInputSchema.safeParse(req.body));
    const result = await confirmStoreImport(input);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}
