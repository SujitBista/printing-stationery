import { Router } from "express";
import {
  createItemHandler,
  getItemHandler,
  listItemsHandler,
  updateItemHandler,
  updateItemStatusHandler,
} from "../controllers/items.controller.js";
import {
  confirmItemImportHandler,
  itemImportUpload,
  previewItemImportHandler,
} from "../controllers/items-import.controller.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

export const itemsRouter = Router();

const readRoles = requireRole("ADMIN", "MAKER", "CHECKER");
const adminOnly = requireRole("ADMIN");

itemsRouter.get("/", requireAuth, readRoles, listItemsHandler);
itemsRouter.post(
  "/import/preview",
  requireAuth,
  adminOnly,
  itemImportUpload,
  previewItemImportHandler,
);
itemsRouter.post(
  "/import/confirm",
  requireAuth,
  adminOnly,
  confirmItemImportHandler,
);
itemsRouter.get("/:id", requireAuth, readRoles, getItemHandler);
itemsRouter.post("/", requireAuth, adminOnly, createItemHandler);
itemsRouter.patch("/:id/status", requireAuth, adminOnly, updateItemStatusHandler);
itemsRouter.patch("/:id", requireAuth, adminOnly, updateItemHandler);
