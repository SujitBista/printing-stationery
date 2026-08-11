import { Router } from "express";
import {
  createEmployeeHandler,
  getEmployeeHandler,
  listEmployeesHandler,
  updateEmployeeHandler,
  updateEmployeeStatusHandler,
} from "../controllers/employees.controller.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

export const employeesRouter = Router();

const readRoles = requireRole("ADMIN", "MAKER", "CHECKER");
const adminOnly = requireRole("ADMIN");

employeesRouter.get("/", requireAuth, readRoles, listEmployeesHandler);
employeesRouter.get("/:id", requireAuth, readRoles, getEmployeeHandler);
employeesRouter.post("/", requireAuth, adminOnly, createEmployeeHandler);
employeesRouter.patch(
  "/:id/status",
  requireAuth,
  adminOnly,
  updateEmployeeStatusHandler,
);
employeesRouter.patch("/:id", requireAuth, adminOnly, updateEmployeeHandler);
