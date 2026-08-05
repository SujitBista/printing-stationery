import { Router } from "express";
import {
  createUnitHandler,
  getUnitHandler,
  listUnitsHandler,
  updateUnitHandler,
  updateUnitStatusHandler,
} from "../controllers/units.controller.js";

export const unitsRouter = Router();

// TODO: Restrict Unit Setup to an administrative permission once authentication is implemented.
unitsRouter.get("/", listUnitsHandler);
unitsRouter.post("/", createUnitHandler);
unitsRouter.patch("/:id/status", updateUnitStatusHandler);
unitsRouter.get("/:id", getUnitHandler);
unitsRouter.patch("/:id", updateUnitHandler);
