import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import {
  createEmployeeInputSchema,
  employeeIdSchema,
  employeeListQuerySchema,
  transferEmployeeInputSchema,
  updateEmployeeInputSchema,
  updateEmployeeStatusInputSchema,
} from "@printing-stationery/shared";
import {
  createEmployee,
  getEmployeeById,
  getEmployeeTransferContext,
  listEmployeeTransfers,
  listEmployees,
  transferEmployee,
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

function requireActor(req: Request) {
  if (!req.auth) {
    throw new AppError("Unauthorized", 401);
  }
  return req.auth.user;
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

export async function getEmployeeTransferContextHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = parseOrThrow(employeeIdSchema.safeParse(req.params.id));
    const context = await getEmployeeTransferContext(id);
    res.status(200).json(context);
  } catch (error) {
    next(error);
  }
}

export async function listEmployeeTransfersHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = parseOrThrow(employeeIdSchema.safeParse(req.params.id));
    const result = await listEmployeeTransfers(id);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function transferEmployeeHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const actor = requireActor(req);
    const id = parseOrThrow(employeeIdSchema.safeParse(req.params.id));
    const input = parseOrThrow(transferEmployeeInputSchema.safeParse(req.body));
    const employee = await transferEmployee(id, input, actor.id);
    res.status(200).json(employee);
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
