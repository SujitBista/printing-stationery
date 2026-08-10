import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import {
  createEmployeeInputSchema,
  employeeIdSchema,
  employeeListQuerySchema,
  updateEmployeeInputSchema,
  updateEmployeeStatusInputSchema,
} from "@printing-stationery/shared";
import {
  createEmployee,
  getEmployeeById,
  listEmployees,
  updateEmployee,
  updateEmployeeStatus,
} from "../services/employees.service.js";
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

export async function listEmployeesHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const query = parseOrThrow(employeeListQuerySchema.safeParse(req.query));
    const result = await listEmployees(query);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function getEmployeeHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = parseOrThrow(employeeIdSchema.safeParse(req.params.id));
    const employee = await getEmployeeById(id);
    res.status(200).json(employee);
  } catch (error) {
    next(error);
  }
}

export async function createEmployeeHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const input = parseOrThrow(createEmployeeInputSchema.safeParse(req.body));
    const employee = await createEmployee(input);
    res.status(201).json(employee);
  } catch (error) {
    next(error);
  }
}

export async function updateEmployeeHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = parseOrThrow(employeeIdSchema.safeParse(req.params.id));
    const input = parseOrThrow(updateEmployeeInputSchema.safeParse(req.body));
    const employee = await updateEmployee(id, input);
    res.status(200).json(employee);
  } catch (error) {
    next(error);
  }
}

export async function updateEmployeeStatusHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = parseOrThrow(employeeIdSchema.safeParse(req.params.id));
    const input = parseOrThrow(
      updateEmployeeStatusInputSchema.safeParse(req.body),
    );
    const employee = await updateEmployeeStatus(id, input);
    res.status(200).json(employee);
  } catch (error) {
    next(error);
  }
}
