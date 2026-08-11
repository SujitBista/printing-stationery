import { Router } from "express";
import {
  createStoreHandler,
  getStoreHandler,
  listStoresHandler,
  updateStoreHandler,
  updateStoreStatusHandler,
} from "../controllers/stores.controller.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

export const storesRouter = Router();

const readRoles = requireRole("ADMIN", "MAKER", "CHECKER");
const adminOnly = requireRole("ADMIN");

storesRouter.get("/", requireAuth, readRoles, listStoresHandler);
storesRouter.get("/:id", requireAuth, readRoles, getStoreHandler);
storesRouter.post("/", requireAuth, adminOnly, createStoreHandler);
storesRouter.patch("/:id/status", requireAuth, adminOnly, updateStoreStatusHandler);
storesRouter.patch("/:id", requireAuth, adminOnly, updateStoreHandler);
