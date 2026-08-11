import { Router } from "express";
import {
  createDepartmentHandler,
  getDepartmentHandler,
  listDepartmentsHandler,
  updateDepartmentHandler,
  updateDepartmentStatusHandler,
} from "../controllers/departments.controller.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

export const departmentsRouter = Router();

const readRoles = requireRole("ADMIN", "MAKER", "CHECKER");
const adminOnly = requireRole("ADMIN");

departmentsRouter.get("/", requireAuth, readRoles, listDepartmentsHandler);
departmentsRouter.get("/:id", requireAuth, readRoles, getDepartmentHandler);
departmentsRouter.post("/", requireAuth, adminOnly, createDepartmentHandler);
departmentsRouter.patch(
  "/:id/status",
  requireAuth,
  adminOnly,
  updateDepartmentStatusHandler,
);
departmentsRouter.patch("/:id", requireAuth, adminOnly, updateDepartmentHandler);
