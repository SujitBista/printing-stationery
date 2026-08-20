import { Router } from "express";
import {
  createBranchHandler,
  getBranchHandler,
  listBranchesHandler,
  updateBranchHandler,
  updateBranchStatusHandler,
} from "../controllers/branches.controller.js";
import {
  branchImportUpload,
  confirmBranchImportHandler,
  previewBranchImportHandler,
} from "../controllers/branches-import.controller.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

export const branchesRouter = Router();

const readRoles = requireRole("ADMIN", "MAKER", "CHECKER");
const adminOnly = requireRole("ADMIN");

branchesRouter.get("/", requireAuth, readRoles, listBranchesHandler);
branchesRouter.post(
  "/import/preview",
  requireAuth,
  adminOnly,
  branchImportUpload,
  previewBranchImportHandler,
);
branchesRouter.post(
  "/import/confirm",
  requireAuth,
  adminOnly,
  confirmBranchImportHandler,
);
branchesRouter.get("/:id", requireAuth, readRoles, getBranchHandler);
branchesRouter.post("/", requireAuth, adminOnly, createBranchHandler);
branchesRouter.patch("/:id/status", requireAuth, adminOnly, updateBranchStatusHandler);
branchesRouter.patch("/:id", requireAuth, adminOnly, updateBranchHandler);
