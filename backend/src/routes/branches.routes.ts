import { Router } from "express";
import {
  createBranchHandler,
  getBranchHandler,
  listBranchesHandler,
  updateBranchHandler,
  updateBranchStatusHandler,
} from "../controllers/branches.controller.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

export const branchesRouter = Router();

const readRoles = requireRole("ADMIN", "MAKER", "CHECKER");
const adminOnly = requireRole("ADMIN");

branchesRouter.get("/", requireAuth, readRoles, listBranchesHandler);
branchesRouter.get("/:id", requireAuth, readRoles, getBranchHandler);
branchesRouter.post("/", requireAuth, adminOnly, createBranchHandler);
branchesRouter.patch("/:id/status", requireAuth, adminOnly, updateBranchStatusHandler);
branchesRouter.patch("/:id", requireAuth, adminOnly, updateBranchHandler);
