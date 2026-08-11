import { Router } from "express";
import {
  createUnitHandler,
  getUnitHandler,
  listUnitsHandler,
  updateUnitHandler,
  updateUnitStatusHandler,
} from "../controllers/units.controller.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

export const unitsRouter = Router();

const readRoles = requireRole("ADMIN", "MAKER", "CHECKER");
const adminOnly = requireRole("ADMIN");

unitsRouter.get("/", requireAuth, readRoles, listUnitsHandler);
unitsRouter.get("/:id", requireAuth, readRoles, getUnitHandler);
unitsRouter.post("/", requireAuth, adminOnly, createUnitHandler);
unitsRouter.patch("/:id/status", requireAuth, adminOnly, updateUnitStatusHandler);
unitsRouter.patch("/:id", requireAuth, adminOnly, updateUnitHandler);
