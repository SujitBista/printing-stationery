import { Router } from "express";
import {
  createBranchHandler,
  getBranchHandler,
  listBranchesHandler,
  updateBranchHandler,
  updateBranchStatusHandler,
} from "../controllers/branches.controller.js";

export const branchesRouter = Router();

// TODO: Restrict Branch Setup to an administrative permission once authentication is implemented.
branchesRouter.get("/", listBranchesHandler);
branchesRouter.post("/", createBranchHandler);
branchesRouter.patch("/:id/status", updateBranchStatusHandler);
branchesRouter.get("/:id", getBranchHandler);
branchesRouter.patch("/:id", updateBranchHandler);
