import { Router } from "express";
import {
  createEmployeeHandler,
  getEmployeeHandler,
  getEmployeeTransferContextHandler,
  listEmployeeTransfersHandler,
  listEmployeesHandler,
  transferEmployeeHandler,
  updateEmployeeHandler,
  updateEmployeeStatusHandler,
} from "../controllers/employees.controller.js";
import {
  confirmEmployeeImportHandler,
  employeeImportUpload,
  previewEmployeeImportHandler,
} from "../controllers/employees-import.controller.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

export const employeesRouter = Router();

const readRoles = requireRole("ADMIN", "MAKER", "CHECKER");
const adminOnly = requireRole("ADMIN");

employeesRouter.get("/", requireAuth, readRoles, listEmployeesHandler);
employeesRouter.post(
  "/import/preview",
  requireAuth,
  adminOnly,
  employeeImportUpload,
  previewEmployeeImportHandler,
);
employeesRouter.post(
  "/import/confirm",
  requireAuth,
  adminOnly,
  confirmEmployeeImportHandler,
);
employeesRouter.get("/:id", requireAuth, readRoles, getEmployeeHandler);
employeesRouter.get(
  "/:id/transfer-context",
  requireAuth,
  readRoles,
  getEmployeeTransferContextHandler,
);
employeesRouter.get(
  "/:id/transfers",
  requireAuth,
  readRoles,
  listEmployeeTransfersHandler,
);
employeesRouter.post(
  "/:id/transfer",
  requireAuth,
  adminOnly,
  transferEmployeeHandler,
);
employeesRouter.post("/", requireAuth, adminOnly, createEmployeeHandler);
employeesRouter.patch(
  "/:id/status",
  requireAuth,
  adminOnly,
  updateEmployeeStatusHandler,
);
employeesRouter.patch("/:id", requireAuth, adminOnly, updateEmployeeHandler);
