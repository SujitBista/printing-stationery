import { Router } from "express";
import {
  createEmployeeHandler,
  getEmployeeHandler,
  listEmployeesHandler,
  updateEmployeeHandler,
  updateEmployeeStatusHandler,
} from "../controllers/employees.controller.js";

export const employeesRouter = Router();

// TODO: Restrict Employee Setup to an administrative permission once authentication is implemented.
employeesRouter.get("/", listEmployeesHandler);
employeesRouter.post("/", createEmployeeHandler);
employeesRouter.patch("/:id/status", updateEmployeeStatusHandler);
employeesRouter.get("/:id", getEmployeeHandler);
employeesRouter.patch("/:id", updateEmployeeHandler);
