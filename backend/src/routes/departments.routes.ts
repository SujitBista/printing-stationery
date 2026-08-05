import { Router } from "express";
import {
  createDepartmentHandler,
  getDepartmentHandler,
  listDepartmentsHandler,
  updateDepartmentHandler,
  updateDepartmentStatusHandler,
} from "../controllers/departments.controller.js";

export const departmentsRouter = Router();

// TODO: Restrict Department Setup to an administrative permission once authentication is implemented.
departmentsRouter.get("/", listDepartmentsHandler);
departmentsRouter.post("/", createDepartmentHandler);
departmentsRouter.patch("/:id/status", updateDepartmentStatusHandler);
departmentsRouter.get("/:id", getDepartmentHandler);
departmentsRouter.patch("/:id", updateDepartmentHandler);
