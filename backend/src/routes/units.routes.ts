import { Router } from "express";
import {
  createUnitHandler,
  getUnitHandler,
  listUnitsHandler,
  updateUnitHandler,
  updateUnitStatusHandler,
} from "../controllers/units.controller.js";
import {
  confirmUnitImportHandler,
  previewUnitImportHandler,
  unitImportUpload,
} from "../controllers/units-import.controller.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

export const unitsRouter = Router();

const readRoles = requireRole("ADMIN", "MAKER", "CHECKER");
const adminOnly = requireRole("ADMIN");

unitsRouter.get("/", requireAuth, readRoles, listUnitsHandler);
unitsRouter.post(
  "/import/preview",
  requireAuth,
  adminOnly,
  unitImportUpload,
  previewUnitImportHandler,
);
unitsRouter.post(
  "/import/confirm",
  requireAuth,
  adminOnly,
  confirmUnitImportHandler,
);
unitsRouter.get("/:id", requireAuth, readRoles, getUnitHandler);
unitsRouter.post("/", requireAuth, adminOnly, createUnitHandler);
unitsRouter.patch("/:id/status", requireAuth, adminOnly, updateUnitStatusHandler);
unitsRouter.patch("/:id", requireAuth, adminOnly, updateUnitHandler);
