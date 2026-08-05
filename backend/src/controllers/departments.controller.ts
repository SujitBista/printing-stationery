import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import {
  createDepartmentInputSchema,
  departmentIdSchema,
  departmentListQuerySchema,
  updateDepartmentInputSchema,
  updateDepartmentStatusInputSchema,
} from "@printing-stationery/shared";
import {
  createDepartment,
  getDepartmentById,
  listDepartments,
  updateDepartment,
  updateDepartmentStatus,
} from "../services/departments.service.js";
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

export async function listDepartmentsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const query = parseOrThrow(departmentListQuerySchema.safeParse(req.query));
    const result = await listDepartments(query);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function getDepartmentHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = parseOrThrow(departmentIdSchema.safeParse(req.params.id));
    const department = await getDepartmentById(id);
    res.status(200).json(department);
  } catch (error) {
    next(error);
  }
}

export async function createDepartmentHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const input = parseOrThrow(
      createDepartmentInputSchema.safeParse(req.body),
    );
    const department = await createDepartment(input);
    res.status(201).json(department);
  } catch (error) {
    next(error);
  }
}

export async function updateDepartmentHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = parseOrThrow(departmentIdSchema.safeParse(req.params.id));
    const input = parseOrThrow(
      updateDepartmentInputSchema.safeParse(req.body),
    );
    const department = await updateDepartment(id, input);
    res.status(200).json(department);
  } catch (error) {
    next(error);
  }
}

export async function updateDepartmentStatusHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = parseOrThrow(departmentIdSchema.safeParse(req.params.id));
    const input = parseOrThrow(
      updateDepartmentStatusInputSchema.safeParse(req.body),
    );
    const department = await updateDepartmentStatus(id, input);
    res.status(200).json(department);
  } catch (error) {
    next(error);
  }
}
