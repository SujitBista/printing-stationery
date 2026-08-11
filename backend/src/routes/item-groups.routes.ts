import { Router } from "express";
import {
  createItemGroupHandler,
  getItemGroupHandler,
  listItemGroupsHandler,
  updateItemGroupHandler,
  updateItemGroupStatusHandler,
} from "../controllers/item-groups.controller.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

export const itemGroupsRouter = Router();

const readRoles = requireRole("ADMIN", "MAKER", "CHECKER");
const adminOnly = requireRole("ADMIN");

itemGroupsRouter.get("/", requireAuth, readRoles, listItemGroupsHandler);
itemGroupsRouter.get("/:id", requireAuth, readRoles, getItemGroupHandler);
itemGroupsRouter.post("/", requireAuth, adminOnly, createItemGroupHandler);
itemGroupsRouter.patch(
  "/:id/status",
  requireAuth,
  adminOnly,
  updateItemGroupStatusHandler,
);
itemGroupsRouter.patch("/:id", requireAuth, adminOnly, updateItemGroupHandler);
