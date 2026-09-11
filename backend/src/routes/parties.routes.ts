import { Router } from "express";
import {
  createPartyHandler,
  deletePartyHandler,
  getPartyHandler,
  listPartiesHandler,
  updatePartyHandler,
  updatePartyStatusHandler,
} from "../controllers/parties.controller.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

export const partiesRouter = Router();

const readRoles = requireRole("ADMIN", "MAKER", "CHECKER");
const adminOnly = requireRole("ADMIN");

partiesRouter.get("/", requireAuth, readRoles, listPartiesHandler);
partiesRouter.get("/:id", requireAuth, readRoles, getPartyHandler);
partiesRouter.post("/", requireAuth, adminOnly, createPartyHandler);
partiesRouter.patch(
  "/:id/status",
  requireAuth,
  adminOnly,
  updatePartyStatusHandler,
);
partiesRouter.patch("/:id", requireAuth, adminOnly, updatePartyHandler);
partiesRouter.delete("/:id", requireAuth, adminOnly, deletePartyHandler);
